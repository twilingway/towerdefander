import { summarize, type GapSummary, type ProbedFrame } from "./shellGap.js";

/**
 * How the drawn hulls move from frame to frame, computed from what the scene
 * drew.
 *
 * The camera follows the own hull, so a rival's place on the glass is its place
 * relative to that hull. What the eye reads as smooth is that relative place
 * changing smoothly, and the per-frame acceleration of it, in units per second
 * squared, tells the two apart: flight is a few thousand, a picture that holds
 * for frames and then jumps is a hundred times that. A hull drawn on whole
 * 60 Hz steps on a 165 Hz panel measured about 270,000.
 */
export interface HullMotion {
  /** The own hull, in the world. */
  readonly own: GapSummary;
  /** Every rival relative to the own hull: its motion on the screen. */
  readonly rivalsOnScreen: GapSummary;
}

/** How far a hull may move between two frames and still be the same hull. */
const SAME_HULL_UNITS = 40;

interface Placed {
  readonly x: number;
  readonly y: number;
  readonly time: number;
}

function acceleration(first: Placed, second: Placed, third: Placed): number | undefined {
  const early = (second.time - first.time) / 1000;
  const late = (third.time - second.time) / 1000;
  if (early <= 0 || late <= 0) return undefined;
  const mean = (early + late) / 2;
  const ax = ((third.x - second.x) / late - (second.x - first.x) / early) / mean;
  const ay = ((third.y - second.y) / late - (second.y - first.y) / early) / mean;
  return Math.hypot(ax, ay);
}

/** Rivals relative to the own hull drawn in the same frame. */
function rivalsOf(frame: ProbedFrame): Placed[] {
  const placed: Placed[] = [];
  for (let at = 0; at + 2 < frame.hulls.length; at += 3) {
    placed.push({
      x: (frame.hulls[at] ?? 0) - frame.hullX,
      y: (frame.hulls[at + 1] ?? 0) - frame.hullY,
      time: frame.time
    });
  }
  return placed;
}

function nearest(
  candidates: readonly Placed[],
  to: Placed,
  shift: { readonly x: number; readonly y: number }
): Placed | undefined {
  let best: Placed | undefined;
  let bestDistance = SAME_HULL_UNITS;
  for (const candidate of candidates) {
    // Matched in the world, not on the screen: the own hull moved in between.
    const distance = Math.hypot(candidate.x + shift.x - to.x, candidate.y + shift.y - to.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

export function hullMotion(frames: readonly ProbedFrame[]): HullMotion {
  const own: number[] = [];
  const rivals: number[] = [];
  let older: Placed[] = [];
  let previous: Placed[] = [];
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const before = frames[index - 1];
    const earliest = frames[index - 2];
    if (frame === undefined) continue;
    const current = rivalsOf(frame);
    if (before !== undefined && earliest !== undefined) {
      const hull = (at: ProbedFrame): Placed => ({ x: at.hullX, y: at.hullY, time: at.time });
      const ownAcceleration = acceleration(hull(earliest), hull(before), hull(frame));
      if (ownAcceleration !== undefined) own.push(ownAcceleration);
      const backOne = { x: before.hullX - frame.hullX, y: before.hullY - frame.hullY };
      const backTwo = { x: earliest.hullX - before.hullX, y: earliest.hullY - before.hullY };
      for (const rival of current) {
        const second = nearest(previous, rival, backOne);
        const first = second === undefined ? undefined : nearest(older, second, backTwo);
        if (first === undefined || second === undefined) continue;
        const onScreen = acceleration(first, second, rival);
        if (onScreen !== undefined) rivals.push(onScreen);
      }
    }
    older = previous;
    previous = current;
  }
  return { own: summarize(own), rivalsOnScreen: summarize(rivals) };
}
