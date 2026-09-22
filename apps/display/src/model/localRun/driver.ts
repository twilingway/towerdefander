import type { PredictionDriver, PredictedPoseFrame } from "../shipPrediction.js";
import type { LocalIntent, LocalRun } from "./engine.js";
import type { StepClock } from "./clock.js";

/**
 * The run stepped inside the frame that draws it.
 *
 * The scene calls `drive()` at the top of every frame it paints, which is the
 * one moment in the loop where stepping is worth anything: the intent read a
 * line earlier reaches the simulation before the same frame is drawn, so what
 * the hand did is on screen at once rather than a frame - or a round trip -
 * later. That is the whole of the promised response.
 *
 * `bind` answers undefined on purpose. In a networked run it hands the scene a
 * decoder-owned entity to interpolate between patches; there is no such thing
 * here, and the scene already falls back to interpolating the snapshot track it
 * is given - in gameplay ticks, which is exactly right for a tick stream this
 * page produced itself.
 */
export interface LocalDriverOptions {
  readonly run: LocalRun;
  readonly clock: StepClock;
  readonly readIntent: () => LocalIntent;
  /** Publishing is the host's business; the driver only says a frame happened. */
  readonly onStepped: (steps: number, costMs: number) => void;
  readonly paused: () => boolean;
}

export function createLocalDriver({
  run,
  clock,
  readIntent,
  onStepped,
  paused
}: LocalDriverOptions): PredictionDriver {
  return {
    drive(): PredictedPoseFrame | undefined {
      const now = performance.now();
      if (paused()) {
        // Not a step of zero: the gap has to be forgotten, or coming back would
        // spend it as a burst of catch-up.
        clock.reset(now);
        return undefined;
      }

      const steps = clock.stepsFor(now);
      if (steps > 0) {
        const intent = readIntent();
        for (let index = 0; index < steps; index += 1) run.step(intent);
        onStepped(steps, performance.now() - now);
      }

      const pose = run.mirror.game.display.pose;
      return {
        x: pose.x,
        y: pose.y,
        velocityX: pose.velocityX,
        velocityY: pose.velocityY,
        heading: pose.heading,
        turretAngle: pose.turretAngle,
        headingAngularVelocity: pose.headingAngularVelocity,
        hasHeadingTarget: pose.hasHeadingTarget,
        headingTargetAngle: pose.headingTargetAngle,
        turretAngularVelocity: pose.turretAngularVelocity,
        hasTurretTarget: pose.hasTurretTarget,
        turretTargetAngle: pose.turretTargetAngle
      };
    },

    bind: () => undefined,
    read: () => ({ x: 0, y: 0, rotation: 0 }),
    angleOf: () => 0
  };
}
