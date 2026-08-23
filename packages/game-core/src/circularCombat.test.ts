import { describe, expect, it } from "vitest";

import {
  advanceCombat,
  advanceSpaceshipSimulation,
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState,
  dynamicEntityCount,
  type AsteroidState,
  type CombatEnemyState,
  type ProjectileState,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState
} from "./index.js";

function combatStep(
  state: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig
): SpaceshipSimulationState {
  const result = advanceCombat(
    {
      ...state,
      spaceship: {
        ...state.spaceship,
        previousX: state.spaceship.previousX ?? state.spaceship.x,
        previousY: state.spaceship.previousY ?? state.spaceship.y,
        radius: config.spaceshipRadius
      }
    },
    config
  );
  return { ...state, ...result, projectiles: result.projectiles as readonly ProjectileState[] };
}

function quietEnemy(
  config: SpaceshipSimulationConfig,
  overrides: Partial<CombatEnemyState> = {}
): CombatEnemyState {
  return {
    id: "gunship-quiet",
    spawnSequence: 100,
    kind: "gunship",
    previousX: config.worldWidth / 2 + 700,
    previousY: config.worldHeight / 2,
    x: config.worldWidth / 2 + 700,
    y: config.worldHeight / 2,
    velocity: { x: 0, y: 0 },
    radius: config.gunshipRadius,
    spawnedTick: 0,
    heading: 0,
    hp: 1_000_000,
    maxHp: 1_000_000,
    attackCooldownTicks: 1_000_000,
    ...overrides
  };
}

function ambientAsteroid(
  config: SpaceshipSimulationConfig,
  index: number,
  overrides: Partial<AsteroidState> = {}
): AsteroidState {
  const angle = (index / config.caps.asteroids) * Math.PI * 2;
  const x = config.worldWidth / 2 + Math.cos(angle) * (config.arenaRadius - 100);
  const y = config.worldHeight / 2 + Math.sin(angle) * (config.arenaRadius - 100);
  return {
    id: `ambient-${String(index)}`,
    spawnSequence: 200 + index,
    origin: "ambient",
    previousX: x,
    previousY: y,
    x,
    y,
    velocity: { x: 0, y: 0 },
    radius: config.asteroidRadius,
    spawnedTick: 0,
    hp: config.asteroidHp,
    maxHp: config.asteroidHp,
    damage: config.asteroidDamage,
    ...overrides
  };
}

describe("circular combat spawning and movement", () => {
  it("spawns enemy ships deterministically around the whole legal circumference", () => {
    const config = createSpaceshipSimulationConfig({
      enemySpawnIntervalTicks: 1,
      ambientAsteroidIntervalMinTicks: 100,
      ambientAsteroidIntervalMaxTicks: 100
    });
    const quadrants = new Set<number>();

    for (let seed = 1; seed <= 32; seed += 1) {
      const initial = {
        ...createSpaceshipSimulationState(config, seed),
        pendingSpawns: [{ kind: "gunship" as const, planSequence: 0 }]
      };
      const first = advanceSpaceshipSimulation(initial, config);
      const replay = advanceSpaceshipSimulation(initial, config);
      expect(first.enemies).toEqual(replay.enemies);
      const enemy = first.enemies[0];
      expect(enemy).toBeDefined();
      if (enemy === undefined) continue;
      const deltaX = enemy.x - config.worldWidth / 2;
      const deltaY = enemy.y - config.worldHeight / 2;
      expect(Math.hypot(deltaX, deltaY) + enemy.radius).toBeCloseTo(config.arenaRadius);
      const angle = (Math.atan2(deltaY, deltaX) + Math.PI * 2) % (Math.PI * 2);
      quadrants.add(Math.floor(angle / (Math.PI / 2)) % 4);
    }

    expect(quadrants).toEqual(new Set([0, 1, 2, 3]));
  });

  it("spawns wave asteroids on the perimeter with an inward cross-arena velocity", () => {
    const config = createSpaceshipSimulationConfig({ enemySpawnIntervalTicks: 1 });
    const state = advanceSpaceshipSimulation(
      {
        ...createSpaceshipSimulationState(config, 55),
        pendingSpawns: [{ kind: "asteroid", planSequence: 0 }]
      },
      config
    );
    const asteroid = state.asteroids[0];
    expect(asteroid?.origin).toBe("wave");
    if (asteroid === undefined) return;
    const radialX = asteroid.x - config.worldWidth / 2;
    const radialY = asteroid.y - config.worldHeight / 2;
    expect(Math.hypot(radialX, radialY)).toBeCloseTo(config.arenaRadius);
    expect(radialX * asteroid.velocity.x + radialY * asteroid.velocity.y).toBeLessThan(0);
  });

  it("keeps a pursued enemy inside the circle over many fixed steps", () => {
    const config = createSpaceshipSimulationConfig({
      ambientAsteroidIntervalMinTicks: 100_000,
      ambientAsteroidIntervalMaxTicks: 100_000
    });
    const legalRadius = config.arenaRadius - config.gunshipRadius;
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 73),
      pendingSpawns: [],
      spaceship: {
        x: config.worldWidth / 2 + config.arenaRadius - config.spaceshipRadius,
        y: config.worldHeight / 2,
        previousX: config.worldWidth / 2 + config.arenaRadius - config.spaceshipRadius,
        previousY: config.worldHeight / 2,
        velocity: { x: 0, y: 0 }
      },
      enemies: [
        quietEnemy(config, {
          x: config.worldWidth / 2 + legalRadius,
          previousX: config.worldWidth / 2 + legalRadius,
          y: config.worldHeight / 2 - config.gunshipPreferredDistance,
          previousY: config.worldHeight / 2 - config.gunshipPreferredDistance
        })
      ]
    };

    for (let step = 0; step < 400; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
      const enemy = state.enemies[0];
      expect(enemy).toBeDefined();
      if (enemy === undefined) break;
      expect(
        Math.hypot(enemy.x - config.worldWidth / 2, enemy.y - config.worldHeight / 2) + enemy.radius
      ).toBeLessThanOrEqual(config.arenaRadius + 1e-9);
    }
    expect(state.enemies).toHaveLength(1);
  });
});

describe("ambient asteroid scheduler", () => {
  it("keeps the wave spawn RNG independent from the ambient domain", () => {
    const config = createSpaceshipSimulationConfig({ enemySpawnIntervalTicks: 1 });
    const initial: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 311),
      pendingSpawns: [{ kind: "gunship", planSequence: 0 }]
    };
    const withoutAmbient = advanceSpaceshipSimulation(
      { ...initial, ambientAsteroidSpawnDueTick: null },
      config
    );
    const withAmbient = advanceSpaceshipSimulation(
      { ...initial, ambientAsteroidSpawnDueTick: 0 },
      config
    );

    expect(withAmbient.enemies).toEqual(withoutAmbient.enemies);
    expect(withAmbient.spawnRngState).toBe(withoutAmbient.spawnRngState);
    expect(withAmbient.asteroids.filter(({ origin }) => origin === "ambient")).toHaveLength(1);
  });

  it.each([40, 100])("keeps exact repeated %i-tick ambient intervals", (interval) => {
    const config = createSpaceshipSimulationConfig({
      ambientAsteroidIntervalMinTicks: interval,
      ambientAsteroidIntervalMaxTicks: interval
    });
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 901),
      pendingSpawns: [],
      enemies: [quietEnemy(config)]
    };
    const spawnTicks: number[] = [];

    while (spawnTicks.length < 2) {
      const previousCount = state.asteroids.filter(({ origin }) => origin === "ambient").length;
      state = advanceSpaceshipSimulation(state, config);
      const nextCount = state.asteroids.filter(({ origin }) => origin === "ambient").length;
      if (nextCount > previousCount) spawnTicks.push(state.encounterTick);
    }

    expect(spawnTicks).toEqual([interval, interval * 2]);
  });

  it("repeatedly varies deterministic entry angles", () => {
    const config = createSpaceshipSimulationConfig({
      ambientAsteroidIntervalMinTicks: 40,
      ambientAsteroidIntervalMaxTicks: 40
    });
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 901),
      pendingSpawns: [],
      enemies: [quietEnemy(config)]
    };
    for (let step = 0; step < 80; step += 1) state = advanceSpaceshipSimulation(state, config);
    const ambient = state.asteroids.filter(({ origin }) => origin === "ambient");
    expect(ambient).toHaveLength(2);
    expect(
      Math.atan2(
        (ambient[0]?.y ?? 0) - config.worldHeight / 2,
        (ambient[0]?.x ?? 0) - config.worldWidth / 2
      )
    ).not.toBeCloseTo(
      Math.atan2(
        (ambient[1]?.y ?? 0) - config.worldHeight / 2,
        (ambient[1]?.x ?? 0) - config.worldWidth / 2
      )
    );
  });

  it("gives a same-tick wave asteroid the final slot and preserves blocked ambient RNG", () => {
    const config = createSpaceshipSimulationConfig({ enemySpawnIntervalTicks: 1 });
    const initial = createSpaceshipSimulationState(config, 401);
    const asteroids = Array.from({ length: 15 }, (_, index) => ambientAsteroid(config, index));
    const state: SpaceshipSimulationState = {
      ...initial,
      pendingSpawns: [{ kind: "asteroid", planSequence: 0 }],
      asteroids,
      ambientAsteroidSpawnDueTick: 0
    };
    const beforeRng = state.ambientAsteroidRngState;
    const first = advanceSpaceshipSimulation(state, config);

    expect(first.asteroids).toHaveLength(config.caps.asteroids);
    expect(first.asteroids.filter(({ origin }) => origin === "wave")).toHaveLength(1);
    expect(first.ambientAsteroidRngState).toBe(beforeRng);
    expect(first.ambientAsteroidSpawnDueTick).toBe(0);

    const freed: SpaceshipSimulationState = { ...first, asteroids: first.asteroids.slice(1) };
    const accepted = advanceSpaceshipSimulation(freed, config);
    expect(accepted.asteroids).toHaveLength(config.caps.asteroids);
    expect(accepted.asteroids.filter(({ origin }) => origin === "ambient")).toHaveLength(15);
    expect(accepted.ambientAsteroidRngState).not.toBe(beforeRng);
    expect(accepted.ambientAsteroidSpawnDueTick).toBeGreaterThan(accepted.encounterTick);
    expect(dynamicEntityCount(accepted)).toBeLessThanOrEqual(config.caps.dynamicEntities);
  });

  it("keeps an ambient spawn pending while the global cap is full", () => {
    const base = createSpaceshipSimulationConfig();
    const config = createSpaceshipSimulationConfig({
      caps: { ...base.caps, dynamicEntities: 1 }
    });
    const state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 99),
      pendingSpawns: [],
      enemies: [quietEnemy(config)],
      ambientAsteroidSpawnDueTick: 0
    };
    const next = advanceSpaceshipSimulation(state, config);

    expect(next.asteroids).toEqual([]);
    expect(next.ambientAsteroidRngState).toBe(state.ambientAsteroidRngState);
    expect(next.ambientAsteroidSpawnDueTick).toBe(0);
    expect(dynamicEntityCount(next)).toBe(1);
  });

  it("does not let ambient asteroids block intermission and gives defeat precedence", () => {
    const config = createSpaceshipSimulationConfig({ asteroidDamage: 500 });
    const initial = createSpaceshipSimulationState(config, 71);
    const harmless = ambientAsteroid(config, 0);
    const intermission = combatStep(
      { ...initial, pendingSpawns: [], asteroids: [harmless] },
      config
    );
    expect(intermission.encounterPhase).toBe("intermission");
    expect(intermission.asteroids).toEqual([]);
    expect(intermission.ambientAsteroidSpawnDueTick).toBeNull();

    const lethal = ambientAsteroid(config, 1, {
      previousX: initial.spaceship.x,
      previousY: initial.spaceship.y,
      x: initial.spaceship.x,
      y: initial.spaceship.y
    });
    const defeat = combatStep({ ...initial, pendingSpawns: [], asteroids: [lethal] }, config);
    expect(defeat).toMatchObject({
      encounterPhase: "result",
      outcome: "defeat",
      spaceshipHp: 0
    });
  });

  it("clears a blocked due spawn and schedules a fresh delay for the next wave", () => {
    const config = createSpaceshipSimulationConfig();
    const initial = createSpaceshipSimulationState(config, 19);
    const nextWave = advanceSpaceshipSimulation(
      {
        ...initial,
        encounterPhase: "intermission",
        encounterTick: config.intermissionTicks - 1,
        ambientAsteroidSpawnDueTick: 0,
        roleOffers: { pilot: null, gunner: null, shield: null }
      },
      config
    );

    expect(nextWave.encounterPhase).toBe("combat");
    expect(nextWave.encounterTick).toBe(0);
    expect(nextWave.ambientAsteroidSpawnDueTick).toBeGreaterThanOrEqual(40);
    expect(nextWave.ambientAsteroidSpawnDueTick).toBeLessThanOrEqual(100);
    expect(nextWave.asteroids).toEqual([]);
  });
});

describe("circular transient cleanup", () => {
  it("registers a swept friendly hit before removing an endpoint outside the arena", () => {
    const config = createSpaceshipSimulationConfig();
    const initial = createSpaceshipSimulationState(config, 33);
    const enemyX = config.worldWidth / 2 + config.arenaRadius - config.gunshipRadius;
    const enemy = quietEnemy(config, {
      x: enemyX,
      previousX: enemyX,
      y: config.worldHeight / 2,
      previousY: config.worldHeight / 2,
      hp: config.friendlyProjectileDamage,
      maxHp: config.friendlyProjectileDamage
    });
    const projectile: ProjectileState = {
      id: "projectile-rim",
      projectileId: "projectile-rim",
      spawnSequence: 1,
      previousX: enemyX - 100,
      previousY: enemy.y,
      x: config.worldWidth + config.worldPadding + 20,
      y: enemy.y,
      velocity: { x: 3000, y: 0 },
      radius: config.projectileRadius,
      damage: config.friendlyProjectileDamage,
      spawnedTick: 0
    };
    const result = combatStep(
      {
        ...initial,
        pendingSpawns: [],
        enemies: [enemy],
        projectiles: [projectile]
      },
      config
    );

    expect(result.score).toBe(25);
    expect(result.enemies).toEqual([]);
    expect(result.projectiles).toEqual([]);
  });

  it("lets an asteroid traverse the circle and removes it after radial padding", () => {
    const config = createSpaceshipSimulationConfig({
      ambientAsteroidIntervalMinTicks: 100_000,
      ambientAsteroidIntervalMaxTicks: 100_000
    });
    const centerY = config.worldHeight / 2 + 600;
    const asteroid = ambientAsteroid(config, 0, {
      previousX: 0,
      previousY: centerY,
      x: 0,
      y: centerY,
      velocity: { x: config.asteroidSpeedPerSecond, y: 0 },
      spawnedTick: 0
    });
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 120),
      pendingSpawns: [],
      enemies: [quietEnemy(config)],
      asteroids: [asteroid]
    };
    let crossedCenter = false;
    for (let step = 0; step < 500 && state.asteroids.length > 0; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
      crossedCenter ||= (state.asteroids[0]?.x ?? 0) > config.worldWidth / 2;
    }

    expect(crossedCenter).toBe(true);
    expect(state.asteroids).toEqual([]);
    expect(state.enemies).toHaveLength(1);
  });
});
