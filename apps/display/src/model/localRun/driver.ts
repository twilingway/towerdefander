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

      /*
       * Off the run, not off the mirror.
       *
       * The mirror is the published frame and it is written thirty times a
       * second, so reading the pose from it drew the hull at the publish rate
       * however fast the panel was - a step the hand had already made would sit
       * unseen for up to a frame and a half, then arrive all at once. That is
       * judder, and it is worst exactly where the eye tracks the hull against
       * something else: reversing, or holding an angle while firing sideways.
       */
      const game = run.state();
      return {
        x: game.spaceship.x,
        y: game.spaceship.y,
        velocityX: game.spaceship.velocity.x,
        velocityY: game.spaceship.velocity.y,
        heading: game.spaceshipHeading,
        turretAngle: game.turretAngle,
        headingAngularVelocity: game.headingAngularVelocity,
        hasHeadingTarget: game.headingTargetAngle !== null,
        headingTargetAngle: game.headingTargetAngle ?? 0,
        turretAngularVelocity: game.turretAngularVelocity,
        hasTurretTarget: game.turretTargetAngle !== null,
        turretTargetAngle: game.turretTargetAngle ?? 0
      };
    },

    bind: () => undefined,
    read: () => ({ x: 0, y: 0, rotation: 0 }),
    angleOf: () => 0
  };
}
