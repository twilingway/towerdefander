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

/**
 * The worst of everything since the last reset, which the per-second numbers
 * cannot answer.
 *
 * `FrameMeter` publishes a fresh second and throws the window away, so a spike
 * is gone from the panel before anyone reading it on a phone has looked up.
 * Comparing two runs - a flag on against off, one device against another - needs
 * the peak of a whole fight, so it is kept here rather than in the scene: this
 * module already holds what the panel reads, and the scene stays about drawing.
 */
export interface SessionPeaks {
  readonly durationSeconds: number;
  readonly worstFrameMs: number;
  readonly worstSceneMs: number;
  readonly lowestFps: number;
  readonly worstStutterShare: number;
  /**
   * When the worst frame happened, and how many seconds carried one like it.
   *
   * A single 1.5-second stall at second two is a warm-up - a shader compiled, an
   * atlas decoded - and is fixed by doing that work before the fight. The same
   * number with forty heavy seconds behind it is the game stuttering all the way
   * through, which is a different problem entirely. The peak alone cannot tell
   * them apart, and on a phone nobody is watching the panel at the moment it
   * happens.
   */
  readonly worstFrameAtSecond: number;
  readonly heavySeconds: number;
}

/** A second whose worst frame was this long counts as heavy. */
const HEAVY_FRAME_MS = 100;

let peaks = {
  startedAt: 0,
  worstFrameMs: 0,
  worstFrameAtSecond: 0,
  heavySeconds: 0,
  worstSceneMs: 0,
  lowestFps: Number.POSITIVE_INFINITY,
  worstStutterShare: 0
};

export function resetSessionPeaks(now = performance.now()): void {
  peaks = {
    startedAt: now,
    worstFrameMs: 0,
    worstFrameAtSecond: 0,
    heavySeconds: 0,
    worstSceneMs: 0,
    lowestFps: Number.POSITIVE_INFINITY,
    worstStutterShare: 0
  };
}

export function readSessionPeaks(now = performance.now()): SessionPeaks {
  return {
    durationSeconds: peaks.startedAt === 0 ? 0 : Math.max(0, (now - peaks.startedAt) / 1000),
    worstFrameMs: peaks.worstFrameMs,
    worstSceneMs: peaks.worstSceneMs,
    lowestFps: Number.isFinite(peaks.lowestFps) ? peaks.lowestFps : 0,
    worstStutterShare: peaks.worstStutterShare,
    worstFrameAtSecond: peaks.worstFrameAtSecond,
    heavySeconds: peaks.heavySeconds
  };
}

export function writeFrameStats(stats: FrameStats): void {
  const wasWorst = stats.worstFrameMs;
  const previous = frame.worstFrameMs;
  Object.assign(frame, stats);
  if (peaks.startedAt === 0) peaks.startedAt = performance.now();
  // A published second, not a frame: the meter hands over a fresh window each
  // time, so a value that changed is a second that ended.
  if (wasWorst !== previous && wasWorst >= HEAVY_FRAME_MS) peaks.heavySeconds += 1;
  if (stats.worstFrameMs > peaks.worstFrameMs) {
    peaks.worstFrameMs = stats.worstFrameMs;
    peaks.worstFrameAtSecond = Math.max(0, (performance.now() - peaks.startedAt) / 1000);
  }
  if (stats.worstUpdateMs > peaks.worstSceneMs) peaks.worstSceneMs = stats.worstUpdateMs;
  if (stats.stutterShare > peaks.worstStutterShare) peaks.worstStutterShare = stats.stutterShare;
  // A zero here is the boot frame, not a stall the player would have seen.
  if (stats.fps > 0 && stats.fps < peaks.lowestFps) peaks.lowestFps = stats.fps;
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
  readonly peaks: SessionPeaks;
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
    components: readComponentCosts(performance.now()),
    peaks: readSessionPeaks()
  };
}
