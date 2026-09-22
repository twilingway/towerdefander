import { toSimulationConfig } from "@spaceship-defender/balance-core";
import { PATCH_INTERVAL_MS } from "@spaceship-defender/protocol";

import { toDisplayRoomView } from "../roomView.js";
import { createStepClock, type StepClock } from "./clock.js";
import { poseOf } from "./driver.js";
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

let run: LocalRun | undefined;
let clock: StepClock | undefined;
let intent: LocalIntent = IDLE_INTENT;
let paused = false;
let publishedAt = 0;
let lastStepCostMs = 0;

function post(message: FromRunWorker): void {
  scope.postMessage(message);
}

function publish(): void {
  if (run === undefined) return;
  run.project(lastStepCostMs);
  const view = toDisplayRoomView(run.mirror);
  // Refused by its own schema: nothing useful to draw, and blanking a screen
  // mid-fight would be worse than holding the last good frame.
  if (view !== undefined) post({ type: "view", view });
  publishedAt = performance.now();
}

function tick(): void {
  setTimeout(tick, POLL_MS);
  if (run === undefined || clock === undefined || paused) return;
  try {
    const now = performance.now();
    const steps = clock.stepsFor(now);
    if (steps > 0) {
      for (let index = 0; index < steps; index += 1) run.step(intent);
      lastStepCostMs = performance.now() - now;
      post({ type: "pose", pose: poseOf(run.state()) });
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
        const config = toSimulationConfig(message.tuning, message.shipArchetypeId);
        run = createLocalRun({
          config,
          tuning: message.tuning,
          shipArchetypeId: message.shipArchetypeId,
          playerName: message.playerName,
          startWave: message.startWave,
          waveTtlSeconds: message.waveTtlSeconds
        });
        clock = createStepClock(config.fixedStepMs);
        post({ type: "pose", pose: poseOf(run.state()) });
        publish();
        return;
      }
      case "intent":
        intent = message.intent;
        return;
      case "paused":
        paused = message.paused;
        // Forget the gap rather than spending it as a burst of catch-up.
        if (!paused) clock?.reset(performance.now());
        return;
      case "vote":
        run?.vote(message.command);
        publish();
        return;
      case "restart":
        run?.restart();
        publish();
        return;
    }
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};

tick();
