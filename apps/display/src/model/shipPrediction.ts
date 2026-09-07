import {
  advanceShipPose,
  type ShipDriveIntent,
  type ShipPose,
  type ShipPoseStats,
  type SpaceshipSimulationConfig
} from "@spaceship-defender/game-core";
import type { PublicShipDriveView } from "@spaceship-defender/protocol";

/**
 * The client half of prediction: the same step the room runs, over the input it
 * has not acknowledged yet.
 *
 * Everything here is pure. The wiring that hands it a room lives beside it; this
 * is the part that has to agree with the server exactly, so it is the part worth
 * testing on its own.
 */

/** The flat frame as it travels, mirrored by the reconciler. */
export interface PredictedInputFrame {
  readonly vectorX: number;
  readonly vectorY: number;
  readonly hasHelm: boolean;
  readonly turn: number;
  readonly thrust: number;
  readonly aimX: number;
  readonly aimY: number;
  readonly hasAimTurn: boolean;
  readonly aimTurn: number;
}

/** The pose as it travels, flat, with a flag beside each nullable bearing. */
export interface PredictedPoseFrame {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  heading: number;
  turretAngle: number;
  headingAngularVelocity: number;
  hasHeadingTarget: boolean;
  headingTargetAngle: number;
  turretAngularVelocity: number;
  hasTurretTarget: boolean;
  turretTargetAngle: number;
}

/**
 * A bearing named by a stick, as the room names it.
 *
 * The room turns the gunner's vector into an angle with `atan2` and stores that;
 * a replay has to do the same or the gun ends up somewhere else. A vector too
 * short to have a direction leaves the bearing alone, which is what a released
 * stick means.
 */
function aimBearing(frame: PredictedInputFrame, current: number | null): number | null {
  const length = Math.hypot(frame.aimX, frame.aimY);
  if (length < 1e-6) return current;
  return Math.atan2(frame.aimY, frame.aimX);
}

export function toDriveIntent(
  frame: PredictedInputFrame,
  pose: PredictedPoseFrame
): ShipDriveIntent {
  return {
    driveVector: { x: frame.vectorX, y: frame.vectorY },
    // Absent rather than zero: zero is "stop turning", which is a command.
    turn: frame.hasHelm ? frame.turn : null,
    thrust: frame.hasHelm ? frame.thrust : null,
    headingTargetAngle: pose.hasHeadingTarget ? pose.headingTargetAngle : null,
    turretTargetAngle: aimBearing(frame, pose.hasTurretTarget ? pose.turretTargetAngle : null),
    turretTurn: frame.hasAimTurn ? frame.aimTurn : null
  };
}

export function toShipPose(pose: PredictedPoseFrame): ShipPose {
  return {
    spaceship: {
      x: pose.x,
      y: pose.y,
      velocity: { x: pose.velocityX, y: pose.velocityY }
    },
    heading: pose.heading,
    headingTargetAngle: pose.hasHeadingTarget ? pose.headingTargetAngle : null,
    headingAngularVelocity: pose.headingAngularVelocity,
    turretAngle: pose.turretAngle,
    turretTargetAngle: pose.hasTurretTarget ? pose.turretTargetAngle : null,
    turretAngularVelocity: pose.turretAngularVelocity
  };
}

/**
 * The drive numbers as the run currently has them.
 *
 * Named from the wire rather than from a preset: a module that raised the top
 * speed raised the number the room steps with, and a client stepping with the
 * preset's would drift from the moment it was bought.
 */
export function toShipStats(drive: PublicShipDriveView): ShipPoseStats {
  return {
    spaceshipSpeedPerSecond: drive.speedPerSecond,
    spaceshipAccelerationPerSecondSquared: drive.accelerationPerSecondSquared,
    spaceshipBrakingPerSecondSquared: drive.brakingPerSecondSquared,
    spaceshipReverseSpeedFactor: drive.reverseSpeedFactor,
    headingMaxAngularSpeedPerSecond: drive.headingMaxAngularSpeed,
    headingAngularAccelerationPerSecondSquared: drive.headingAngularAcceleration,
    headingAngularBrakingPerSecondSquared: drive.headingAngularBraking,
    turretMaxAngularSpeedPerSecond: drive.turretMaxAngularSpeed,
    turretAngularAccelerationPerSecondSquared: drive.turretAngularAcceleration,
    turretAngularBrakingPerSecondSquared: drive.turretAngularBraking,
    spaceshipRadius: drive.hullRadius
  };
}

/**
 * One predicted step, written back into the mirror the reconciler owns.
 *
 * The reconciler hands a scratch copy and expects it mutated in place; the core
 * step is pure and returns a new pose, so this is the one place the two shapes
 * meet. Deliberately the only place, because a second translation is a second
 * chance to disagree with the server.
 */
export function stepPredictedPose(
  pose: PredictedPoseFrame,
  frame: PredictedInputFrame,
  config: SpaceshipSimulationConfig,
  stats: ShipPoseStats
): void {
  const next = advanceShipPose(toShipPose(pose), toDriveIntent(frame, pose), config, stats);
  pose.x = next.spaceship.x;
  pose.y = next.spaceship.y;
  pose.velocityX = next.spaceship.velocity.x;
  pose.velocityY = next.spaceship.velocity.y;
  pose.heading = next.heading;
  pose.turretAngle = next.turretAngle;
  pose.headingAngularVelocity = next.headingAngularVelocity;
  pose.hasHeadingTarget = next.headingTargetAngle !== null;
  pose.headingTargetAngle = next.headingTargetAngle ?? pose.headingTargetAngle;
  pose.turretAngularVelocity = next.turretAngularVelocity;
  pose.hasTurretTarget = next.turretTargetAngle !== null;
  pose.turretTargetAngle = next.turretTargetAngle ?? pose.turretTargetAngle;
}

/** Exactly what a replay mirrors; anything else would arrive as unexplainable drift. */
export const PREDICTED_POSE_FIELDS = [
  "x",
  "y",
  "velocityX",
  "velocityY",
  "heading",
  "turretAngle",
  "headingAngularVelocity",
  "hasHeadingTarget",
  "headingTargetAngle",
  "turretAngularVelocity",
  "hasTurretTarget",
  "turretTargetAngle"
] as const;
