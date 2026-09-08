import { clamp, type Point } from "./spaceshipViewModel.js";

/**
 * Walking a value from one authoritative sample to the next, and the clock that
 * decides how fast.
 *
 * The server owns when a tick exists; this owns only how it is played back, so
 * everything here is addressed in gameplay ticks rather than in the
 * milliseconds a packet happened to arrive in.
 */

/**
 * A segment between two authoritative samples, addressed in gameplay ticks
 * rather than in arrival milliseconds: the server decides when a tick exists,
 * the display only decides how fast it plays them back.
 */
export interface PointTransition {
  readonly from: Point;
  readonly to: Point;
  readonly fromTick: number;
  readonly toTick: number;
}

export interface AngleTransition {
  readonly from: number;
  readonly to: number;
  readonly fromTick: number;
  readonly toTick: number;
}

export interface VisualSnapshot {
  readonly spaceship: Point;
  readonly turretAngle: number;
  readonly shield: { readonly angle: number };
}

export interface VisualTransitions {
  readonly spaceship: PointTrack;
  readonly turret: AngleTrack;
  readonly shield: AngleTrack;
}

export class SnapshotResetLatch {
  private pending = false;

  request(): void {
    this.pending = true;
  }

  consumeForSnapshot(): boolean {
    const shouldReset = this.pending;
    this.pending = false;
    return shouldReset;
  }
}

export function createSnappedVisualTransitions(
  snapshot: VisualSnapshot,
  tick: number
): VisualTransitions {
  return {
    spaceship: createPointTrack(snapshot.spaceship, tick),
    turret: createAngleTrack(snapshot.turretAngle, tick),
    shield: createAngleTrack(snapshot.shield.angle, tick)
  };
}

/**
 * Two contiguous segments rather than one. Playback runs behind the newest
 * tick, and a patch that carried several ticks shortens the segment that
 * follows it, so a single segment leaves playback with nothing to draw and the
 * picture stands still. Keeping the displaced segment covers those excursions.
 */
export interface PointTrack {
  readonly previous: PointTransition;
  readonly current: PointTransition;
}

export interface AngleTrack {
  readonly previous: AngleTransition;
  readonly current: AngleTransition;
}

export function createPointTrack(value: Point, tick: number): PointTrack {
  const segment = createPointTransition(value, value, tick, tick);
  return { previous: segment, current: segment };
}

export function createAngleTrack(value: number, tick: number): AngleTrack {
  const segment = createAngleTransition(value, value, tick, tick);
  return { previous: segment, current: segment };
}

/** Adds the newest authoritative sample, displacing the oldest segment. */
export function extendPointTrack(track: PointTrack, to: Point, toTick: number): PointTrack {
  return {
    previous: track.current,
    current: createPointTransition(track.current.to, to, track.current.toTick, toTick)
  };
}

export function extendAngleTrack(track: AngleTrack, to: number, toTick: number): AngleTrack {
  return {
    previous: track.current,
    current: createAngleTransition(track.current.to, to, track.current.toTick, toTick)
  };
}

export function samplePointTrack(track: PointTrack, playbackTick: number): Point {
  const segment = playbackTick < track.current.fromTick ? track.previous : track.current;
  return interpolatePoint(
    segment.from,
    segment.to,
    getSegmentAlpha(segment.fromTick, segment.toTick, playbackTick)
  );
}

export function sampleAngleTrack(track: AngleTrack, playbackTick: number): number {
  const segment = playbackTick < track.current.fromTick ? track.previous : track.current;
  return interpolateAngle(
    segment.from,
    segment.to,
    getSegmentAlpha(segment.fromTick, segment.toTick, playbackTick)
  );
}

export function createPointTransition(
  from: Point,
  to: Point,
  fromTick: number,
  toTick: number
): PointTransition {
  return {
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    fromTick,
    toTick
  };
}

export function createAngleTransition(
  from: number,
  to: number,
  fromTick: number,
  toTick: number
): AngleTransition {
  return { from, to, fromTick, toTick };
}

/**
 * Playback of authoritative ticks. The server owns when a tick exists; the
 * display owns how fast it walks through them - and it cannot walk at the
 * nominal 50 ms per tick, because nothing guarantees the room emits them that
 * often. So the pace is measured from what actually arrives, and playback runs
 * a fixed lag behind the newest tick; that lag is what keeps a late patch from
 * showing up as a stall.
 */
export interface PlaybackClock {
  /** Where playback sits, in authoritative ticks; fractional between them. */
  readonly tick: number;
  /** Newest authoritative tick received. */
  readonly latestTick: number;
  /** Measured real milliseconds per authoritative tick. */
  readonly msPerTick: number;
  /** Smoothed arrival gap and ticks per arrival, kept apart on purpose. */
  readonly gapEmaMs: number;
  readonly tickEma: number;
  /**
   * The worst recent lateness, in milliseconds, decaying while arrivals behave.
   * A mean would hide exactly what matters here: the picture stalls on the rare
   * arrival that runs long, not on the typical one.
   */
  readonly lateMs: number;
  /** How far behind the newest tick playback aims to stay, in ticks. */
  readonly lagTicks: number;
}

/** Stands in until the first pair of snapshots has been timed. */
export const NOMINAL_MS_PER_TICK = 50;
const MIN_MS_PER_TICK = 20;
const MAX_MS_PER_TICK = 250;
/**
 * The floor on how far behind the newest tick playback aims to stay. One tick
 * absorbs a single late arrival on a link that does not otherwise misbehave,
 * and it is what a viewer beside the server pays.
 *
 * It used to be the whole story, and on a real link it is not. Measured against
 * this game's own public deployment over forty-five seconds: arrivals sat at a
 * median of 50.5 ms either way, but through the internet the tail reached
 * 158.7 ms, past the 100 ms a one-tick lag affords a single-tick patch. Fifteen
 * arrivals in eight hundred landed late, and the picture stood still for 0.46 s
 * of the run -- while the frame counter, drawing the same state over and over,
 * reported everything was fine.
 */
export const PLAYBACK_MIN_LAG_TICKS = 1;
/**
 * The ceiling. Lag is latency the viewer pays to watch, so a link that misbehaves
 * for a long stretch must not be allowed to turn the game into a recording. Kept
 * under `PLAYBACK_RESYNC_TICKS` so a lag at its ceiling is never itself mistaken
 * for hopeless drift.
 */
export const PLAYBACK_MAX_LAG_TICKS = 4;
/**
 * Lateness rises to the newest measurement at once and falls by this factor per
 * arrival. Asymmetric on purpose: the stall has already been paid for by the
 * time it is measured, so the slack that prevents the next one is given up
 * slowly. At twenty arrivals a second this halves in about seven seconds.
 */
const LATENESS_DECAY = 0.995;
/** Past this drift, correcting by rate is hopeless and playback jumps instead. */
export const PLAYBACK_RESYNC_TICKS = 6;
/** Weight of the newest measurement in the pace estimate. */
const PACE_SMOOTHING = 0.2;
/** Share of the drift taken back per tick of playback. */
const DRIFT_CORRECTION = 0.25;
const MIN_PLAYBACK_RATE = 0.85;
const MAX_PLAYBACK_RATE = 1.15;

export function createPlaybackClock(tick: number, msPerTick = NOMINAL_MS_PER_TICK): PlaybackClock {
  const pace = clamp(msPerTick, MIN_MS_PER_TICK, MAX_MS_PER_TICK);
  return {
    tick,
    latestTick: tick,
    msPerTick: pace,
    gapEmaMs: pace,
    tickEma: 1,
    lateMs: 0,
    lagTicks: PLAYBACK_MIN_LAG_TICKS
  };
}

/**
 * The slack a link has earned, in ticks. Only lateness buys it: a link that is
 * merely far away already has its distance absorbed by playback sitting behind,
 * and spending slack on it would lengthen every viewer's reaction for nothing.
 */
function lagFromLateness(lateMs: number, msPerTick: number): number {
  return clamp(
    PLAYBACK_MIN_LAG_TICKS + lateMs / msPerTick,
    PLAYBACK_MIN_LAG_TICKS,
    PLAYBACK_MAX_LAG_TICKS
  );
}

/**
 * Folds one arrival into the pace estimate: `arrivalGapMs` is real time since
 * the previous snapshot, `tick` is its authoritative tick. A patch that carried
 * several ticks therefore lowers the per-tick pace instead of raising it.
 */
export function observePlaybackTick(
  clock: PlaybackClock,
  tick: number,
  arrivalGapMs: number
): PlaybackClock {
  const ticks = tick - clock.latestTick;
  // A tick that moved backwards is a different run, not a late patch. Without
  // re-anchoring, playback would sit at the old newest tick and never move
  // again, because nothing would ever raise it.
  if (ticks < 0) return createPlaybackClock(tick, clock.msPerTick);
  if (ticks === 0) return clock;
  if (!Number.isFinite(arrivalGapMs) || arrivalGapMs <= 0) return { ...clock, latestTick: tick };
  // Gap and tick count are smoothed apart and divided at the end. Smoothing the
  // ratio instead would average 62 ms and 31 ms across single- and double-tick
  // patches and land on 54 ms per tick where the room really runs 50.
  const gapEmaMs = clock.gapEmaMs + (arrivalGapMs - clock.gapEmaMs) * PACE_SMOOTHING;
  const tickEma = clock.tickEma + (ticks - clock.tickEma) * PACE_SMOOTHING;
  const msPerTick = clamp(gapEmaMs / tickEma, MIN_MS_PER_TICK, MAX_MS_PER_TICK);
  // How much longer this arrival took than the ticks it carried are worth. Only
  // the overshoot counts: an early arrival costs the picture nothing.
  const overshootMs = Math.max(0, arrivalGapMs - ticks * clock.msPerTick);
  const lateMs = Math.max(overshootMs, clock.lateMs * LATENESS_DECAY);
  return {
    tick: clock.tick,
    latestTick: tick,
    msPerTick,
    gapEmaMs,
    tickEma,
    lateMs,
    lagTicks: lagFromLateness(lateMs, msPerTick)
  };
}

/**
 * Advances playback by one rendered frame. Drift is taken back by bending the
 * rate rather than by moving the position, so a correction never reads as a
 * jump; only a hopeless gap resyncs outright.
 */
export function advancePlayback(clock: PlaybackClock, deltaMs: number): PlaybackClock {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return clock;
  const target = clock.latestTick - clock.lagTicks;
  const drift = target - clock.tick;
  if (Math.abs(drift) > PLAYBACK_RESYNC_TICKS) return { ...clock, tick: target };
  const rate = clamp(1 + drift * DRIFT_CORRECTION, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE);
  const advanced = clock.tick + (deltaMs / clock.msPerTick) * rate;
  // Never render past the newest sample: there is nothing to interpolate
  // towards there, so the picture would have to guess.
  return { ...clock, tick: Math.min(advanced, clock.latestTick) };
}

export function interpolatePoint(current: Point, target: Point, amount: number): Point {
  const safeAmount = clamp(amount, 0, 1);
  return {
    x: current.x + (target.x - current.x) * safeAmount,
    y: current.y + (target.y - current.y) * safeAmount
  };
}

/**
 * Where playback sits inside one authoritative segment. A segment that spans
 * several ticks - a patch that carried more than one step - is played as one
 * longer move rather than as a jump, because the span comes from the ticks
 * themselves instead of from a fixed window.
 */
export function getSegmentAlpha(fromTick: number, toTick: number, playbackTick: number): number {
  const span = toTick - fromTick;
  if (!Number.isFinite(span) || !Number.isFinite(playbackTick) || span <= 0) return 1;
  return clamp((playbackTick - fromTick) / span, 0, 1);
}

export function interpolateAngle(current: number, target: number, amount: number): number {
  const safeAmount = clamp(amount, 0, 1);
  const fullTurn = Math.PI * 2;
  const wrappedDelta =
    ((((target - current + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
  // Match the authoritative core convention: an exact antipode turns in the
  // positive screen-clockwise direction instead of depending on modulo sign.
  const delta = wrappedDelta === -Math.PI ? Math.PI : wrappedDelta;
  return current + delta * safeAmount;
}
