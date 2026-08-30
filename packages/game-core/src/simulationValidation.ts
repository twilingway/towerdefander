import { validateCombatConfig } from "./combatValidation.ts";
import { type SpaceshipSimulationConfig } from "./spaceshipSimulation.ts";
export function validateSpaceshipSimulationConfig(config: SpaceshipSimulationConfig): void {
  validateCombatConfig(config);
  const positiveSafeIntegers: readonly (readonly [string, number])[] = [
    ["fixedStepMs", config.fixedStepMs],
    ["inputTimeoutTicks", config.inputTimeoutTicks],
    ["projectileLifetimeMs", config.projectileLifetimeMs],
    ["fireCooldownTicks", config.fireCooldownTicks],
    ["mgFireCooldownTicks", config.mgFireCooldownTicks]
  ];

  for (const [name, value] of positiveSafeIntegers) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }

  // Zero is a legal setting for these: it means the shield keeps the instant
  // toggle it had before the phases existed.
  const nonNegativeSafeIntegers: readonly (readonly [string, number])[] = [
    ["shieldEngageTicks", config.shieldEngageTicks],
    ["shieldMinimumUpTicks", config.shieldMinimumUpTicks],
    ["shieldCooldownTicks", config.shieldCooldownTicks]
  ];

  for (const [name, value] of nonNegativeSafeIntegers) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }

  // Zero would re-arm a drained shield the instant it starts charging, which is
  // the behaviour the lockout exists to replace. Past the battery it could never
  // be reached, and the shield would be gone for the rest of the run.
  if (
    !Number.isFinite(config.shieldRearmEnergy) ||
    config.shieldRearmEnergy <= 0 ||
    config.shieldRearmEnergy > config.shieldCapacity
  ) {
    throw new RangeError("shieldRearmEnergy must be above 0 and no more than shieldCapacity");
  }

  const positiveFiniteNumbers: readonly (readonly [string, number])[] = [
    ["worldWidth", config.worldWidth],
    ["worldHeight", config.worldHeight],
    ["cameraViewWidth", config.cameraViewWidth],
    ["spaceshipSpeedPerSecond", config.spaceshipSpeedPerSecond],
    ["spaceshipAccelerationPerSecondSquared", config.spaceshipAccelerationPerSecondSquared],
    ["spaceshipBrakingPerSecondSquared", config.spaceshipBrakingPerSecondSquared],
    ["spaceshipRadius", config.spaceshipRadius],
    ["spaceshipReverseSpeedFactor", config.spaceshipReverseSpeedFactor],
    ["projectileSpeedPerSecond", config.projectileSpeedPerSecond],
    ["projectileRadius", config.projectileRadius],
    ["shieldCapacity", config.shieldCapacity],
    ["shieldDrainPerSecond", config.shieldDrainPerSecond],
    ["shieldRechargePerSecond", config.shieldRechargePerSecond],
    ["turretMaxAngularSpeedPerSecond", config.turretMaxAngularSpeedPerSecond],
    ["turretAngularAccelerationPerSecondSquared", config.turretAngularAccelerationPerSecondSquared],
    ["turretAngularBrakingPerSecondSquared", config.turretAngularBrakingPerSecondSquared],
    ["shieldMaxAngularSpeedPerSecond", config.shieldMaxAngularSpeedPerSecond],
    ["shieldAngularAccelerationPerSecondSquared", config.shieldAngularAccelerationPerSecondSquared],
    ["shieldAngularBrakingPerSecondSquared", config.shieldAngularBrakingPerSecondSquared],
    ["headingMaxAngularSpeedPerSecond", config.headingMaxAngularSpeedPerSecond],
    [
      "headingAngularAccelerationPerSecondSquared",
      config.headingAngularAccelerationPerSecondSquared
    ],
    ["headingAngularBrakingPerSecondSquared", config.headingAngularBrakingPerSecondSquared],
    ["mgDamage", config.mgDamage],
    ["mgProjectileSpeedPerSecond", config.mgProjectileSpeedPerSecond],
    ["mgProjectileRadius", config.mgProjectileRadius],
    ["cannonHeatCapacity", config.cannonHeatCapacity],
    ["cannonHeatPerShot", config.cannonHeatPerShot],
    ["mgHeatCapacity", config.mgHeatCapacity],
    ["mgHeatPerShot", config.mgHeatPerShot]
  ];

  for (const [name, value] of positiveFiniteNumbers) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number`);
    }
  }

  const nonNegativeFiniteNumbers: readonly (readonly [string, number])[] = [
    ["cannonCoolingPerSecond", config.cannonCoolingPerSecond],
    ["cannonRearmThreshold", config.cannonRearmThreshold],
    ["mgCoolingPerSecond", config.mgCoolingPerSecond],
    ["mgRearmThreshold", config.mgRearmThreshold]
  ];

  for (const [name, value] of nonNegativeFiniteNumbers) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative finite number`);
    }
  }

  if (config.cannonRearmThreshold > config.cannonHeatCapacity) {
    throw new RangeError("cannonRearmThreshold cannot exceed cannonHeatCapacity");
  }
  if (config.mgRearmThreshold > config.mgHeatCapacity) {
    throw new RangeError("mgRearmThreshold cannot exceed mgHeatCapacity");
  }

  if (config.arenaRadius < config.spaceshipRadius) {
    throw new RangeError("arenaRadius must fit the spaceship radius");
  }
}
