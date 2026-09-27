import { toSimulationConfig } from "@spaceship-defender/balance-core";
import { PATCH_INTERVAL_MS } from "@spaceship-defender/protocol";

import { toDisplayRoomView } from "../roomView.js";
import { createStepClock, type StepClock } from "./clock.js";
import { createLocalArena, type LocalArena } from "./arenaEngine.js";
import { createLocalRun, IDLE_INTENT, type LocalIntent, type LocalRun } from "./engine.js";
import type { FromRunWorker, ToRunWorker } from "./workerProtocol.js";

/**
 * The local run, on a thread of its own.
 *
 * The same engine the tab used to step inside its frame: the simulation, the
 * crew policy for the shield, the wave deadline, the projection - and the view
 * adapter too, so the schema check a frame has to pass is paid here rather than
 * on the thread that draws. What goes back is small and often (the hull's pose
 * after every step batch) or whole and at the patch rate (the view).
 *
 * Time is kept here, not borrowed from the page's frames: a worker has no
 * animation frames, and a run that stepped only when the page asked would stall
 * whenever the page did - which is the very thing this thread exists to stop.
 */

const scope = globalThis as unknown as {
  postMessage: (message: FromRunWorker) => void;
  onmessage: ((event: MessageEvent<ToRunWorker>) => void) | null;
};

/** How often the worker looks at the clock. Under a step, so no step waits a whole one. */
const POLL_MS = 4;

/**
 * How far ahead of real time the run is stepped: one step for the page to draw
 * the hull towards (`clock.ts`), plus a poll and a message's crossing, so the
 * step is on the page by the time the frame needs it rather than just after.
 */
const LEAD_BEYOND_STEP_MS = POLL_MS + 2;

let run: LocalRun | LocalArena | undefined;
let clock: StepClock | undefined;
let intent: LocalIntent = IDLE_INTENT;
let paused = false;
let publishedAt = 0;
let lastStepCostMs = 0;
/**
 * Set once the frame of a finished run has gone out. A run that is over does
 * not change, and posting it thirty times a second anyway kept the page
 * re-rendering its result screen - on a phone, a screen that stuttered while
 * nothing on it moved.
 */
let settled = false;

function post(message: FromRunWorker): void {
  scope.postMessage(message);
}

function postPose(now: number): void {
  if (run === undefined || clock === undefined) return;
  const stepMs = run.kind === "arena" ? run.fixedStepMs : run.config.fixedStepMs;
  post({
    type: "pose",
    pose: run.pose(),
    tick: run.tick(),
    due: performance.timeOrigin + now + clock.ahead() * stepMs
  });
}

function createLeadingClock(stepMs: number): StepClock {
  return createStepClock(stepMs, { leadMs: stepMs + LEAD_BEYOND_STEP_MS });
}

function publish(): void {
  if (run === undefined) return;
  run.project(lastStepCostMs);
  const view = toDisplayRoomView(run.mirror);
  // Refused by its own schema: nothing useful to draw, and blanking a screen
  // mid-fight would be worse than holding the last good frame.
  if (view !== undefined) post({ type: "view", view });
  publishedAt = performance.now();
  settled = run.settled();
}

function tick(): void {
  setTimeout(tick, POLL_MS);
  if (run === undefined || clock === undefined || paused || settled) return;
  try {
    const now = performance.now();
    const steps = clock.stepsFor(now);
    if (steps > 0) {
      for (let index = 0; index < steps; index += 1) run.step(intent);
      lastStepCostMs = performance.now() - now;
      postPose(now);
    }
    if (now - publishedAt >= PATCH_INTERVAL_MS) publish();
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
}

scope.onmessage = (event) => {
  const message = event.data;
  try {
    switch (message.type) {
      case "start": {
        if (message.kind === "arena") {
          const arena = createLocalArena({
            tuning: message.tuning,
            playerName: message.playerName
          });
          run = arena;
          clock = createLeadingClock(arena.fixedStepMs);
        } else {
          const config = toSimulationConfig(message.tuning, message.shipArchetypeId);
          run = createLocalRun({
            config,
            tuning: message.tuning,
            shipArchetypeId: message.shipArchetypeId,
            playerName: message.playerName,
            startWave: message.startWave,
            waveTtlSeconds: message.waveTtlSeconds
          });
          clock = createLeadingClock(config.fixedStepMs);
        }
        postPose(performance.now());
        publish();
        return;
      }
      case "intent":
        intent = message.intent;
        return;
      case "paused":
        paused = message.paused;
        // Forget the gap rather than spending it as a burst of catch-up - and
        // say when the held step is due now, or the page would place it a pause
        // in the past and hold it until the next step arrived.
        if (!paused) {
          const now = performance.now();
          clock?.reset(now);
          postPose(now);
        }
        return;
      case "vote":
        if (run?.kind !== "campaign") return;
        run.vote(message.command);
        publish();
        return;
      case "scan":
        if (run?.kind !== "arena") return;
        run.scan();
        publish();
        return;
      case "restart":
        run?.restart();
        {
          // The clock stood still while the run was settled; that gap is not owed.
          const now = performance.now();
          clock?.reset(now);
          // The new run's first pose, so the page does not hold the old run's
          // last one until the first step.
          postPose(now);
        }
        publish();
        return;
    }
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};

tick();
