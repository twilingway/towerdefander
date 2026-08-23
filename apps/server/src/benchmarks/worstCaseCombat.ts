import {
  createSpaceshipSimulationConfig,
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
    const position = gridPosition(index, config.caps.enemyShips, 260, 260, 4_280, 620);
    const sequence = spawnSequence++;
    return {
      ...movingEntity(`enemy-${String(sequence)}`, sequence, position, { x: 18, y: 4 }),
      kind: index % 3 === 0 ? "missileCarrier" : "gunship",
      heading: 0.2,
      hp: 10_000,
      maxHp: 10_000,
      attackCooldownTicks: 10_000
    } satisfies CombatEnemyState;
  });
  const asteroids = Array.from({ length: config.caps.asteroids }, (_, index) => {
    const position = gridPosition(index, config.caps.asteroids, 320, 2_520, 4_160, 360);
    const sequence = spawnSequence++;
    return {
      ...movingEntity(`asteroid-${String(sequence)}`, sequence, position, { x: -20, y: -8 }),
      hp: 10_000,
      maxHp: 10_000,
      damage: config.asteroidDamage
    } satisfies AsteroidState;
  });
  const hostileProjectiles = Array.from({ length: config.caps.hostileProjectiles }, (_, index) => {
    const position = gridPosition(index, config.caps.hostileProjectiles, 180, 1_020, 4_440, 380);
    const sequence = spawnSequence++;
    return {
      ...movingEntity(`hostile-${String(sequence)}`, sequence, position, { x: 9, y: 3 }, 7),
      damage: config.hostileBulletDamage
    } satisfies HostileProjectileState;
  });
  const homingMissiles = Array.from({ length: config.caps.homingMissiles }, (_, index) => {
    const position = gridPosition(index, config.caps.homingMissiles, 420, 2_140, 3_960, 180);
    const sequence = spawnSequence++;
    return {
      ...movingEntity(`missile-${String(sequence)}`, sequence, position, { x: 12, y: -6 }, 12),
      heading: -0.4,
      damage: config.missileDamage
    } satisfies HomingMissileState;
  });
  const projectiles = Array.from({ length: config.caps.friendlyProjectiles }, (_, index) => {
    const position = gridPosition(index, config.caps.friendlyProjectiles, 260, 1_680, 4_280, 220);
    const sequence = spawnSequence++;
    const id = `friendly-${String(sequence)}`;
    return {
      ...movingEntity(id, sequence, position, { x: 16, y: 0 }, 8),
      projectileId: id,
      damage: config.friendlyProjectileDamage
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

function gridPosition(
  index: number,
  count: number,
  left: number,
  top: number,
  width: number,
  height: number
): EntityPosition {
  const columns = Math.ceil(Math.sqrt(count * (width / Math.max(height, 1))));
  const rows = Math.ceil(count / columns);
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: left + ((column + 0.5) / columns) * width,
    y: top + ((row + 0.5) / rows) * height
  };
}
