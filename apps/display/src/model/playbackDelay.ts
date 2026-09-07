/**
 * How far behind the newest snapshot the world is drawn.
 *
 * Interpolation renders at `now - delay` and needs two snapshots bracketing
 * that instant. When the buffer underruns, the SDK holds the newest sample
 * rather than guessing ahead - correct, and visible as an entity stopping dead
 * and then jumping. So the buffer has to be sized from the stream the room
 * actually delivers, not from a number picked once.
 *
 * The reference prototype runs a hundred milliseconds against a thirty-three
 * millisecond broadcast: three intervals of slack. Ours arrive further apart
 * and less evenly - a host timer quantised to 15.625 ms turns a fifty
 * millisecond interval into sixty-two - so the same slack is a larger number
 * here, and it is measured rather than assumed.
 */

/** Intervals of slack the buffer keeps, before jitter is added on top. */
const INTERVALS_OF_SLACK = 2.5;
/** How much of a jitter spike is carried into the buffer. */
const JITTER_SHARE = 2;
/**
 * Below this there is no stream worth measuring, above it no reaction worth
 * having: a crew that sees a boss two thirds of a second late cannot aim at it.
 */
const MIN_DELAY_MS = 80;
const MAX_DELAY_MS = 320;
/** Weight of each new arrival. Slow enough that one late packet is not a policy. */
const SMOOTHING = 0.12;
/** Arrivals further apart than this are a stall, not a pace. */
const MAX_CREDIBLE_GAP_MS = 1_000;

export interface PlaybackDelayEstimate {
  /** Mean time between snapshots, smoothed. */
  readonly intervalMs: number;
  /** Mean absolute deviation from that, smoothed - the part a buffer pays for. */
  readonly jitterMs: number;
  /** Undefined until the second arrival: one packet measures no interval. */
  readonly lastArrivalMs: number | undefined;
}

export function createPlaybackDelayEstimate(intervalMs = 50): PlaybackDelayEstimate {
  return { intervalMs, jitterMs: 0, lastArrivalMs: undefined };
}

export function observePatchArrival(
  estimate: PlaybackDelayEstimate,
  nowMs: number
): PlaybackDelayEstimate {
  if (!Number.isFinite(nowMs)) return estimate;
  const previous = estimate.lastArrivalMs;
  if (previous === undefined) return { ...estimate, lastArrivalMs: nowMs };
  const gap = nowMs - previous;
  // A gap that is not a gap - a duplicate arrival, a clock that went backwards,
  // a tab that stopped being scheduled - measures the host, not the room.
  if (gap <= 0 || gap > MAX_CREDIBLE_GAP_MS) return { ...estimate, lastArrivalMs: nowMs };
  const deviation = Math.abs(gap - estimate.intervalMs);
  return {
    intervalMs: estimate.intervalMs + (gap - estimate.intervalMs) * SMOOTHING,
    jitterMs: estimate.jitterMs + (deviation - estimate.jitterMs) * SMOOTHING,
    lastArrivalMs: nowMs
  };
}

export function playbackDelayMs(estimate: PlaybackDelayEstimate): number {
  const wanted = estimate.intervalMs * INTERVALS_OF_SLACK + estimate.jitterMs * JITTER_SHARE;
  return Math.round(Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, wanted)));
}
