/**
 * Thumb-noise guard for a stick that names a bearing.
 *
 * Ported from the lab, where it was fixed the hard way: a thumb is never still,
 * two pixels of wobble on a 58 px ring is about two degrees of commanded
 * heading, and the hull follows it faithfully. Measured there at 4.58 degrees
 * of swing, with the gun riding the hull and trembling with it — and a slow
 * turret cannot correct a hull twitching at seventy degrees a second.
 *
 * The dead zone on the stick does not help with this. That one removes small
 * pushes; this removes direction noise at a large push, which is a different
 * fault with a different cure. The lab needed both and so does this.
 *
 * Two parts, in order:
 *   1. a dead band — a new bearing closer than this to the one being held is
 *      not a steering input, it is noise, and it is dropped outright;
 *   2. a first-order filter — what survives is eased in, so the rest of the
 *      tremble is spent on the filter instead of on the hull.
 */

/** :`HEADING_DEADBAND_DEG` in the lab. Below this nothing is a turn. */
export const HEADING_DEADBAND_RADIANS = (3 * Math.PI) / 180;
/** :`HEADING_FILTER_TAU`. Sixty milliseconds is under a frame of intent. */
export const HEADING_FILTER_TAU_SECONDS = 0.06;

/** Shortest signed way round from `from` to `to`, in (-PI, PI]. */
function shortestArc(from: number, to: number): number {
  const TAU = Math.PI * 2;
  return ((((to - from + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

export interface HeadingSmoothingOptions {
  readonly deadbandRadians?: number;
  readonly tauSeconds?: number;
}

/**
 * Ease a commanded bearing toward the raw one.
 *
 * `held` is what is currently being sent; `null` means the stick was just
 * grabbed, and a fresh grab is honoured immediately — filtering the first
 * sample would make the stick feel like it starts late, which is a worse fault
 * than the one being fixed.
 *
 * The interpolation walks the shortest arc rather than the raw difference, so a
 * stick crossing due north does not spin the long way round.
 */
export function smoothHeading(
  held: number | null,
  raw: number,
  deltaSeconds: number,
  {
    deadbandRadians = HEADING_DEADBAND_RADIANS,
    tauSeconds = HEADING_FILTER_TAU_SECONDS
  }: HeadingSmoothingOptions = {}
): number {
  if (held === null || !Number.isFinite(held)) return raw;
  const difference = shortestArc(held, raw);
  if (Math.abs(difference) < deadbandRadians) return held;
  if (!(tauSeconds > 0) || !(deltaSeconds > 0)) return raw;
  const alpha = 1 - Math.exp(-deltaSeconds / tauSeconds);
  return held + difference * alpha;
}

/** The same, expressed on the unit vectors a stick actually reports. */
export function smoothHeadingVector(
  held: number | null,
  raw: { readonly x: number; readonly y: number },
  deltaSeconds: number,
  options: HeadingSmoothingOptions = {}
): { readonly heading: number; readonly x: number; readonly y: number } | null {
  if (raw.x === 0 && raw.y === 0) return null;
  const heading = smoothHeading(held, Math.atan2(raw.y, raw.x), deltaSeconds, options);
  return { heading, x: Math.cos(heading), y: Math.sin(heading) };
}
