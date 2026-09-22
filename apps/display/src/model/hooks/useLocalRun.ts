import {
  PATCH_INTERVAL_MS,
  type DisplayRoomView,
  type UpgradeId
} from "@spaceship-defender/protocol";
import { useEffect, useRef, useState } from "react";

import { createStepClock } from "../localRun/clock.js";
import { createLocalDriver } from "../localRun/driver.js";
import { createLocalPublisher } from "../localRun/publish.js";
import {
  createLocalRun,
  IDLE_INTENT,
  type LocalIntent,
  type LocalRun
} from "../localRun/engine.js";
import type { PredictionDriver } from "../shipPrediction.js";
import { useViewPublisher } from "./useViewPublisher.js";
import { resetWorld } from "../worldStore.js";
import { setLiveView } from "../liveView.js";
import type { SpaceshipSimulationConfig } from "@spaceship-defender/game-core";
import type { BalanceTuning } from "@spaceship-defender/protocol";

/**
 * A run this page owns, for as long as the page is on screen.
 *
 * The scene drives it: `driver.drive()` is called at the top of every painted
 * frame and is where stepping happens. What is left here is the part the scene
 * cannot know about - when the page is not being looked at, and how often React
 * should be told.
 */
export interface LocalRunSession {
  readonly view: DisplayRoomView | undefined;
  readonly driver: PredictionDriver;
  readonly paused: boolean;
  readonly vote: (upgradeId: UpgradeId) => void;
  readonly restart: () => void;
}

export interface LocalRunOptions {
  readonly config: SpaceshipSimulationConfig;
  readonly tuning: BalanceTuning;
  readonly shipArchetypeId: string;
  readonly playerName: string;
  readonly startWave: number;
  readonly waveTtlSeconds: number;
  readonly readIntent: () => LocalIntent;
}

export function useLocalRun(options: LocalRunOptions): LocalRunSession {
  const [view, setView] = useState<DisplayRoomView | undefined>(undefined);
  const [paused, setPaused] = useState(false);
  const runReference = useRef<LocalRun | undefined>(undefined);
  const latest = useRef(options);
  latest.current = options;

  const publisher = useViewPublisher(setView, () => view);
  const publisherReference = useRef(publisher);
  publisherReference.current = publisher;

  const driverReference = useRef<PredictionDriver | undefined>(undefined);
  const pausedReference = useRef(false);

  runReference.current ??= createLocalRun({
    config: options.config,
    tuning: options.tuning,
    shipArchetypeId: options.shipArchetypeId,
    playerName: options.playerName,
    startWave: options.startWave,
    waveTtlSeconds: options.waveTtlSeconds
  });
  const run = runReference.current;

  if (driverReference.current === undefined) {
    const clock = createStepClock(options.config.fixedStepMs);
    const publish = createLocalPublisher(run, (published, now) => {
      publisherReference.current.offer(published, now);
    });
    let publishedAt = 0;
    driverReference.current = createLocalDriver({
      run,
      clock,
      readIntent: () => latest.current.readIntent(),
      paused: () => pausedReference.current,
      onStepped: (_steps, costMs) => {
        const now = performance.now();
        /*
         * Thirty a second, the rate the scene's playback clock was tuned
         * against. It measures the spacing between arrivals to size its buffer,
         * so handing it a different cadence here would change how the world is
         * interpolated for no reason other than the host having changed.
         */
        if (now - publishedAt < PATCH_INTERVAL_MS) return;
        publishedAt = now;
        publish.publish(costMs);
      }
    });
  }

  /*
   * A hidden tab pauses rather than races.
   *
   * The cockpit already zeroes every input on blur, so a run that kept stepping
   * would fly hands-off into a wave. Browsers stop animation frames in a hidden
   * tab anyway; what this adds is that coming back does not spend the gap.
   */
  useEffect(() => {
    const sync = () => {
      const hidden = document.visibilityState === "hidden";
      pausedReference.current = hidden;
      setPaused(hidden);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("blur", sync);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("blur", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  /*
   * The scene is the one that steps, and it arrives in its own chunk - so for
   * the first moments of a page there is nobody to call `drive()`. This keeps
   * the run alive until it takes over, and stands down as soon as it does.
   */
  useEffect(() => {
    let frame = 0;
    let lastDriven = performance.now();
    const driver = driverReference.current;
    if (driver === undefined) return undefined;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const now = performance.now();
      if (now - lastDriven < STALE_DRIVE_MS) return;
      lastDriven = now;
      driver.drive();
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(
    () => () => {
      // The page is leaving: nothing downstream should keep drawing its world.
      setLiveView(undefined);
      resetWorld();
    },
    []
  );

  const driver = driverReference.current;

  return {
    view,
    driver,
    paused,
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
    restart() {
      run.restart();
    }
  };
}

/** How long the scene may be silent before the fallback frame steps instead. */
const STALE_DRIVE_MS = 60;

export { IDLE_INTENT };
export type { LocalIntent };
