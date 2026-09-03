/**
 * Measures how the display's authoritative snapshots actually arrive.
 *
 * The symptom this exists for is "it freezes but the frame rate is fine": the
 * renderer keeps drawing, but the state it draws stops advancing. That is a
 * pacing problem, and pacing has two possible owners -- the server, which may
 * not be producing ticks on time, and the path, which may not be delivering
 * them evenly. This tells them apart by recording both at once: how many ticks
 * the server produced per real second, and how unevenly the patches carrying
 * them landed.
 *
 * `PLAYBACK_LAG_TICKS` in the display is the budget: playback runs that many
 * ticks behind the newest one received, so an arrival later than that budget
 * has nothing left to interpolate towards and the picture stops. Gaps are
 * reported against it.
 *
 *   node apps/controller/scripts/production-pacing.mjs --api wss://host [--seconds 60]
 */
import { Client } from "@colyseus/sdk";
import {
  PROTOCOL_VERSION,
  ROOM_TYPE,
  clientMessage,
  serverLatencyProbeSchema,
  serverMessage
} from "@spaceship-defender/protocol";

/** Mirrors PLAYBACK_LAG_TICKS in apps/display; a gap past this stalls the picture. */
const PLAYBACK_LAG_TICKS = 1;
const NOMINAL_MS_PER_TICK = 50;

const options = readOptions(process.argv.slice(2));
const arrivals = [];
let display;
let controller;

try {
  display = await new Client(options.api).create(ROOM_TYPE, {
    role: "display",
    protocolVersion: PROTOCOL_VERSION,
    crewSize: 1
  });
  answerLatencyProbes(display);
  controller = await new Client(options.api).joinById(display.roomId, {
    role: "controller",
    protocolVersion: PROTOCOL_VERSION,
    playerName: "Pacing"
  });
  answerLatencyProbes(controller);
  await waitFor(() => display.state.players.size === 1, "the controller never took a seat");

  controller.send(clientMessage.ready, {
    protocolVersion: PROTOCOL_VERSION,
    roomId: display.roomId,
    playerId: controller.sessionId,
    runNumber: display.state.runNumber
  });
  await waitFor(() => display.state.hasGame === true, "the run never started", 20_000);

  let previousAtMs = performance.now();
  let previousTick = display.state.game.tick;
  display.onStateChange(() => {
    const tick = display.state.game?.tick;
    if (typeof tick !== "number" || tick === previousTick) return;
    const now = performance.now();
    arrivals.push({ gapMs: now - previousAtMs, ticks: tick - previousTick });
    previousAtMs = now;
    previousTick = tick;
  });

  console.log(`Recording ${String(options.seconds)} s from ${options.api} …`);
  await new Promise((resolve) => setTimeout(resolve, options.seconds * 1000));
  report();
} catch (error) {
  console.error(`Pacing probe failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([display?.leave(true), controller?.leave(true)]);
}

function report() {
  if (arrivals.length < 10) {
    console.error(`Only ${String(arrivals.length)} arrivals recorded; nothing to say.`);
    process.exitCode = 1;
    return;
  }
  const gaps = arrivals.map(({ gapMs }) => gapMs).sort((a, b) => a - b);
  const ticks = arrivals.reduce((total, { ticks: n }) => total + n, 0);
  const spanMs = arrivals.reduce((total, { gapMs }) => total + gapMs, 0);
  const at = (share) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * share))];

  // The budget the display has before the picture stops: the lag it keeps, plus
  // the tick the patch itself carries.
  const budgetMs = (PLAYBACK_LAG_TICKS + 1) * NOMINAL_MS_PER_TICK;
  const overBudget = arrivals.filter(
    ({ gapMs, ticks: n }) => gapMs > (n + PLAYBACK_LAG_TICKS) * NOMINAL_MS_PER_TICK
  );
  const stalledMs = overBudget.reduce(
    (total, { gapMs, ticks: n }) =>
      total + (gapMs - (n + PLAYBACK_LAG_TICKS) * NOMINAL_MS_PER_TICK),
    0
  );

  console.log("");
  console.log(
    `arrivals            ${String(arrivals.length)} over ${(spanMs / 1000).toFixed(1)} s`
  );
  console.log(`ticks per second    ${(ticks / (spanMs / 1000)).toFixed(2)}  (nominal 20.00)`);
  console.log(
    `arrival gap ms      p50 ${at(0.5).toFixed(1)}  p90 ${at(0.9).toFixed(1)}  p99 ${at(0.99).toFixed(1)}  max ${gaps[gaps.length - 1].toFixed(1)}`
  );
  console.log(`display budget ms   ${String(budgetMs)} for a single-tick patch`);
  console.log(
    `over budget         ${String(overBudget.length)} of ${String(arrivals.length)} (${((overBudget.length / arrivals.length) * 100).toFixed(1)} %), ${(stalledMs / 1000).toFixed(2)} s of frozen picture`
  );
  console.log(`crew latency ms     ${String(display.state.displayLatencyMs)}`);
}

function answerLatencyProbes(room) {
  room.onMessage(serverMessage.latencyProbe, (payload) => {
    const parsed = serverLatencyProbeSchema.safeParse(payload);
    if (!parsed.success) return;
    room.send(clientMessage.latencyPong, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: parsed.data.probeId
    });
  });
}

async function waitFor(predicate, what, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${what}.`);
}

function readOptions(argv) {
  const values = { api: process.env.PUBLIC_API_URL, seconds: 60 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--api") values.api = argv[index + 1];
    if (argv[index] === "--seconds") values.seconds = Number(argv[index + 1]);
  }
  if (!values.api) throw new Error("Pass --api wss://host or set PUBLIC_API_URL.");
  return values;
}
