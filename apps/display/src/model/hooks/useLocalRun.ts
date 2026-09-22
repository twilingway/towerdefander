import { type DisplayRoomView, type UpgradeId } from "@spaceship-defender/protocol";
import { useEffect, useRef, useState } from "react";

import { IDLE_INTENT, type LocalIntent } from "../localRun/engine.js";
import {
  createInTabHost,
  createWorkerHost,
  shouldUseRunWorker,
  type RunHost
} from "../localRun/hosts.js";
import type { PredictionDriver } from "../shipPrediction.js";
import { useViewPublisher } from "./useViewPublisher.js";
import { resetWorld } from "../worldStore.js";
import { setLiveView } from "../liveView.js";
import type { SpaceshipSimulationConfig } from "@spaceship-defender/game-core";
import type { BalanceTuning } from "@spaceship-defender/protocol";

/**
 * A run this page owns, for as long as the page is on screen.
 *
 * Stepped by a worker where the page can have one, or inside the frame that
 * draws it where it cannot (`hosts.ts`). What is left here is the part neither
 * host can know about - when the page is not being looked at, how often React
 * should be told, and when the page leaves.
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
  const latest = useRef(options);
  latest.current = options;

  const publisher = useViewPublisher(setView, () => view);
  const publisherReference = useRef(publisher);
  publisherReference.current = publisher;

  /*
   * Made once, in render, so the scene has a driver on its first frame.
   *
   * Either host publishes its first frame at once: without one the screen
   * renders a lobby - a view with no game - and a lobby on a page that hosts its
   * own run offers a "Готов" button that waits for a crew nobody will bring.
   */
  const hostReference = useRef<RunHost | undefined>(undefined);
  if (hostReference.current === undefined) {
    const hostOptions = {
      config: options.config,
      tuning: options.tuning,
      shipArchetypeId: options.shipArchetypeId,
      playerName: options.playerName,
      startWave: options.startWave,
      waveTtlSeconds: options.waveTtlSeconds,
      readIntent: () => latest.current.readIntent(),
      offer: (published: DisplayRoomView, now: number) => {
        publisherReference.current.offer(published, now);
      }
    };
    hostReference.current = shouldUseRunWorker(globalThis.location.search)
      ? createWorkerHost(hostOptions)
      : createInTabHost(hostOptions);
  }
  const host = hostReference.current;

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
      host.setPaused(hidden);
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
  }, [host]);

  /*
   * The scene is the one that drives, and it arrives in its own chunk - so for
   * the first moments of a page there is nobody to call `drive()`. This keeps
   * the run alive until it takes over.
   */
  useEffect(() => {
    let frame = 0;
    let lastDriven = performance.now();

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const now = performance.now();
      if (now - lastDriven < STALE_DRIVE_MS) return;
      lastDriven = now;
      host.idleTick();
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [host]);

  useEffect(
    () => () => {
      // The page is leaving: stop the run - a worker keeps running, and so is
      // never collected, until it is told to stop - and draw its world no more.
      host.dispose();
      setLiveView(undefined);
      resetWorld();
    },
    [host]
  );

  return {
    view,
    driver: host.driver,
    paused,
    vote: host.vote,
    restart: host.restart
  };
}

/** How long the scene may be silent before the fallback frame steps instead. */
const STALE_DRIVE_MS = 60;

export { IDLE_INTENT };
export type { LocalIntent };
