import {
  ENEMY_SKILL_LEVELS,
  SPAWN_SECTORS,
  type CombatConfig,
  type EnemyArchetype,
  type EnemyKind
} from "./combatTypes.ts";
import { MAX_PUBLIC_TRANSIENT_PADDING, UINT32_MAX } from "./combatConstants.ts";

export function validateRunSeed(runSeed: number): void {
  if (!Number.isInteger(runSeed) || runSeed <= 0 || runSeed > UINT32_MAX) {
    throw new RangeError("runSeed must be a non-zero uint32");
  }
}

export function validateCombatConfig(config: CombatConfig): void {
  if (config.fixedStepMs !== 50) {
    throw new RangeError("fixedStepMs must be exactly 50 for combat simulation");
  }
  const positiveIntegers: readonly (readonly [string, number])[] = [
    ["enemySpawnIntervalTicks", config.enemySpawnIntervalTicks],
    ["ambientAsteroidIntervalMinTicks", config.ambientAsteroidIntervalMinTicks],
    ["ambientAsteroidIntervalMaxTicks", config.ambientAsteroidIntervalMaxTicks],
    ["intermissionTicks", config.intermissionTicks],
    ["waveCampaign.director.baseBudget", config.waveCampaign.director.baseBudget],
    ["waveCampaign.director.budgetGrowth", config.waveCampaign.director.budgetGrowth],
    ["waveCampaign.director.budgetCap", config.waveCampaign.director.budgetCap],
    ["asteroidLifetimeTicks", config.asteroidLifetimeTicks],
    ["asteroidSpawnCost", config.asteroidSpawnCost],
    ["lootLifetimeTicks", config.lootLifetimeTicks],
    ["lootWindowTicks", config.lootWindowTicks],
    ["lootBossWindowTicks", config.lootBossWindowTicks],
    ["caps.enemyShips", config.caps.enemyShips],
    ["caps.asteroids", config.caps.asteroids],
    ["caps.hostileProjectiles", config.caps.hostileProjectiles],
    ["caps.homingMissiles", config.caps.homingMissiles],
    ["caps.friendlyProjectiles", config.caps.friendlyProjectiles],
    ["caps.lootDrops", config.caps.lootDrops],
    ["caps.dynamicEntities", config.caps.dynamicEntities]
  ];
  for (const [name, value] of positiveIntegers) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }

  const positiveFinite: readonly (readonly [string, number])[] = [
    ["worldWidth", config.worldWidth],
    ["worldHeight", config.worldHeight],
    ["arenaRadius", config.arenaRadius],
    ["spaceshipMaxHp", config.spaceshipMaxHp],
    ["shieldRadius", config.shieldRadius],
    ["shieldArcRadians", config.shieldArcRadians],
    ["asteroidShieldHitCost", config.asteroidShieldHitCost],
    ["asteroidDamage", config.asteroidDamage],
    ["friendlyProjectileDamage", config.friendlyProjectileDamage],
    ["waveCampaign.director.hpGrowth", config.waveCampaign.director.hpGrowth],
    ["waveCampaign.director.hpMultiplierCap", config.waveCampaign.director.hpMultiplierCap],
    ["waveCampaign.director.tempoGrowth", config.waveCampaign.director.tempoGrowth],
    ["waveCampaign.director.tempoMultiplierCap", config.waveCampaign.director.tempoMultiplierCap],
    ["asteroidHp", config.asteroidHp],
    ["asteroidRadius", config.asteroidRadius],
    ["asteroidSpeedPerSecond", config.asteroidSpeedPerSecond],
    ["shieldCapacity", config.shieldCapacity],
    ["lootShieldAmount", config.lootShieldAmount],
    ["lootDropRadius", config.lootDropRadius],
    ["lootMagnetRadius", config.lootMagnetRadius],
    ["lootMagnetAccelerationPerSecondSquared", config.lootMagnetAccelerationPerSecondSquared],
    ["worldPadding", config.worldPadding],
    ["spatialCellSize", config.spatialCellSize]
  ];
  for (const [name, value] of positiveFinite) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number`);
    }
  }
  if (
    !Number.isFinite(config.lootRepairShare) ||
    config.lootRepairShare < 0 ||
    config.lootRepairShare > 1
  ) {
    throw new RangeError("lootRepairShare must be a fraction of the hull between 0 and 1");
  }
  if (
    !Number.isFinite(config.lootBossRepairShare) ||
    config.lootBossRepairShare < 0 ||
    config.lootBossRepairShare > 1
  ) {
    throw new RangeError("lootBossRepairShare must be a fraction of the hull between 0 and 1");
  }
  const nonNegativeFinite: readonly (readonly [string, number])[] = [
    ["lootDriftDampingPerSecond", config.lootDriftDampingPerSecond],
    ["asteroidScoreReward", config.asteroidScoreReward],
    ["asteroidCreditReward", config.asteroidCreditReward],
    ["missileInterceptScoreReward", config.missileInterceptScoreReward]
  ];
  for (const [name, value] of nonNegativeFinite) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative finite number`);
    }
  }
  validateEnemyArchetypes(config);
  validateWaveCampaign(config);
  if (config.shieldArcRadians > Math.PI * 2) {
    throw new RangeError("shieldArcRadians cannot exceed a full circle");
  }
  if (config.worldWidth !== config.worldHeight || config.worldWidth !== config.arenaRadius * 2) {
    throw new RangeError("worldWidth and worldHeight must equal the arena diameter");
  }
  if (config.ambientAsteroidIntervalMinTicks > config.ambientAsteroidIntervalMaxTicks) {
    throw new RangeError(
      "ambientAsteroidIntervalMinTicks cannot exceed ambientAsteroidIntervalMaxTicks"
    );
  }
  for (const archetype of Object.values(config.enemyArchetypes)) {
    if (archetype.radius > config.arenaRadius) {
      throw new RangeError("enemy ship radii must fit inside the circular arena");
    }
  }
  if (config.worldPadding > MAX_PUBLIC_TRANSIENT_PADDING) {
    throw new RangeError("worldPadding cannot exceed the public transient envelope");
  }
  if (config.asteroidRadius > config.worldPadding) {
    throw new RangeError("worldPadding must fit an asteroid spawned on the arena perimeter");
  }
  const typedCapTotal =
    config.caps.enemyShips +
    config.caps.asteroids +
    config.caps.hostileProjectiles +
    config.caps.homingMissiles +
    config.caps.friendlyProjectiles +
    config.caps.lootDrops;
  if (config.caps.dynamicEntities > typedCapTotal) {
    throw new RangeError("dynamicEntities cap cannot exceed the sum of typed caps");
  }
  validateEnemySkill(config);
}

/**
 * Every knob is bounded, because a profile arrives from an operator's preset
 * and the behaviour pass divides by the range band and normalises by the
 * weights. An unbounded value there is a NaN in the enemy's course.
 */
function validateEnemySkill(config: CombatConfig): void {
  const { offset, profiles } = config.enemySkill;
  if (!Number.isSafeInteger(offset) || offset < -2 || offset > 2) {
    throw new RangeError("enemySkill.offset must be a whole step between -2 and 2");
  }
  for (const level of ENEMY_SKILL_LEVELS) {
    const profile = profiles[level];
    const wholeTicks: readonly (readonly [string, number])[] = [
      ["reactionTicks", profile.reactionTicks],
      ["evadeHorizonTicks", profile.evadeHorizonTicks]
    ];
    for (const [name, value] of wholeTicks) {
      if (!Number.isSafeInteger(value) || value < 0 || value > 40) {
        throw new RangeError(`enemySkill.${level}.${name} must be 0 to 40 whole ticks`);
      }
    }
    const unitFractions: readonly (readonly [string, number])[] = [
      ["leadFactor", profile.leadFactor],
      ["orbitShare", profile.orbitShare],
      ["separationWeight", profile.separationWeight],
      ["flankSpread", profile.flankSpread],
      ["retreatHpFraction", profile.retreatHpFraction]
    ];
    for (const [name, value] of unitFractions) {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`enemySkill.${level}.${name} must be a fraction between 0 and 1`);
      }
    }
    if (!Number.isFinite(profile.aimJitterRadians) || profile.aimJitterRadians < 0) {
      throw new RangeError(`enemySkill.${level}.aimJitterRadians must not be negative`);
    }
    if (profile.aimJitterRadians > 0.6) {
      throw new RangeError(`enemySkill.${level}.aimJitterRadians must not exceed 0.6`);
    }
    if (
      !Number.isFinite(profile.rangeBandUnits) ||
      profile.rangeBandUnits < 20 ||
      profile.rangeBandUnits > 1200
    ) {
      throw new RangeError(`enemySkill.${level}.rangeBandUnits must be 20 to 1200 units`);
    }
    if (
      !Number.isFinite(profile.retreatStandoffFactor) ||
      profile.retreatStandoffFactor < 1 ||
      profile.retreatStandoffFactor > 4
    ) {
      throw new RangeError(`enemySkill.${level}.retreatStandoffFactor must be 1 to 4`);
    }
  }
}

/** Config validation guarantees the id resolves; this keeps the hot path honest. */
export function getEnemyArchetype(config: CombatConfig, kind: EnemyKind): EnemyArchetype {
  return archetypeOf(config, kind);
}

export function archetypeOf(config: CombatConfig, kind: EnemyKind): EnemyArchetype {
  const archetype = config.enemyArchetypes[kind];
  if (archetype === undefined) {
    throw new RangeError(`enemyArchetypes has no archetype "${kind}"`);
  }
  return archetype;
}

export function enemyKindsOf(config: CombatConfig): readonly EnemyKind[] {
  return Object.keys(config.enemyArchetypes);
}

export function validateEnemyArchetypes(config: CombatConfig): void {
  const kinds = enemyKindsOf(config);
  if (kinds.length === 0) {
    throw new RangeError("enemyArchetypes must describe at least one archetype");
  }
  if (Object.hasOwn(config.enemyArchetypes, "asteroid")) {
    throw new RangeError('"asteroid" is the ambient hazard and cannot be an archetype id');
  }
  for (const kind of kinds) {
    const archetype = archetypeOf(config, kind);
    if (archetype.visual.shape.length === 0) {
      throw new RangeError(`${kind}.visual.shape must name a visual catalogue asset`);
    }
    if (
      !Number.isFinite(archetype.visual.modelScale) ||
      archetype.visual.modelScale < 0.2 ||
      archetype.visual.modelScale > 4
    ) {
      throw new RangeError(`${kind}.visual.modelScale must be between 0.2 and 4`);
    }
    if (!ENEMY_SKILL_LEVELS.includes(archetype.combatSkill)) {
      throw new RangeError(`${kind}.combatSkill must name a known skill level`);
    }
    if (archetype.label.length === 0) {
      throw new RangeError(`${kind}.label must not be empty`);
    }
    if (archetype.weapons.length === 0) {
      throw new RangeError(`${kind}.weapons must describe at least one weapon`);
    }
    const positiveIntegers: readonly (readonly [string, number])[] = [
      ["unlockWave", archetype.unlockWave],
      ...archetype.weapons.flatMap((weapon, index): readonly (readonly [string, number])[] => [
        [`weapons[${String(index)}].cooldownTicks`, weapon.cooldownTicks],
        [`weapons[${String(index)}].projectileLifetimeTicks`, weapon.projectileLifetimeTicks],
        [`weapons[${String(index)}].burstCount`, weapon.burstCount]
      ])
    ];
    for (const [name, value] of positiveIntegers) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError(`${kind}.${name} must be a positive safe integer`);
      }
    }
    const positiveFinite: readonly (readonly [string, number])[] = [
      ["hp", archetype.hp],
      ["radius", archetype.radius],
      ["speedPerSecond", archetype.speedPerSecond],
      ["preferredDistance", archetype.preferredDistance],
      ["turnRatePerSecond", archetype.turnRatePerSecond],
      ["turnAccelerationPerSecondSquared", archetype.turnAccelerationPerSecondSquared],
      ["turnBrakingPerSecondSquared", archetype.turnBrakingPerSecondSquared],
      ["spawnCost", archetype.spawnCost],
      ...archetype.weapons.flatMap((weapon, index): readonly (readonly [string, number])[] => [
        [`weapons[${String(index)}].damage`, weapon.damage],
        [`weapons[${String(index)}].shieldHitCost`, weapon.shieldHitCost],
        [`weapons[${String(index)}].projectileRadius`, weapon.projectileRadius],
        [`weapons[${String(index)}].projectileSpeedPerSecond`, weapon.projectileSpeedPerSecond],
        [`weapons[${String(index)}].engagementRange`, weapon.engagementRange],
        [`weapons[${String(index)}].turnRatePerSecond`, weapon.turnRatePerSecond]
      ])
    ];
    for (const [name, value] of positiveFinite) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${kind}.${name} must be a positive finite number`);
      }
    }
    const nonNegativeFinite: readonly (readonly [string, number])[] = [
      ["scoreReward", archetype.scoreReward],
      ["creditReward", archetype.creditReward],
      ...archetype.weapons.map((weapon, index): readonly [string, number] => [
        `weapons[${String(index)}].burstSpreadRadians`,
        weapon.burstSpreadRadians
      ])
    ];
    for (const [name, value] of nonNegativeFinite) {
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`${kind}.${name} must be a non-negative finite number`);
      }
    }
    if (
      !Number.isFinite(archetype.lootChance) ||
      archetype.lootChance < 0 ||
      archetype.lootChance > 1
    ) {
      throw new RangeError(`${kind}.lootChance must be a probability between 0 and 1`);
    }
    for (const [index, weapon] of archetype.weapons.entries()) {
      if (weapon.burstSpreadRadians > Math.PI * 2) {
        throw new RangeError(
          `${kind}.weapons[${String(index)}].burstSpreadRadians cannot exceed a full circle`
        );
      }
    }
  }
}

export function validateWaveCampaign(config: CombatConfig): void {
  const campaign = config.waveCampaign;
  const bossInterval = campaign.director.bossWaveInterval;
  if (bossInterval !== null && (!Number.isSafeInteger(bossInterval) || bossInterval <= 0)) {
    throw new RangeError(
      "waveCampaign.director.bossWaveInterval must be null or a positive integer"
    );
  }
  campaign.waves.forEach((wave, index) => {
    const label = `waveCampaign.waves[${String(index)}]`;
    if (wave.entries.length === 0) {
      throw new RangeError(`${label} must spawn at least one threat`);
    }
    for (const [name, value] of [
      ["hpMultiplier", wave.hpMultiplier],
      ["tempoMultiplier", wave.tempoMultiplier]
    ] as const) {
      if (value !== null && (!Number.isFinite(value) || value <= 0)) {
        throw new RangeError(`${label}.${name} must be null or a positive finite number`);
      }
    }
    wave.entries.forEach((entry, entryIndex) => {
      const entryLabel = `${label}.entries[${String(entryIndex)}]`;
      if (entry.kind !== "asteroid" && !Object.hasOwn(config.enemyArchetypes, entry.kind)) {
        throw new RangeError(`${entryLabel}.kind is not in the enemy catalogue`);
      }
      if (!Number.isSafeInteger(entry.count) || entry.count <= 0) {
        throw new RangeError(`${entryLabel}.count must be a positive safe integer`);
      }
      if (!Number.isSafeInteger(entry.spawnIntervalTicks) || entry.spawnIntervalTicks <= 0) {
        throw new RangeError(`${entryLabel}.spawnIntervalTicks must be a positive safe integer`);
      }
      if (!Number.isSafeInteger(entry.startDelayTicks) || entry.startDelayTicks < 0) {
        throw new RangeError(`${entryLabel}.startDelayTicks must be a non-negative safe integer`);
      }
      for (const sector of entry.sectors) {
        if (!SPAWN_SECTORS.includes(sector)) {
          throw new RangeError(`${entryLabel}.sectors contains an unknown spawn sector`);
        }
      }
      for (const [name, value] of [
        ["hpMultiplier", entry.hpMultiplier],
        ["tempoMultiplier", entry.tempoMultiplier]
      ] as const) {
        if (value !== null && (!Number.isFinite(value) || value <= 0)) {
          throw new RangeError(`${entryLabel}.${name} must be null or a positive finite number`);
        }
      }
    });
  });
}
