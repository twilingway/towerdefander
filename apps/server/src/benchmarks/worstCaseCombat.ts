import {
  createSpaceshipSimulationConfig,
  getEnemyArchetype,
  createSpaceshipSimulationState,
  dynamicEntityCount,
  type AsteroidState,
  type CombatEnemyState,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState,
  type HomingMissileState,
  type HostileProjectileState,
  type ProjectileState
} from "@spaceship-defender/game-core";

const RUN_SEED = 0x5eed_196;

function requireWeapon(config: SpaceshipSimulationConfig, kind: string) {
  const weapon = getEnemyArchetype(config, kind).weapons[0];
  if (weapon === undefined) throw new Error(`archetype ${kind} has no weapon`);
  return weapon;
}

interface EntityPosition {
  readonly x: number;
  readonly y: number;
}

/**
 * Builds the deterministic cap-filled input used by both the manual benchmark and regression tests.
 * Entities are spread over separate world bands so the step exercises movement, AI and the spatial
 * broad phase without immediately deleting most of the fixture through collisions.
 */
export function createWorstCaseCombatFixture(
  config: SpaceshipSimulationConfig = createSpaceshipSimulationConfig()
): SpaceshipSimulationState {
  const base = createSpaceshipSimulationState(config, RUN_SEED);
  let spawnSequence = 1;
  const enemies = Array.from({ length: config.caps.enemyShips }, (_, index) => {
    const position = ringPosition(
      index,
      config.caps.enemyShips,
      config,
      config.arenaRadius * 0.75,
      0.1
    );
    const sequence = spawnSequence++;
    return {
      ...movingEntity(`enemy-${String(sequence)}`, sequence, position, { x: 18, y: 4 }),
      kind: index % 3 === 0 ? "missileCarrier" : "gunship",
      heading: 0.2,
      hp: 10_000,
      maxHp: 10_000,
      weaponCooldownTicks: [10_000]
    } satisfies CombatEnemyState;
  });
  const asteroids = Array.from({ length: config.caps.asteroids }, (_, index) => {
    const position = ringPosition(
      index,
      config.caps.asteroids,
      config,
      config.arenaRadius * 0.86,
      0.2
    );
    const sequence = spawnSequence++;
    return {
      ...movingEntity(`asteroid-${String(sequence)}`, sequence, position, { x: -20, y: -8 }),
      origin: "wave",
      hp: 10_000,
      maxHp: 10_000,
      damage: config.asteroidDamage
    } satisfies AsteroidState;
  });
  const hostileProjectiles = Array.from({ length: config.caps.hostileProjectiles }, (_, index) => {
    const position = multiRingPosition(
      index,
      config.caps.hostileProjectiles,
      config,
      [0.23, 0.41, 0.59].map((ratio) => config.arenaRadius * ratio),
      0.3
    );
    const sequence = spawnSequence++;
    const weapon = requireWeapon(config, "gunship");
    return {
      ...movingEntity(`hostile-${String(sequence)}`, sequence, position, { x: 9, y: 3 }, 7),
      damage: weapon.damage,
      shieldHitCost: weapon.shieldHitCost,
      lifetimeTicks: weapon.projectileLifetimeTicks,
      visual: weapon.visual
    } satisfies HostileProjectileState;
  });
  const homingMissiles = Array.from({ length: config.caps.homingMissiles }, (_, index) => {
    const position = ringPosition(
      index,
      config.caps.homingMissiles,
      config,
      config.arenaRadius * 0.7,
      0.4
    );
    const sequence = spawnSequence++;
    const weapon = requireWeapon(config, "missileCarrier");
    return {
      ...movingEntity(`missile-${String(sequence)}`, sequence, position, { x: 12, y: -6 }, 12),
      heading: -0.4,
      damage: weapon.damage,
      shieldHitCost: weapon.shieldHitCost,
      lifetimeTicks: weapon.projectileLifetimeTicks,
      speedPerSecond: weapon.projectileSpeedPerSecond,
      turnRatePerSecond: weapon.turnRatePerSecond,
      visual: weapon.visual
    } satisfies HomingMissileState;
  });
  const projectiles = Array.from({ length: config.caps.friendlyProjectiles }, (_, index) => {
    const position = ringPosition(
      index,
      config.caps.friendlyProjectiles,
      config,
      config.arenaRadius * 0.5,
      0.5
    );
    const sequence = spawnSequence++;
    const id = `friendly-${String(sequence)}`;
    return {
      ...movingEntity(id, sequence, position, { x: 16, y: 0 }, 8),
      projectileId: id,
      damage: config.friendlyProjectileDamage,
      source: "cannon"
    } satisfies ProjectileState;
  });

  const fixture: SpaceshipSimulationState = {
    ...base,
    clock: { tick: 100, elapsedMs: 5_000 },
    encounterTick: 100,
    pendingSpawns: [],
    nextSpawnSequence: spawnSequence,
    enemies,
    asteroids,
    hostileProjectiles,
    homingMissiles,
    projectiles,
    nextProjectileSequence: config.caps.friendlyProjectiles,
    lastFiredTick: 100
  };
  if (dynamicEntityCount(fixture) !== config.caps.dynamicEntities) {
    throw new Error("Worst-case combat fixture must fill the 196-entity dynamic cap exactly.");
  }
  return fixture;
}

function movingEntity(
  id: string,
  spawnSequence: number,
  position: EntityPosition,
  velocity: { readonly x: number; readonly y: number },
  radius = 18
) {
  return {
    id,
    spawnSequence,
    previousX: position.x,
    previousY: position.y,
    x: position.x,
    y: position.y,
    velocity,
    radius,
    spawnedTick: 100
  };
}

function ringPosition(
  index: number,
  count: number,
  config: SpaceshipSimulationConfig,
  radius: number,
  angleOffset: number
): EntityPosition {
  const angle = angleOffset + (index / count) * Math.PI * 2;
  return {
    x: config.worldWidth / 2 + Math.cos(angle) * radius,
    y: config.worldHeight / 2 + Math.sin(angle) * radius
  };
}

function multiRingPosition(
  index: number,
  count: number,
  config: SpaceshipSimulationConfig,
  radii: readonly number[],
  angleOffset: number
): EntityPosition {
  const ringIndex = index % radii.length;
  const radius = radii[ringIndex];
  if (radius === undefined) throw new Error("Worst-case fixture requires at least one ring.");
  const ringCount = Math.ceil((count - ringIndex) / radii.length);
  const indexInRing = Math.floor(index / radii.length);
  return ringPosition(indexInRing, ringCount, config, radius, angleOffset + ringIndex * 0.17);
}
