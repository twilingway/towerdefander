import { useEffect, type RefObject } from "react";

import { readLiveGame } from "../liveView.js";
import { writeLiveHeat } from "../liveHeat.js";

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
    const timer = window.setInterval(() => {
      const game = readLiveGame();
      const shell = host.current;
      if (game != null && shell !== null) writeLiveHeat(shell, game);
    }, LIVE_HEAT_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [host]);
}
