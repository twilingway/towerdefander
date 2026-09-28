import { interpolateAngle } from "../../game/playback.js";
import type { PredictedPoseFrame } from "../shipPrediction.js";

/**
 * The hull's newest steps, drawn at the instant a frame is for.
 *
 * A device run steps at 60 Hz and a panel draws at whatever it draws at. A
 * hull drawn on its newest whole step holds for two or three frames of a
 * 165 Hz panel and then jumps, and the camera follows it, so the whole screen
 * jumps - including every rival flying beside it, which is drawn smoothly in
 * the world and shakes on the glass. So the hull is drawn between the two
 * steps around the frame's instant instead; the step clock's lead makes sure
 * the later of them is already taken (`clock.ts`).
 */
export interface PoseTrack {
  /** A step's pose. A tick below the newest is a restarted run and drops the rest. */
  push(tick: number, pose: PredictedPoseFrame): void;
  /**
   * The pose for this frame at a fractional tick, and the tick it was actually
   * drawn at: clamped to the steps held, so a late step holds the newest one
   * rather than guessing past it, and never below the tick drawn last in the
   * same run.
   *
   * Never back, because a frame that drew a later instant and then an earlier
   * one is a hull - and a camera - stepping backwards: a run that has stopped
   * stepping while its clock still turns, or a stale anchor for one frame after
   * a pause. Holding is the honest picture of both.
   *
   * The answer is reused and valid until the next call.
   */
  sample(tick: number): { readonly pose: PredictedPoseFrame; readonly tick: number } | undefined;
}

/**
 * Two steps to draw between, and one more for a run in a worker, whose lead
 * can put the newest step past the one the frame needs.
 */
const CAPACITY = 3;

/**
 * Faster than anything flies: a hull that covered this in a step was placed,
 * not flown - a hull that is gone and reads as the origin, say - and is drawn
 * where it landed rather than swept across the field.
 */
const PLACED_UNITS_PER_TICK = 50;

interface HeldStep {
  readonly tick: number;
  readonly pose: PredictedPoseFrame;
}

export function createPoseTrack(): PoseTrack {
  const steps: HeldStep[] = [];
  // Written in place every frame: this runs once a frame for the life of a run.
  const blended = {} as PredictedPoseFrame;
  const drawn: { pose: PredictedPoseFrame; tick: number } = { pose: blended, tick: 0 };
  let drawnOnce = false;

  return {
    push(tick, pose) {
      const newestTick = steps.at(-1)?.tick;
      if (newestTick !== undefined && tick < newestTick) {
        steps.length = 0;
        drawnOnce = false;
      }
      if (tick === newestTick) steps.pop();
      steps.push({ tick, pose });
      if (steps.length > CAPACITY) steps.shift();
    },

    sample(tick) {
      const oldest = steps[0];
      const newest = steps.at(-1);
      if (oldest === undefined || newest === undefined) return undefined;
      const notBack = drawnOnce ? Math.max(tick, drawn.tick) : tick;
      const at = Math.min(Math.max(notBack, oldest.tick), newest.tick);
      drawnOnce = true;
      drawn.tick = at;
      drawn.pose = newest.pose;
      let lower = oldest;
      for (const step of steps) {
        if (step.tick <= at) {
          lower = step;
          continue;
        }
        drawn.pose = at === lower.tick ? lower.pose : between(lower, step, at, blended);
        return drawn;
      }
      return drawn;
    }
  };
}

function between(
  lower: HeldStep,
  upper: HeldStep,
  tick: number,
  into: PredictedPoseFrame
): PredictedPoseFrame {
  const span = upper.tick - lower.tick;
  const dx = upper.pose.x - lower.pose.x;
  const dy = upper.pose.y - lower.pose.y;
  if (Math.hypot(dx, dy) > PLACED_UNITS_PER_TICK * span) return upper.pose;
  const amount = (tick - lower.tick) / span;
  // Rates and targets are the newer step's: they are read, not drawn.
  Object.assign(into, upper.pose);
  into.x = lower.pose.x + dx * amount;
  into.y = lower.pose.y + dy * amount;
  into.heading = interpolateAngle(lower.pose.heading, upper.pose.heading, amount);
  into.turretAngle = interpolateAngle(lower.pose.turretAngle, upper.pose.turretAngle, amount);
  return into;
}
