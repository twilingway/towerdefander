import type { DisplayRoomView } from "@spaceship-defender/protocol";

import { setLiveView } from "../liveView.js";
import { publishWorld } from "../worldStore.js";
import { toDisplayRoomView } from "../roomView.js";
import type { LocalRun } from "./engine.js";

/**
 * A local frame reaches the screen exactly where a patch does.
 *
 * Three sinks, in the order the room's own handler writes them: the scene reads
 * the live view every frame, the panels subscribe to the store slice by slice,
 * and React hears about it on the publisher's throttled clock. Publishing
 * anywhere else - or in another order - would be a second way for the world to
 * arrive, and then the two paths could disagree about which one is current.
 */
export interface LocalPublisher {
  /** Projects the run and hands the view to the screen. */
  readonly publish: (stepCostMs: number) => void;
}

export function createLocalPublisher(
  run: LocalRun,
  offer: (view: DisplayRoomView, now: number) => void
): LocalPublisher {
  return {
    publish(stepCostMs) {
      run.project(stepCostMs);
      const view = toDisplayRoomView(run.mirror);
      // The adapter refuses a view its own schema would not accept; there is
      // nothing useful to draw from a refused one, and pushing `undefined`
      // through the sinks would blank a screen mid-fight.
      if (view === undefined) return;
      setLiveView(view);
      publishWorld(view);
      offer(view, performance.now());
    }
  };
}
