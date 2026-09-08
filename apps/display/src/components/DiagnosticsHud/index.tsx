import { useEffect, useState } from "react";

import { DiagnosticsPanel } from "../DiagnosticsPanel/index.js";
import type { ComponentCost } from "../../model/componentCost.js";
import type { LongTaskMeter } from "../../model/longTasks.js";
import type { TrafficMeter } from "../../model/trafficMeter.js";
import type { WorkMeter } from "../../model/workMeter.js";

/**
 * Everything the panel shows, gathered at the moment it is asked for.
 *
 * A function rather than props, and that is the whole point of this component:
 * an instrument that re-renders the page it measures is measuring itself. The
 * numbers live in references that the frame loop and the socket write without
 * a render, and this pulls them on its own beat.
 */
export interface DiagnosticsReadings {
  readonly fps: number;
  readonly averageFrameMs: number;
  readonly worstFrameMs: number;
  readonly stutterShare: number;
  readonly sceneMsPerSecond: number;
  readonly worstSceneMs: number;
  readonly serverStepMs: number;
  readonly pingMs: number;
  readonly entityCount: number;
  readonly liveDrawn: number;
  readonly offscreen: number;
  readonly playbackDelayMs: number;
  readonly patchIntervalMs: number;
  readonly pendingInput: number;
  readonly drift: number;
  readonly traffic: TrafficMeter | undefined;
  /** Script that blocked the page long enough to cost a frame. */
  readonly longTasks: LongTaskMeter | undefined;
  /** The two rates the room runs at, so a mismatch is read rather than guessed. */
  readonly tickHz: number;
  readonly patchHz: number;
  readonly snapshot: WorkMeter | undefined;
  readonly commit: WorkMeter | undefined;
  /** The same React second, split by panel - see `componentCost.ts`. */
  readonly components: readonly ComponentCost[];
}

/** Twice a second: fast enough to watch, slow enough not to be the thing watched. */
const SAMPLE_INTERVAL_MS = 500;

interface DiagnosticsHudProps {
  readonly read: () => DiagnosticsReadings;
  readonly predictionEnabled: boolean;
  readonly onTogglePrediction: () => void;
  readonly backgroundEnabled: boolean;
  readonly onToggleBackground: () => void;
  readonly glowEnabled: boolean;
  readonly onToggleGlow: () => void;
  readonly vectorsEnabled: boolean;
  readonly onToggleVectors: () => void;
  readonly interfaceEnabled: boolean;
  readonly onToggleInterface: () => void;
  readonly opaquePanels: boolean;
  readonly onToggleOpaquePanels: () => void;
}

/**
 * The panel on its own clock.
 *
 * Before this, every instrument sample was a state change on the page, so the
 * whole battle tree - radar, cockpit, hull rings, the lot - re-rendered four
 * times a second to move a number in a corner. The reference prototype's own
 * panels do three hundred commits a second at a third of a millisecond each,
 * because each of them re-renders itself and nothing else. This is that: the
 * only thing a sample can touch is this subtree.
 */
export function DiagnosticsHud({ read, ...controls }: DiagnosticsHudProps) {
  const [readings, setReadings] = useState<DiagnosticsReadings>(read);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setInterval(() => {
      setReadings(read());
    }, SAMPLE_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [read, open]);

  /*
   * Folded down to its own title, and the clock stops with it.
   *
   * The rows are unmounted rather than hidden with a class: the panel turned
   * out to be the dearest thing on the screen it measures - more than half of
   * the React it was reporting - and a folded card that keeps sampling would
   * take the numbers away and leave the cost. The title stays in place, so the
   * way back is where the way out was.
   */
  if (!open) {
    return (
      <button
        type="button"
        className="diagnostics-panel diagnostics-panel--folded"
        data-testid="diagnostics-expand"
        aria-expanded="false"
        onClick={() => {
          setOpen(true);
        }}
      >
        Приборы ▸
      </button>
    );
  }

  return (
    <DiagnosticsPanel
      {...readings}
      {...controls}
      onCollapse={() => {
        setOpen(false);
      }}
    />
  );
}
