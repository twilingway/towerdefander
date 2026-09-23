import {
  PATCH_INTERVAL_MS,
  type BalanceTuning,
  type DisplayRoomView,
  type UpgradeId
} from "@spaceship-defender/protocol";
import type { SpaceshipSimulationConfig } from "@spaceship-defender/game-core";

import type { PredictedPoseFrame, PredictionDriver } from "../shipPrediction.js";
import { createStepClock } from "./clock.js";
import { createLocalDriver, createRemoteDriver } from "./driver.js";
import { createLocalRun, type LocalIntent } from "./engine.js";
import { createLocalPublisher, deliverView } from "./publish.js";
import type { FromRunWorker, ToRunWorker } from "./workerProtocol.js";

/**
 * Who steps a local run: this tab inside its frames, or a worker on its own thread.
 *
 * The screen does not care which. It gets a driver for the scene, the frames
 * delivered to the same three sinks, and the same four verbs.
 */
export interface RunHost {
  readonly driver: PredictionDriver;
  /** Called by the page's fallback frame while the scene is not driving yet. */
  readonly idleTick: () => void;
  readonly vote: (upgradeId: UpgradeId) => void;
  readonly restart: () => void;
  readonly setPaused: (paused: boolean) => void;
  /** Stops everything this host started. A worker is not collected while it runs. */
  readonly dispose: () => void;
}

export interface RunHostOptions {
  readonly config: SpaceshipSimulationConfig;
  readonly tuning: BalanceTuning;
  readonly shipArchetypeId: string;
  readonly playerName: string;
  readonly startWave: number;
  readonly waveTtlSeconds: number;
  readonly readIntent: () => LocalIntent;
  readonly offer: (view: DisplayRoomView, now: number) => void;
}

/**
 * Whether this page should hand its run to a worker.
 *
 * Yes wherever a module worker can be built, unless `?worker=0` asks for the
 * old way - which is how the two are compared on a phone, and the way back if a
 * device turns out to run workers badly.
 */
export function shouldUseRunWorker(search: string): boolean {
  if (typeof Worker === "undefined") return false;
  return new URLSearchParams(search).get("worker") !== "0";
}

/** The run stepped inside the frame that draws it, on the main thread. */
export function createInTabHost(options: RunHostOptions): RunHost {
  const run = createLocalRun(options);
  const clock = createStepClock(options.config.fixedStepMs);
  const publish = createLocalPublisher(run, options.offer);
  let paused = false;
  let publishedAt = 0;
  publish.publish(0);
  const driver = createLocalDriver({
    run,
    clock,
    readIntent: options.readIntent,
    paused: () => paused,
    onStepped: (_steps, costMs) => {
      const now = performance.now();
      // Thirty a second: the rate the scene's playback clock was tuned against.
      if (now - publishedAt < PATCH_INTERVAL_MS) return;
      publishedAt = now;
      publish.publish(costMs);
    }
  });
  return {
    driver,
    idleTick: () => {
      driver.drive();
    },
    vote(upgradeId) {
      const game = run.mirror.game;
      run.vote({
        role: "pilot",
        waveNumber: game.encounter.waveNumber,
        offerId: game.teamUpgrade.offer.offerId,
        upgradeId,
        revision: 1
      });
    },
    restart: () => {
      run.restart();
    },
    setPaused: (value) => {
      paused = value;
    },
    dispose: () => undefined
  };
}

/** How long a running worker may be silent before the page says so. */
const SILENT_WORKER_MS = 1_000;

/** The run on a thread of its own; this side only relays. */
export function createWorkerHost(options: RunHostOptions): RunHost {
  const worker = new Worker(new URL("./runWorker.ts", import.meta.url), { type: "module" });
  const send = (message: ToRunWorker): void => {
    worker.postMessage(message);
  };
  let pose: PredictedPoseFrame | undefined;
  let lastView: DisplayRoomView | undefined;
  let paused = false;
  let heardAt = performance.now();
  let reportedSilence = false;

  worker.onmessage = (event: MessageEvent<FromRunWorker>) => {
    heardAt = performance.now();
    reportedSilence = false;
    const message = event.data;
    if (message.type === "pose") pose = message.pose;
    else if (message.type === "view") {
      lastView = message.view;
      deliverView(message.view, options.offer);
    } else console.error(`[local run] the worker failed: ${message.message}`);
  };
  worker.onerror = (event) => {
    console.error(`[local run] the worker crashed: ${event.message}`);
  };

  /*
   * A worker that stops talking is not an exception anyone will see: the page
   * just keeps drawing the last frame. So silence is watched for and said out
   * loud - once per silence, and never while paused, when silence is correct.
   */
  const watchdog = setInterval(() => {
    // A finished run goes quiet on purpose; see `settled` in the worker.
    const outcome = lastView?.game?.encounter.outcome;
    if (paused || reportedSilence || (outcome !== undefined && outcome !== null)) return;
    const silentFor = performance.now() - heardAt;
    if (silentFor < SILENT_WORKER_MS) return;
    reportedSilence = true;
    console.error(`[local run] the worker has been silent for ${String(Math.round(silentFor))} ms`);
  }, SILENT_WORKER_MS);

  send({
    type: "start",
    tuning: options.tuning,
    shipArchetypeId: options.shipArchetypeId,
    playerName: options.playerName,
    startWave: options.startWave,
    waveTtlSeconds: options.waveTtlSeconds
  });

  const sendIntent = (): void => {
    send({ type: "intent", intent: options.readIntent() });
  };

  return {
    driver: createRemoteDriver({ latestPose: () => pose, sendIntent, paused: () => paused }),
    idleTick: sendIntent,
    vote(upgradeId) {
      const game = lastView?.game;
      const offer = game?.teamUpgrade.offer;
      if (game === undefined || game === null || offer === undefined || offer === null) return;
      send({
        type: "vote",
        command: {
          role: "pilot",
          waveNumber: game.encounter.waveNumber,
          offerId: offer.offerId,
          upgradeId,
          revision: 1
        }
      });
    },
    restart: () => {
      send({ type: "restart" });
    },
    setPaused: (value) => {
      paused = value;
      heardAt = performance.now();
      send({ type: "paused", paused: value });
    },
    dispose: () => {
      clearInterval(watchdog);
      worker.onmessage = null;
      worker.terminate();
    }
  };
}
