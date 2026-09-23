import { useEffect, type RefObject } from "react";

import { readLiveGame } from "../liveView.js";
import { writeLiveHeat } from "../liveHeat.js";
import { onSceneFrame, sceneFramesFlowing } from "../sceneFrames.js";

/** Twenty a second: below what a barrel changes at, above what an eye reads. */
const LIVE_HEAT_INTERVAL_MS = 50;

/**
 * The heat gauges, moved without a render.
 *
 * Twenty times a second, straight onto the nodes React drew once. Heat is the
 * fastest thing on the screen and every commit it used to cause was a DOM write
 * inside a frame the arena was drawing - which a trace of the long frames shows
 * as layout and paint the short frames never carry.
 */
export function useLiveHeat(host: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    let writtenAt = 0;
    const write = (now: number): void => {
      // Half a 60 Hz frame of slack, so frame-aligned writes do not skip one in two.
      if (now - writtenAt < LIVE_HEAT_INTERVAL_MS - 1000 / 120) return;
      writtenAt = now;
      const game = readLiveGame();
      const shell = host.current;
      if (game != null && shell !== null) writeLiveHeat(shell, game);
    };
    // In the scene's frames while it draws; see `sceneFrames.ts`.
    const unsubscribe = onSceneFrame(() => {
      write(performance.now());
    });
    const timer = window.setInterval(() => {
      if (!sceneFramesFlowing()) write(performance.now());
    }, LIVE_HEAT_INTERVAL_MS);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [host]);
}
