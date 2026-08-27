// Room capacity harness: ramps concurrent rooms against a real Colyseus server
// and reports the tick rate each room actually achieves.
//
// The clients are deliberately cheap — no autopilot policy, no world parsing —
// so the server stays the bottleneck rather than the generator. Both processes
// live on this machine, so CPU is sampled per PID and reported separately: if
// the generator is eating a large share at the failing step, the number is a
// floor, not the server's ceiling.
//
//   node scripts/run-room-load.mjs --steps 1,2,5,10,20,40 --hold 30
//   node scripts/run-room-load.mjs --steps 1,10 --hold 20 --json

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@colyseus/sdk";
import {
  PROTOCOL_VERSION,
  ROOM_TYPE,
  clientMessage,
  serverLatencyProbeSchema,
  serverMessage
} from "@spaceship-defender/protocol";

const STEP_MS = 50;
const NOMINAL_HZ = 1000 / STEP_MS;
const JOIN_CONCURRENCY = 4;
const ROLES = ["Pilot", "Gunner", "Shield"];

function readFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

const asJson = process.argv.includes("--json");
const port = Number(readFlag("port", "35679"));
const holdSeconds = Number(readFlag("hold", "30"));
const steps = String(readFlag("steps", "1,2,5,10,20,40"))
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isSafeInteger(value) && value > 0)
  .sort((left, right) => left - right);
const toleranceHz = Number(readFlag("tolerance", "1"));

const statsEndpoint = `http://127.0.0.1:${String(port)}/stats/rooms.json`;
const serverEntry = fileURLToPath(new URL("../../server/dist/index.js", import.meta.url));
// `--import` takes a specifier, not a Windows path: `E:\...` fails to resolve.
const guard = new URL("../../../scripts/owned-process-guard.mjs", import.meta.url).href;

const serverCount = Math.max(1, Number(readFlag("servers", "1")));
const heavy = process.argv.includes("--heavy");
let serverStderr = "";

/**
 * Rooms reach the entity caps only after several waves, which costs minutes of
 * wall clock per step. Instead, derive a preset whose very first wave already
 * buys the cap and whose enemies survive being shot at, so every room sits near
 * worst case from the moment it goes active.
 */
async function writeHeavyPreset(presetPath) {
  const probePort = port + serverCount + 1;
  const probe = spawn(process.execPath, ["--import", guard, serverEntry], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(probePort),
      BALANCE_PRESET_PATH: join(tmpdir(), `probe-${randomUUID()}.json`)
    },
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true
  });
  try {
    const defaultsUrl = `http://127.0.0.1:${String(probePort)}/admin/balance/defaults`;
    let document;
    await waitFor(
      async () => {
        try {
          const response = await fetch(defaultsUrl);
          if (!response.ok) return false;
          document = await response.json();
          return true;
        } catch {
          return false;
        }
      },
      30_000,
      "balance defaults"
    );
    const tuning = document.presets[0].tuning;
    const director = tuning.waveCampaign.director;
    director.baseBudget = director.budgetCap;
    // The schema wants a positive integer here, and the base budget already
    // sits at the cap, so the growth term is clamped away regardless.
    director.budgetGrowth = 1;
    tuning.waveCampaign.waves = [];
    // One tick between spawns, so a room reaches its caps in seconds.
    tuning.enemySpawnIntervalTicks = 1;
    // Ten times the hit points, so the crews cannot clear the arena faster than
    // the director refills it and the room holds its entity count.
    for (const archetype of Object.values(tuning.enemyArchetypes)) archetype.hp *= 10;
    await writeFile(presetPath, JSON.stringify(document), "utf8");
    const check = await fetch(`http://127.0.0.1:${String(probePort)}/admin/balance/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(document)
    });
    const verdict = await check.json();
    if (verdict.valid !== true) {
      throw new Error(`Heavy preset rejected: ${JSON.stringify(verdict).slice(0, 300)}`);
    }
  } finally {
    probe.kill();
  }
}

const presetPath = join(tmpdir(), `load-balance-${randomUUID()}.json`);
if (heavy) await writeHeavyPreset(presetPath);

const servers = Array.from({ length: serverCount }, (_, index) => {
  const serverPort = port + index;
  const child = spawn(process.execPath, ["--import", guard, serverEntry], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(serverPort),
      RECONNECTION_GRACE_SECONDS: "0.25",
      // Without --heavy this path never exists, so the run uses built-in
      // defaults instead of whatever an operator saved from the console.
      BALANCE_PRESET_PATH: presetPath
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true
  });
  child.stderr.on("data", (chunk) => (serverStderr += String(chunk)));
  return {
    child,
    port: serverPort,
    endpoint: `ws://127.0.0.1:${String(serverPort)}`,
    health: `http://127.0.0.1:${String(serverPort)}/health`
  };
});

const rooms = [];
const report = { nominalHz: NOMINAL_HZ, steps: [] };
let failed;

function log(line) {
  if (!asJson) process.stdout.write(`${line}\n`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 20_000, label = "condition") {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForServer() {
  try {
    await waitFor(
      async () => {
        try {
          const checks = await Promise.all(servers.map((server) => fetch(server.health)));
          return checks.every((response) => response.ok);
        } catch {
          return false;
        }
      },
      30_000,
      "server health"
    );
  } catch (error) {
    if (serverStderr.length > 0) process.stderr.write(`server stderr:\n${serverStderr}\n`);
    throw error;
  }
}

const errorCodes = new Map();

/** The SDK warns loudly about unhandled server errors; record the codes instead. */
function attachErrorCollector(room) {
  room.onMessage(serverMessage.error, (payload) => {
    const code = typeof payload?.code === "string" ? payload.code : "unknown";
    errorCodes.set(code, (errorCodes.get(code) ?? 0) + 1);
  });
}

function attachLatencyResponder(room) {
  room.onMessage(serverMessage.latencyProbe, (payload) => {
    const result = serverLatencyProbeSchema.safeParse(payload);
    if (!result.success) return;
    room.send(clientMessage.latencyPong, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: result.data.probeId
    });
  });
}

/** Counts distinct server ticks as patches arrive; no polling, so nothing is missed. */
function watchTicks(entry) {
  entry.display.onStateChange(() => {
    const tick = entry.display.state.game?.tick;
    if (typeof tick !== "number" || tick === entry.lastTick) return;
    entry.lastTick = tick;
    entry.tickCount += 1;
    // Capacity depends on how loaded the rooms are: an early wave holds a
    // handful of entities where the worst-case benchmark room holds 196.
    const world = entry.display.state.game?.display;
    if (world !== undefined) {
      entry.entitySamples += 1;
      entry.entityTotal +=
        (world.enemies?.size ?? 0) +
        (world.asteroids?.size ?? 0) +
        (world.hostileProjectiles?.size ?? 0) +
        (world.homingMissiles?.size ?? 0) +
        (world.friendlyProjectiles?.size ?? 0);
    }
  });
}

async function openRoom(index) {
  const endpoint = servers[index % servers.length].endpoint;
  const display = await new Client(endpoint).create(ROOM_TYPE, {
    role: "display",
    protocolVersion: PROTOCOL_VERSION
  });
  attachLatencyResponder(display);
  attachErrorCollector(display);

  const controllers = [];
  for (const playerName of ROLES) {
    const controller = await new Client(endpoint).joinById(display.roomId, {
      role: "controller",
      protocolVersion: PROTOCOL_VERSION,
      playerName: `${playerName}-${String(index)}`
    });
    attachLatencyResponder(controller);
    attachErrorCollector(controller);
    controllers.push(controller);
  }

  await waitFor(() => display.state.players.size === 3, 20_000, "three controllers");
  for (const controller of controllers) {
    controller.send(clientMessage.ready, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: display.roomId,
      playerId: controller.sessionId,
      runNumber: display.state.runNumber
    });
  }
  await waitFor(
    () => display.state.phase === "active" && display.state.hasGame === true,
    30_000,
    "room to go active"
  );

  const entry = {
    display,
    controllers,
    sequence: 0,
    tickCount: 0,
    lastTick: -1,
    entitySamples: 0,
    entityTotal: 0
  };
  watchTicks(entry);
  return entry;
}

async function growTo(count) {
  const pending = [];
  for (let index = rooms.length; index < count; index += 1) {
    pending.push(index);
  }
  while (pending.length > 0) {
    const batch = pending.splice(0, JOIN_CONCURRENCY);
    const opened = await Promise.all(batch.map((index) => openRoom(index)));
    rooms.push(...opened);
  }
}

/**
 * One self-correcting timer drives every controller. Per-room timers would pile
 * up against the Windows scheduler and turn the generator into the bottleneck.
 */
function startInputPump() {
  const startedAt = performance.now();
  let step = 0;
  let stopped = false;
  const pump = () => {
    if (stopped) return;
    for (const entry of rooms) {
      if (entry.display.state.phase !== "active") continue;
      entry.sequence += 1;
      const envelope = {
        protocolVersion: PROTOCOL_VERSION,
        roomId: entry.display.roomId,
        runNumber: entry.display.state.runNumber
      };
      const [pilot, gunner, shield] = entry.controllers;
      pilot.send(clientMessage.pilotInput, {
        ...envelope,
        playerId: pilot.sessionId,
        sequence: entry.sequence,
        vector: { x: Math.cos(entry.sequence / 40), y: Math.sin(entry.sequence / 40) },
        mgFiring: true
      });
      gunner.send(clientMessage.gunnerInput, {
        ...envelope,
        playerId: gunner.sessionId,
        sequence: entry.sequence,
        aim: { x: Math.cos(entry.sequence / 25), y: Math.sin(entry.sequence / 25) },
        firing: true
      });
      shield.send(clientMessage.shieldInput, {
        ...envelope,
        playerId: shield.sessionId,
        sequence: entry.sequence,
        aim: { x: -Math.cos(entry.sequence / 30), y: -Math.sin(entry.sequence / 30) },
        active: false
      });
    }
    step += 1;
    const dueAt = startedAt + (step + 1) * STEP_MS;
    setTimeout(pump, Math.max(0, dueAt - performance.now()));
  };
  setTimeout(pump, STEP_MS);
  return () => {
    stopped = true;
  };
}

/** CPU milliseconds and working set for one PID, via PowerShell. */
function sampleProcess(pid) {
  return new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        // Ticks and bytes, never formatted floats: a ru-RU locale renders
        // TotalMilliseconds as "1234,56" and Number() then yields NaN.
        `$p = Get-Process -Id ${String(pid)} -ErrorAction SilentlyContinue; ` +
          `if ($p) { [string]$p.TotalProcessorTime.Ticks + " " + [string]$p.WorkingSet64 }`
      ],
      { windowsHide: true }
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.on("close", () => {
      const [ticks, rss] = output.trim().split(/\s+/).map(Number);
      resolve(
        Number.isFinite(ticks) && Number.isFinite(rss)
          ? { cpuMs: ticks / 10_000, rss }
          : { cpuMs: Number.NaN, rss: Number.NaN }
      );
    });
    child.on("error", () => resolve({ cpuMs: 0, rss: 0 }));
  });
}

async function sampleServers() {
  const samples = await Promise.all(servers.map((server) => sampleProcess(server.child.pid)));
  return samples.reduce(
    (total, sample) => ({ cpuMs: total.cpuMs + sample.cpuMs, rss: total.rss + sample.rss }),
    { cpuMs: 0, rss: 0 }
  );
}

async function readRoomCensus() {
  try {
    const response = await fetch(statsEndpoint);
    if (!response.ok) return undefined;
    const snapshot = await response.json();
    return {
      total: snapshot.totalRooms ?? snapshot.rooms?.length,
      statuses: snapshot.statusCounts
    };
  } catch {
    return undefined;
  }
}

async function measureStep(roomCount, baselineHz) {
  await growTo(roomCount);
  // Let the newcomers settle before the window opens.
  await delay(2_000);

  for (const entry of rooms) {
    entry.tickCount = 0;
    entry.entitySamples = 0;
    entry.entityTotal = 0;
  }
  const before = { server: await sampleServers(), self: await sampleProcess(process.pid) };
  const startedAt = performance.now();
  await delay(holdSeconds * 1_000);
  const elapsedMs = performance.now() - startedAt;
  const after = { server: await sampleServers(), self: await sampleProcess(process.pid) };

  const rates = rooms.map((entry) => (entry.tickCount * 1000) / elapsedMs).sort((a, b) => a - b);
  const at = (q) => rates[Math.min(rates.length - 1, Math.floor(rates.length * q))];
  const serverCores = (after.server.cpuMs - before.server.cpuMs) / elapsedMs;
  const generatorCores = (after.self.cpuMs - before.self.cpuMs) / elapsedMs;

  return {
    rooms: roomCount,
    clients: roomCount * 4,
    windowSeconds: Number((elapsedMs / 1000).toFixed(1)),
    tickHz: {
      min: Number(rates[0].toFixed(2)),
      p05: Number(at(0.05).toFixed(2)),
      median: Number(at(0.5).toFixed(2))
    },
    serverCores: Number(serverCores.toFixed(2)),
    generatorCores: Number(generatorCores.toFixed(2)),
    generatorShare: Number((generatorCores / (serverCores + generatorCores || 1)).toFixed(2)),
    serverRssMb: Number((after.server.rss / 1024 / 1024).toFixed(0)),
    census: await readRoomCensus(),
    serverErrors: Object.fromEntries(errorCodes),
    meanEntitiesPerRoom: Number(
      (
        rooms.reduce(
          (sum, e) => sum + (e.entitySamples > 0 ? e.entityTotal / e.entitySamples : 0),
          0
        ) / rooms.length
      ).toFixed(1)
    ),
    passed: rates[0] >= baselineHz - toleranceHz
  };
}

let stopPump = () => {};
try {
  await waitForServer();
  log(
    `${String(serverCount)} server process(es) from port ${String(port)}, nominal ${NOMINAL_HZ.toFixed(0)} Hz, hold ${String(holdSeconds)}s/step`
  );

  // Baseline: one room, measured the same way every later step is measured.
  await growTo(1);
  stopPump = startInputPump();
  const baseline = await measureStep(1, 0);
  const baselineHz = baseline.tickHz.median;
  baseline.passed = true;
  report.baselineHz = baselineHz;
  report.steps.push(baseline);
  log(
    `  baseline   1 room  -> ${baselineHz.toFixed(2)} Hz  server ${baseline.serverCores.toFixed(2)} cores  gen ${baseline.generatorCores.toFixed(2)} cores`
  );

  for (const roomCount of steps) {
    if (roomCount <= 1) continue;
    const result = await measureStep(roomCount, baselineHz);
    report.steps.push(result);
    log(
      `  ${String(roomCount).padStart(4)} rooms (${String(result.clients).padStart(4)} clients) -> ` +
        `min ${result.tickHz.min.toFixed(2)} Hz  median ${result.tickHz.median.toFixed(2)} Hz  ` +
        `server ${result.serverCores.toFixed(2)} cores  gen ${result.generatorCores.toFixed(2)} cores  ` +
        `rss ${String(result.serverRssMb)}MB  ${result.passed ? "ok" : "FAIL"}`
    );
    if (!result.passed) {
      failed = result;
      break;
    }
  }

  const lastPassing = [...report.steps].reverse().find((step) => step.passed);
  report.verdict = {
    baselineHz,
    lastPassingRooms: lastPassing?.rooms ?? 0,
    firstFailingRooms: failed?.rooms,
    generatorBound: failed !== undefined && failed.generatorShare > 0.33,
    rampExhausted: failed === undefined
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    log("");
    log(
      `baseline ${baselineHz.toFixed(2)} Hz; last passing ${String(report.verdict.lastPassingRooms)} rooms`
    );
    if (report.verdict.rampExhausted) {
      log("ramp exhausted without a failing step — raise --steps, this run found no ceiling");
    }
    if (report.verdict.generatorBound) {
      log(
        `generator used ${String(Math.round(failed.generatorShare * 100))}% of the CPU at the failing step — ` +
          "this is a floor, not the server's ceiling; rerun the generator on a second machine"
      );
    }
  }
} finally {
  stopPump();
  for (const entry of rooms) {
    for (const controller of entry.controllers) controller.leave(true);
    entry.display.leave(true);
  }
  await delay(250);
  for (const server of servers) server.child.kill();
}
