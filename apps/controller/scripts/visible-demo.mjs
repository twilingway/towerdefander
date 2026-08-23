import { randomUUID } from "node:crypto";

import { Client } from "@colyseus/sdk";
import {
  PROTOCOL_VERSION,
  clientMessage,
  serverErrorSchema,
  serverLatencyProbeSchema,
  serverMessage
} from "@spaceship-defender/protocol";
import { chromium } from "@playwright/test";

import {
  directAim,
  interceptAim,
  nextShieldActive,
  pilotVector,
  runWaveKey
} from "./visible-demo-policy.mjs";

const STEP_MS = 50;
const TELEMETRY_MS = 100;
const VERIFY_TIMEOUT_MS = 150_000;
const STATUS_EVENT = "spaceship-visible-demo-status";
const displayUrl = process.env.DEMO_DISPLAY_URL ?? "http://127.0.0.1:36173/?demo=1";
const gameServerUrl = process.env.DEMO_GAME_SERVER_URL ?? "ws://127.0.0.1:36567";
const verificationMode = process.env.DEMO_VERIFY === "1";
const headless = process.env.DEMO_HEADLESS === "1";

let browser;
let page;
const roomsByRole = new Map();
const ownedRooms = new Set();
let cleaningUp = false;
let stopRequested = false;
let failure;
let paused = false;
let generation = 0;
let pilotSequence = 0;
let gunnerSequence = 0;
let shieldSequence = 0;
let shieldActive = false;
let latestTelemetry;
let lastTelemetryAt = 0;
let resultObservedAt;
let readySentForRun;
let neutralizedPhaseKey;
let lastStatusAt = 0;
let stopNeutralizationPromise;
let controlWindowStartedAt = Date.now();
let controlBatches = 0;
let measuredControlHz = 0;
const upgradedRunWaves = new Set();
const verification = {
  combat: false,
  movement: false,
  projectile: false,
  shield: false,
  intermission: false,
  upgrades: false,
  wave2: false,
  cadence: false
};
class DemoStopped extends Error {}
const requestStop = () => {
  paused = true;
  measuredControlHz = 0;
  generation += 1;
  stopRequested = true;
  if (roomsByRole.size === 3 && stopNeutralizationPromise === undefined) {
    stopNeutralizationPromise = neutralize().catch(() => undefined);
  }
};
process.once("SIGINT", requestStop);
process.once("SIGTERM", requestStop);
process.on("message", (message) => {
  if (message?.type === "stop") requestStop();
});

try {
  browser = await chromium.launch({
    headless,
    channel: "chrome",
    args: headless
      ? []
      : [
          "--start-maximized",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-features=CalculateNativeWinOcclusion"
        ]
  });
  abortIfStopped();
  browser.on("disconnected", () => {
    if (!cleaningUp) requestStop();
  });
  const context = await browser.newContext({
    viewport: headless ? { width: 1600, height: 900 } : null
  });
  page = await context.newPage();
  abortIfStopped();
  page.on("close", () => {
    if (!cleaningUp) requestStop();
  });
  await page.exposeFunction("__spaceshipVisibleDemoCommand", (command) => {
    if (command === "pause") void pauseAutomation();
    else if (command === "resume") void resumeAutomation();
    else if (command === "stop") requestStop();
  });

  await page.goto(displayUrl, { waitUntil: "domcontentloaded" });
  abortIfStopped();
  await page.getByRole("button", { name: "Создать комнату" }).click();
  abortIfStopped();
  const roomId = (await page.locator(".room-code").innerText()).trim();
  if (roomId.length === 0) throw new Error("Display did not publish a room code.");

  await publishStatus("connecting", "Подключаем pilot, gunner и shield", 0, "lobby");
  for (const playerName of ["Demo Pilot", "Demo Gunner", "Demo Shield"]) {
    const room = await new Client(gameServerUrl).joinById(roomId, {
      role: "controller",
      protocolVersion: PROTOCOL_VERSION,
      playerName
    });
    ownedRooms.add(room);
    abortIfStopped();
    attachLatencyResponder(room);
    attachFailureHandlers(room);
    await waitFor(() => room.state.players?.get(room.sessionId)?.role !== undefined, 4_000);
    const role = room.state.players.get(room.sessionId).role;
    if (roomsByRole.has(role)) throw new Error(`Duplicate authoritative role ${role}.`);
    roomsByRole.set(role, room);
    abortIfStopped();
  }
  assertCrew();
  abortIfStopped();

  for (const room of roomsByRole.values()) room.send(clientMessage.ready, envelope(room));
  await waitFor(
    () => pilotRoom().state.phase === "active" && encounter().phase === "combat",
    8_000
  );
  const startedAt = Date.now();
  await refreshTelemetry();
  const startingPosition = latestTelemetry?.spaceship;
  verification.combat = true;
  await publishStatus("running", "Автопилот ведёт бой", encounter().waveNumber, "combat");
  if (!headless) await page.bringToFront();

  while (!stopRequested) {
    if (failure !== undefined) throw failure;
    if (verificationMode && Date.now() - startedAt > VERIFY_TIMEOUT_MS) {
      throw new Error(`Demo verification timed out: ${JSON.stringify(verification)}.`);
    }

    if (Date.now() - lastTelemetryAt >= TELEMETRY_MS) await refreshTelemetry();
    if (stopRequested) break;
    if (failure !== undefined) throw failure;
    observeVerification(startingPosition);
    const currentEncounter = encounter();

    if (currentEncounter.phase === "combat") {
      resultObservedAt = undefined;
      neutralizedPhaseKey = undefined;
      if (!paused) sendCombatInputs(Date.now() - startedAt, generation);
    } else if (currentEncounter.phase === "intermission") {
      verification.intermission = true;
      await neutralizeForPhase(currentEncounter);
      await chooseAllUpgrades(currentEncounter.waveNumber);
    } else if (currentEncounter.phase === "result") {
      await neutralizeForPhase(currentEncounter);
      resultObservedAt ??= Date.now();
      if (
        !stopRequested &&
        Date.now() - resultObservedAt >= 3_000 &&
        readySentForRun !== pilotRoom().state.runNumber
      ) {
        readySentForRun = pilotRoom().state.runNumber;
        for (const room of roomsByRole.values()) room.send(clientMessage.ready, envelope(room));
      }
    }

    if (Date.now() - lastStatusAt >= 250) {
      lastStatusAt = Date.now();
      await publishStatus(
        paused ? "paused" : "running",
        paused
          ? "Автопилот остановлен; бой на сервере продолжается"
          : statusMessage(currentEncounter),
        currentEncounter.waveNumber,
        currentEncounter.phase
      );
    }

    if (verificationMode && Object.values(verification).every(Boolean)) {
      console.log(`Visible demo verification passed: ${JSON.stringify(verification)}`);
      requestStop();
      continue;
    }
    await delay(STEP_MS);
  }
} catch (error) {
  if (!(error instanceof DemoStopped) && !stopRequested) {
    failure = error instanceof Error ? error : new Error(String(error));
    process.exitCode = 1;
    console.error(`Visible demo failed: ${failure.message}`);
  }
} finally {
  cleaningUp = true;
  process.removeListener("SIGINT", requestStop);
  process.removeListener("SIGTERM", requestStop);
  await (stopNeutralizationPromise ?? neutralize().catch(() => undefined));
  const rooms = [...ownedRooms];
  const leaveOutcomes = await Promise.race([
    Promise.all(
      rooms.map(async (room) => {
        try {
          await room.leave(true);
          return { room, succeeded: true };
        } catch {
          return { room, succeeded: false };
        }
      })
    ),
    delay(2_000).then(() => undefined)
  ]);
  const roomsToForceClose =
    leaveOutcomes === undefined
      ? rooms
      : leaveOutcomes.filter((outcome) => !outcome.succeeded).map((outcome) => outcome.room);
  for (const room of roomsToForceClose) {
    try {
      room.reconnection.enabled = false;
      room.connection.close();
    } catch {
      // The failed transport is already closed.
    }
  }
  if (page !== undefined && !page.isClosed()) {
    try {
      page.once("dialog", (dialog) => void dialog.accept());
      const closeButton = page.getByRole("button", { name: "Закрыть комнату" }).first();
      if (await closeButton.isVisible()) await closeButton.click({ timeout: 1_000 });
    } catch {
      // The browser may have been closed by the user.
    }
  }
  const browserClosed =
    browser === undefined
      ? true
      : await Promise.race([
          browser
            .close()
            .then(() => true)
            .catch(() => false),
          delay(5_000).then(() => false)
        ]);
  const finalExitCode = process.exitCode ?? 0;
  if (!browserClosed && headless) {
    if (process.connected) process.disconnect();
    process.exit(finalExitCode);
  }
  if (!browserClosed && process.send !== undefined) {
    process.send({ type: "force-tree", exitCode: finalExitCode });
    await new Promise(() => undefined);
  }
  if (process.connected) process.disconnect();
  process.exit(finalExitCode);
}

function sendCombatInputs(elapsedMs, expectedGeneration) {
  if (paused || expectedGeneration !== generation) return;
  const telemetry = latestTelemetry;
  const spaceship = telemetry?.spaceship ?? { x: 2_200, y: 2_200 };
  const target = telemetry?.target;
  const threat = telemetry?.threat;

  pilotSequence += 1;
  pilotRoom().send(clientMessage.pilotInput, {
    ...envelope(pilotRoom()),
    sequence: pilotSequence,
    vector: pilotVector(elapsedMs)
  });
  gunnerSequence += 1;
  gunnerRoom().send(clientMessage.gunnerInput, {
    ...envelope(gunnerRoom()),
    sequence: gunnerSequence,
    aim: interceptAim(spaceship, target),
    firing: target !== undefined
  });
  shieldActive = nextShieldActive(shieldActive, telemetry?.shieldEnergy ?? 100);
  shieldSequence += 1;
  shieldRoom().send(clientMessage.shieldInput, {
    ...envelope(shieldRoom()),
    sequence: shieldSequence,
    aim: directAim(spaceship, threat),
    active: shieldActive
  });
  recordControlBatch();
}

async function pauseAutomation() {
  if (paused || cleaningUp) return;
  paused = true;
  measuredControlHz = 0;
  generation += 1;
  await neutralize();
  const current = safeEncounter();
  await publishStatus(
    "paused",
    "Автопилот остановлен; серверная симуляция продолжается",
    current?.waveNumber ?? 0,
    current?.phase ?? "lobby"
  );
}

async function resumeAutomation() {
  if (!paused || cleaningUp) return;
  generation += 1;
  controlWindowStartedAt = Date.now();
  controlBatches = 0;
  measuredControlHz = 0;
  paused = false;
}

async function neutralize() {
  if (roomsByRole.size !== 3) return;
  shieldActive = false;
  pilotSequence += 1;
  bestEffortSend(pilotRoom(), clientMessage.pilotInput, {
    ...envelope(pilotRoom()),
    sequence: pilotSequence,
    vector: { x: 0, y: 0 }
  });
  gunnerSequence += 1;
  bestEffortSend(gunnerRoom(), clientMessage.gunnerInput, {
    ...envelope(gunnerRoom()),
    sequence: gunnerSequence,
    aim: { x: 0, y: 0 },
    firing: false
  });
  shieldSequence += 1;
  bestEffortSend(shieldRoom(), clientMessage.shieldInput, {
    ...envelope(shieldRoom()),
    sequence: shieldSequence,
    aim: { x: 0, y: 0 },
    active: false
  });
}

async function neutralizeForPhase(currentEncounter) {
  const key = `${String(pilotRoom().state.runNumber)}:${currentEncounter.phase}`;
  if (neutralizedPhaseKey === key) return;
  neutralizedPhaseKey = key;
  await neutralize();
}

async function chooseAllUpgrades(waveNumber) {
  const upgradeKey = runWaveKey(pilotRoom().state.runNumber, waveNumber);
  if (stopRequested || upgradedRunWaves.has(upgradeKey)) return;
  for (const [role, room] of roomsByRole) {
    await waitFor(() => room.state.game?.upgrade?.get(role)?.offer?.cards?.length === 3, 3_000);
    if (stopRequested) return;
    const upgrade = room.state.game.upgrade.get(role);
    const card = upgrade.offer.cards.at(0);
    if (card === undefined) throw new Error(`No upgrade card for ${role}.`);
    if (stopRequested) return;
    room.send(clientMessage.upgradeChoose, {
      ...envelope(room),
      actionId: randomUUID(),
      waveNumber: upgrade.offer.waveNumber,
      offerId: upgrade.offer.offerId,
      upgradeId: card.upgradeId
    });
    await waitFor(() => room.state.game.upgrade.get(role)?.hasSelection === true, 3_000);
    if (stopRequested) return;
  }
  upgradedRunWaves.add(upgradeKey);
  verification.upgrades = true;
}

async function refreshTelemetry() {
  lastTelemetryAt = Date.now();
  if (page === undefined || page.isClosed()) return;
  try {
    latestTelemetry = await page.locator('[data-testid="spaceship-world"]').evaluate((element) => {
      const parse = (name) => Number(element.getAttribute(name));
      const overlay = element.ownerDocument.querySelector('[data-testid="visible-demo-overlay"]');
      const parseOverlay = (name) => Number(overlay?.getAttribute(name));
      const targetId = element.getAttribute("data-demo-target-id") ?? "";
      const threatId = element.getAttribute("data-demo-threat-id") ?? "";
      return {
        spaceship: {
          x: parse("data-spaceship-x"),
          y: parse("data-spaceship-y")
        },
        target:
          targetId.length === 0
            ? undefined
            : {
                entityId: targetId,
                x: parse("data-demo-target-x"),
                y: parse("data-demo-target-y"),
                velocityX: parse("data-demo-target-velocity-x"),
                velocityY: parse("data-demo-target-velocity-y")
              },
        threat:
          threatId.length === 0
            ? undefined
            : {
                entityId: threatId,
                x: parse("data-demo-threat-x"),
                y: parse("data-demo-threat-y"),
                velocityX: parse("data-demo-threat-velocity-x"),
                velocityY: parse("data-demo-threat-velocity-y")
              },
        friendlyProjectiles: parse("data-friendly-projectile-count"),
        shieldActive: element.getAttribute("data-shield-active") === "true",
        shieldEnergy: parse("data-shield-energy"),
        renderFps: parseOverlay("data-render-fps"),
        snapshotHz: parseOverlay("data-snapshot-hz"),
        controlHz: parseOverlay("data-control-hz")
      };
    });
  } catch (error) {
    if (stopRequested || page.isClosed()) return;
    throw error;
  }
}

function observeVerification(startingPosition) {
  if (latestTelemetry === undefined) return;
  verification.projectile ||= latestTelemetry.friendlyProjectiles > 0;
  verification.shield ||= latestTelemetry.shieldActive;
  verification.movement ||=
    startingPosition !== undefined &&
    Math.hypot(
      latestTelemetry.spaceship.x - startingPosition.x,
      latestTelemetry.spaceship.y - startingPosition.y
    ) > 10;
  verification.wave2 ||= encounter().phase === "combat" && encounter().waveNumber >= 2;
  verification.cadence ||=
    latestTelemetry.renderFps > 0 &&
    latestTelemetry.snapshotHz > 0 &&
    latestTelemetry.controlHz > 0;
}

function statusMessage(currentEncounter) {
  if (currentEncounter.phase === "intermission") return "Выбираем улучшения экипажа";
  if (currentEncounter.phase === "result") return "Результат боя; готовим повторный запуск";
  return latestTelemetry?.target === undefined
    ? "Ищем цель и патрулируем арену"
    : `Атакуем ${latestTelemetry.target.entityId}`;
}

async function publishStatus(state, message, waveNumber, phase) {
  if (page === undefined || page.isClosed()) return;
  await page
    .evaluate(
      ({ eventName, detail }) => {
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
      },
      {
        eventName: STATUS_EVENT,
        detail: { state, message, waveNumber, phase, controlHz: measuredControlHz }
      }
    )
    .catch(() => undefined);
}

function recordControlBatch(now = Date.now()) {
  controlBatches += 1;
  const elapsedMs = now - controlWindowStartedAt;
  if (elapsedMs < 1_000) return;
  measuredControlHz = Math.round((controlBatches * 1000) / elapsedMs);
  controlWindowStartedAt = now;
  controlBatches = 0;
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

function attachFailureHandlers(room) {
  room.onMessage(serverMessage.error, (payload) => {
    const result = serverErrorSchema.safeParse(payload);
    if (!result.success) {
      reportFailure(new Error("Demo controller received malformed server:error."));
      return;
    }
    if (result.data.code === "invalid_phase" || result.data.code === "action_not_available") {
      return;
    }
    reportFailure(new Error(`Controller command failed: ${result.data.code}.`));
  });
  room.onLeave(() => {
    if (!cleaningUp) reportFailure(new Error(`Demo controller ${room.sessionId} disconnected.`));
  });
  room.onError((code, message) => {
    if (!cleaningUp) reportFailure(new Error(`Controller error ${String(code)}: ${message}`));
  });
}

function reportFailure(error) {
  failure ??= error;
  paused = true;
  generation += 1;
  if (roomsByRole.size === 3 && stopNeutralizationPromise === undefined) {
    stopNeutralizationPromise = neutralize().catch(() => undefined);
  }
}

function bestEffortSend(room, messageType, payload) {
  try {
    room.send(messageType, payload);
  } catch {
    // Continue neutralizing the other connected roles.
  }
}

function envelope(room) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    roomId: room.roomId,
    playerId: room.sessionId,
    runNumber: room.state.runNumber
  };
}

function assertCrew() {
  for (const role of ["pilot", "gunner", "shield"]) {
    if (!roomsByRole.has(role)) throw new Error(`Authoritative ${role} role was not assigned.`);
  }
}

function pilotRoom() {
  return requiredRoom("pilot");
}

function gunnerRoom() {
  return requiredRoom("gunner");
}

function shieldRoom() {
  return requiredRoom("shield");
}

function requiredRoom(role) {
  const room = roomsByRole.get(role);
  if (room === undefined) throw new Error(`Missing ${role} room.`);
  return room;
}

function encounter() {
  const value = pilotRoom().state.game?.encounter;
  if (value === undefined) throw new Error("Controller has no encounter projection.");
  return value;
}

function safeEncounter() {
  return roomsByRole.get("pilot")?.state?.game?.encounter;
}

async function waitFor(predicate, timeoutMs, intervalMs = 25) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    abortIfStopped();
    if (failure !== undefined) throw failure;
    if (await predicate()) return;
    await delay(intervalMs);
  }
  throw new Error(`Visible demo timed out after ${String(timeoutMs)} ms.`);
}

function abortIfStopped() {
  if (stopRequested) throw new DemoStopped("Visible demo stopped by user.");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
