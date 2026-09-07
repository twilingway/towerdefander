import {
  advanceShipPose,
  canonicalizeAngle,
  normalizeVector,
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
 * The bearing a stick names, derived exactly as the room derives it.
 *
 * This is the whole of why the ship would not turn under prediction: the room
 * computes a fresh target from the vector on every frame, and a replay that
 * merely carries the last published one steers nowhere. Three rules, and all
 * three matter - a rate cancels the bearing, a released stick keeps the last
 * one, and anything else is the vector's own angle.
 */
function derivedTarget(
  vector: { x: number; y: number },
  turn: number | null,
  previous: number | null
): number | null {
  if (turn !== null) return null;
  const normalized = normalizeVector(vector);
  if (normalized.x === 0 && normalized.y === 0) return previous;
  return canonicalizeAngle(Math.atan2(normalized.y, normalized.x));
}

export function toDriveIntent(
  frame: PredictedInputFrame,
  pose: PredictedPoseFrame
): ShipDriveIntent {
  const drive = { x: frame.vectorX, y: frame.vectorY };
  const helmTurn = frame.hasHelm ? frame.turn : null;
  const aimTurn = frame.hasAimTurn ? frame.aimTurn : null;
  return {
    // Normalised the way the room stores it, so the step reads the same vector
    // on both sides rather than one that is a fraction longer.
    driveVector: normalizeVector(drive),
    // Absent rather than zero: zero is "stop turning", which is a command.
    turn: helmTurn,
    thrust: frame.hasHelm ? frame.thrust : null,
    headingTargetAngle: derivedTarget(
      drive,
      helmTurn,
      pose.hasHeadingTarget ? pose.headingTargetAngle : null
    ),
    turretTargetAngle: derivedTarget(
      { x: frame.aimX, y: frame.aimY },
      aimTurn,
      pose.hasTurretTarget ? pose.turretTargetAngle : null
    ),
    turretTurn: aimTurn
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

/**
 * Which world collection an entity came from, and therefore how it is drawn.
 *
 * The bearing is the reason the kind travels: a hull publishes one and it is
 * interpolated on the shortest arc, while a shell has none and its bearing is
 * simply where it is going.
 */
export type LiveEntityKind = "enemy" | "asteroid" | "loot" | "projectile" | "missile";

/** A live entity, bound once when its sprite is made rather than looked up per frame. */
export interface LiveEntity {
  readonly ref: object;
  readonly kind: LiveEntityKind;
}

/** Where a bound entity is drawn this frame. */
export interface LivePlacement {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

/**
 * What the scene is handed when prediction is running: one call per drawn
 * frame for our own ship, and a way to read everything else off the same clock.
 *
 * The pairing is the point. Reading the ship from the predictor and the world
 * from the twenty-hertz snapshot puts them on two clocks - the ship at present,
 * the world a buffer behind - and shells then leave the barrel from where the
 * hull used to be.
 */
export interface PredictionDriver {
  /** Steps the prediction, sends exactly what it stepped, returns the pose. */
  drive(): PredictedPoseFrame | undefined;
  /** The live entity behind an id, or undefined if the room does not have it. */
  bind(entityId: string, kind: LiveEntityKind): LiveEntity | undefined;
  read(entity: LiveEntity): LivePlacement;
}
