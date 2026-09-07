import type { ShipStats } from "./shipStats.ts";
import {
  advanceAngularRate,
  advanceAngularTraverse,
  canonicalizeAngle,
  moveSpaceshipWithinWorld,
  moveVectorTowards,
  shortestAngleDelta
} from "./simulationMath.ts";
import type {
  SpaceshipKinematics,
  SpaceshipSimulationConfig,
  Vector2
} from "./spaceshipSimulation.ts";

/**
 * Every ship stat this step reads, named once.
 *
 * The list is the contract with the wire: a client replaying an input needs
 * exactly these numbers and no others. It is checked rather than trusted - a
 * test perturbs each one and requires the ship to come out different, so a
 * field that stopped mattering cannot sit here unnoticed, and one that started
 * mattering cannot stay off the wire.
 */
export const SHIP_POSE_STAT_FIELDS = [
  "spaceshipSpeedPerSecond",
  "spaceshipAccelerationPerSecondSquared",
  "spaceshipBrakingPerSecondSquared",
  "spaceshipReverseSpeedFactor",
  "headingMaxAngularSpeedPerSecond",
  "headingAngularAccelerationPerSecondSquared",
  "headingAngularBrakingPerSecondSquared",
  "turretMaxAngularSpeedPerSecond",
  "turretAngularAccelerationPerSecondSquared",
  "turretAngularBrakingPerSecondSquared"
] as const;

/**
 * Where the ship is, which way it points, and everything the drive carries
 * between frames.
 *
 * A pose rather than a position: the angular velocities and the bearings being
 * closed on are as much part of it as x and y. A step that starts from half of
 * this produces a different ship, and the difference accumulates - which is the
 * whole reason it is one type and travels as one.
 */
export interface ShipPose {
  readonly spaceship: SpaceshipKinematics;
  readonly heading: number;
  readonly headingTargetAngle: number | null;
  readonly headingAngularVelocity: number;
  readonly turretAngle: number;
  readonly turretTargetAngle: number | null;
  readonly turretAngularVelocity: number;
}

/**
 * One frame of intent, already resolved.
 *
 * Freshness, ownership and validation are the room's business and are settled
 * before this is built; what arrives here is what the pilot and the gunner
 * actually asked for this step. Keeping the decisions out means the client can
 * replay a frame without reproducing the room's rules about whose input counts.
 */
export interface ShipDriveIntent {
  /** Bearing and throttle in one, from a stick. Ignored when `thrust` is given. */
  readonly driveVector: Vector2;
  /** Tank helm: a yaw rate and a push along the nose. Null means the stick. */
  readonly turn: number | null;
  readonly thrust: number | null;
  /** The bearing the hull is closing on, or null when it is being spun. */
  readonly headingTargetAngle: number | null;
  /** The bearing the turret is closing on, in world terms, before the carry. */
  readonly turretTargetAngle: number | null;
  /** A traverse rate from the gunner; a rate has no memory, so zero means stop. */
  readonly turretTurn: number | null;
}

/**
 * Advances the ship a whole step: velocity, position, hull bearing and turret.
 *
 * Pure, and deliberately the only place this arithmetic exists. The room runs it
 * inside its own step and the client runs it to replay the input the server has
 * not acknowledged yet; a second copy would drift apart on the first tuning
 * change, and silently, because divergence only ever shows up as a ship that
 * slides back into place.
 */
export function advanceShipPose(
  pose: ShipPose,
  intent: ShipDriveIntent,
  config: SpaceshipSimulationConfig,
  ship: ShipStats
): ShipPose {
  const secondsPerStep = config.fixedStepMs / 1000;
  const pilotSpeed = ship.spaceshipSpeedPerSecond;
  // With a turn intent the push runs along the nose, so reverse is the same
  // burn with a negative sign and it never turns the hull.
  // Reverse is deliberately the slower gear; see the config field.
  const thrustSpeed =
    intent.thrust !== null && intent.thrust < 0
      ? pilotSpeed * ship.spaceshipReverseSpeedFactor
      : pilotSpeed;
  const targetVelocity =
    intent.thrust === null
      ? { x: intent.driveVector.x * pilotSpeed, y: intent.driveVector.y * pilotSpeed }
      : {
          x: Math.cos(pose.heading) * thrustSpeed * intent.thrust,
          y: Math.sin(pose.heading) * thrustSpeed * intent.thrust
        };
  const coasting =
    intent.thrust === null
      ? intent.driveVector.x === 0 && intent.driveVector.y === 0
      : intent.thrust === 0;
  const velocityDelta = coasting
    ? ship.spaceshipBrakingPerSecondSquared * secondsPerStep
    : ship.spaceshipAccelerationPerSecondSquared * secondsPerStep;
  const nextVelocity = moveVectorTowards(pose.spaceship.velocity, targetVelocity, velocityDelta);
  const spaceship = moveSpaceshipWithinWorld(
    pose.spaceship,
    nextVelocity,
    secondsPerStep,
    config,
    ship
  );

  // The hull turns before the turret does, because a mounted turret needs how
  // far the hull went this step. Nothing else here depends on the order.
  const headingConfig = {
    maxAngularSpeed: ship.headingMaxAngularSpeedPerSecond,
    angularAcceleration: ship.headingAngularAccelerationPerSecondSquared,
    angularBraking: ship.headingAngularBrakingPerSecondSquared,
    secondsPerStep
  };
  const headingTraverse =
    intent.turn === null
      ? advanceAngularTraverse(
          {
            angle: pose.heading,
            targetAngle: intent.headingTargetAngle,
            angularVelocity: pose.headingAngularVelocity
          },
          headingConfig
        )
      : advanceAngularRate(
          { angle: pose.heading, angularVelocity: pose.headingAngularVelocity },
          intent.turn,
          headingConfig
        );

  /*
   * How far the hull swung this step, and therefore how far it drags the gun.
   *
   * Both the turret and its target move: carrying only the gun would leave it
   * chasing a bearing the chassis has already left, and carrying only the
   * target would make the traverse pay for a rotation it never performed.
   */
  const hullCarry = config.turretMountedOnHull
    ? shortestAngleDelta(pose.heading, headingTraverse.angle)
    : 0;
  const carriedTargetAngle =
    intent.turretTargetAngle === null
      ? null
      : canonicalizeAngle(intent.turretTargetAngle + hullCarry);
  const carriedTurretAngle = canonicalizeAngle(pose.turretAngle + hullCarry);
  const turretConfig = {
    maxAngularSpeed: ship.turretMaxAngularSpeedPerSecond,
    angularAcceleration: ship.turretAngularAccelerationPerSecondSquared,
    angularBraking: ship.turretAngularBrakingPerSecondSquared,
    secondsPerStep
  };
  /*
   * An intent wins over a bearing when one arrives, exactly as it does at the
   * helm. A gunner who can only name an angle can only name the authoritative
   * one, already a patch plus a ping old, so a released stick used to send the
   * gun back to where it had been. A rate has no such memory: zero means stop.
   */
  const turretTraverse =
    intent.turretTurn === null
      ? advanceAngularTraverse(
          {
            angle: carriedTurretAngle,
            targetAngle: carriedTargetAngle,
            angularVelocity: pose.turretAngularVelocity
          },
          turretConfig
        )
      : advanceAngularRate(
          { angle: carriedTurretAngle, angularVelocity: pose.turretAngularVelocity },
          intent.turretTurn,
          turretConfig
        );

  return {
    spaceship,
    heading: headingTraverse.angle,
    headingTargetAngle: intent.headingTargetAngle,
    headingAngularVelocity: headingTraverse.angularVelocity,
    turretAngle: turretTraverse.angle,
    turretTargetAngle: carriedTargetAngle,
    turretAngularVelocity: turretTraverse.angularVelocity
  };
}
