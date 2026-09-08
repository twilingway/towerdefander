import { SIMULATION_TICK_RATE } from "@spaceship-defender/game-core";
import { PATCH_INTERVAL_MS } from "@spaceship-defender/protocol";

import { countDrawnEntities } from "./combatHudViewModel.js";
import { readComponentCosts } from "./componentCost.js";
import { readLiveView } from "./liveView.js";
import type { LongTaskMeter } from "./longTasks.js";
import type { TrafficMeter } from "./trafficMeter.js";
import { advanceWork, createWorkMeter, recordWork, type WorkMeter } from "./workMeter.js";

export interface FrameStats {
  fps: number;
  averageFrameMs: number;
  worstFrameMs: number;
  stutterShare: number;
  updateMsPerSecond: number;
  worstUpdateMs: number;
  liveDrawn: number;
  offscreen: number;
}

/**
 * Every instrument the panel shows, held outside React.
 *
 * A module rather than a set of refs, because writer and reader are in
 * different components: the scene writes the frame stats and the corner readout
 * and the panel both read them; the patch handler writes the snapshot cost and
 * the panel reads it; the profiler wrapper deep inside the battle tree writes
 * the commit cost and a hook two levels up reads it. Threading a callback
 * through the tree for each would buy nothing - and none of these may cause a
 * render, which is the whole reason they are not state.
 */
const frame: FrameStats = {
  fps: 0,
  averageFrameMs: 0,
  worstFrameMs: 0,
  stutterShare: 0,
  updateMsPerSecond: 0,
  worstUpdateMs: 0,
  liveDrawn: 0,
  offscreen: 0
};

/** How far behind the room the world is drawn, measured rather than chosen. */
let playbackDelayMs = 0;
let patchIntervalMs = 0;
/** Written every frame, read twice a second by the panel; never a render. */
let pendingInput = 0;
let drift = 0;
let traffic: TrafficMeter | undefined;
let longTasks: LongTaskMeter | undefined;
let snapshot = createWorkMeter();
let commit = createWorkMeter();

export function writeFrameStats(stats: FrameStats): void {
  Object.assign(frame, stats);
}

/** The three numbers the corner readout shows, pulled rather than pushed. */
export function readFrameStats(): Pick<FrameStats, "fps" | "worstFrameMs" | "stutterShare"> {
  return { fps: frame.fps, worstFrameMs: frame.worstFrameMs, stutterShare: frame.stutterShare };
}

export function writePlaybackDelay(delayMs: number, intervalMs: number): void {
  playbackDelayMs = delayMs;
  patchIntervalMs = intervalMs;
}

export function writePredictionLag(pending: number, driftEma: number): void {
  pendingInput = pending;
  drift = driftEma;
}

export function recordSnapshotWork(durationMs: number, startedAt: number): void {
  snapshot = recordWork(snapshot, durationMs, startedAt);
}

export function recordCommitWork(durationMs: number, at: number): void {
  commit = recordWork(commit, durationMs, at);
}

export function setTrafficMeter(meter: TrafficMeter | undefined): void {
  traffic = meter;
}

export function setLongTaskMeter(meter: LongTaskMeter | undefined): void {
  longTasks = meter;
}

/** Rolls the work windows forward; the panel pulls on its own beat. */
export function advanceInstruments(now: number): void {
  snapshot = advanceWork(snapshot, now);
  commit = advanceWork(commit, now);
}

export interface DiagnosticsReadings extends FrameStats {
  readonly sceneMsPerSecond: number;
  readonly worstSceneMs: number;
  readonly serverStepMs: number;
  readonly pingMs: number;
  readonly entityCount: number;
  readonly playbackDelayMs: number;
  readonly patchIntervalMs: number;
  readonly pendingInput: number;
  readonly drift: number;
  readonly traffic: TrafficMeter | undefined;
  readonly longTasks: LongTaskMeter | undefined;
  readonly tickHz: number;
  readonly patchHz: number;
  readonly snapshot: WorkMeter;
  readonly commit: WorkMeter;
  readonly components: ReturnType<typeof readComponentCosts>;
}

/** Every instrument, read at the moment the panel asks. */
export function readDiagnostics(): DiagnosticsReadings {
  const view = readLiveView();
  return {
    ...frame,
    sceneMsPerSecond: frame.updateMsPerSecond,
    worstSceneMs: frame.worstUpdateMs,
    serverStepMs: view?.game?.serverStepMs ?? 0,
    pingMs: view?.displayLatencyMs ?? 0,
    entityCount: view?.game == null ? 0 : countDrawnEntities(view.game),
    playbackDelayMs,
    patchIntervalMs,
    pendingInput,
    drift,
    traffic,
    longTasks,
    tickHz: SIMULATION_TICK_RATE,
    patchHz: Math.round(1000 / PATCH_INTERVAL_MS),
    snapshot,
    commit,
    components: readComponentCosts(performance.now())
  };
}
