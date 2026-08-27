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

  const positiveFiniteNumbers: readonly (readonly [string, number])[] = [
    ["worldWidth", config.worldWidth],
    ["worldHeight", config.worldHeight],
    ["cameraViewWidth", config.cameraViewWidth],
    ["spaceshipSpeedPerSecond", config.spaceshipSpeedPerSecond],
    ["spaceshipAccelerationPerSecondSquared", config.spaceshipAccelerationPerSecondSquared],
    ["spaceshipBrakingPerSecondSquared", config.spaceshipBrakingPerSecondSquared],
    ["spaceshipRadius", config.spaceshipRadius],
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
