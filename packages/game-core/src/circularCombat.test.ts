import { describe, expect, it } from "vitest";

import {
  getEnemyArchetype,
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
} from "./index.ts";

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
    radius: getEnemyArchetype(config, "gunship").radius,
    spawnedTick: 0,
    heading: 0,
    angularVelocity: 0,
    orbitSign: 1,
    perception: { tick: -1, x: 0, y: 0, velocityX: 0, velocityY: 0 },
    aimRngState: 1,
    hp: 1_000_000,
    maxHp: 1_000_000,
    weaponCooldownTicks: [1_000_000],
    ...overrides
  };
}

const RIM_PIN_STEPS = 300;
/** Ticks the arena may eat before the enemy is expected to have freed itself. */
const RIM_PIN_MOTIONLESS_LIMIT = 1;

/** Share of the archetype speed a cornered enemy is expected to keep on average. */
const RIM_PIN_SPEED_SHARE = 0.25;
/** Share of the archetype speed below which the arena counts as having pinned it. */
const RIM_PIN_STALL_SHARE = 0.05;

interface RimPinRun {
  readonly pathLength: number;
  readonly angleTravelled: number;
  readonly longestMotionlessRun: number;
  readonly slowestSpeed: number;
}

/**
 * Parks an enemy against the arena wall with the spaceship inside its preferred
 * range and reports how much ground the enemy actually covered. Returns null
 * when the requested spaceship placement would sit outside the legal circle.
 */
function runRimPinnedEnemy(
  config: SpaceshipSimulationConfig,
  kind: string,
  spawnSequence: number,
  shipBearing: number,
  shipSeparation: number
): RimPinRun | null {
  const archetype = getEnemyArchetype(config, kind);
  const centerX = config.worldWidth / 2;
  const centerY = config.worldHeight / 2;
  const enemyX = centerX + config.arenaRadius - archetype.radius;
  const enemyY = centerY;
  const shipX = enemyX + Math.cos(shipBearing) * shipSeparation;
  const shipY = enemyY + Math.sin(shipBearing) * shipSeparation;
  if (Math.hypot(shipX - centerX, shipY - centerY) > config.arenaRadius - config.spaceshipRadius) {
    return null;
  }

  let state: SpaceshipSimulationState = {
    ...createSpaceshipSimulationState(config, 73),
    pendingSpawns: [],
    spaceship: { x: shipX, y: shipY, previousX: shipX, previousY: shipY, velocity: { x: 0, y: 0 } },
    enemies: [
      quietEnemy(config, {
        kind,
        spawnSequence,
        orbitSign: spawnSequence % 2 === 0 ? 1 : -1,
        perception: { tick: -1, x: 0, y: 0, velocityX: 0, velocityY: 0 },
        aimRngState: 1,
        radius: archetype.radius,
        x: enemyX,
        previousX: enemyX,
        y: enemyY,
        previousY: enemyY
      })
    ]
  };

  let pathLength = 0;
  let angleTravelled = 0;
  let motionlessRun = 0;
  let longestMotionlessRun = 0;
  let slowestSpeed = Number.POSITIVE_INFINITY;
  let previousX = enemyX;
  let previousY = enemyY;
  let previousAngle = Math.atan2(enemyY - centerY, enemyX - centerX);

  for (let step = 0; step < RIM_PIN_STEPS; step += 1) {
    state = advanceSpaceshipSimulation(state, config);
    const enemy = state.enemies[0];
    expect(enemy).toBeDefined();
    if (enemy === undefined) break;
    expect(Math.hypot(enemy.x - centerX, enemy.y - centerY) + enemy.radius).toBeLessThanOrEqual(
      config.arenaRadius + 1e-9
    );

    const moved = Math.hypot(enemy.x - previousX, enemy.y - previousY);
    pathLength += moved;
    motionlessRun = moved < 1e-9 ? motionlessRun + 1 : 0;
    longestMotionlessRun = Math.max(longestMotionlessRun, motionlessRun);
    slowestSpeed = Math.min(slowestSpeed, Math.hypot(enemy.velocity.x, enemy.velocity.y));
    const angle = Math.atan2(enemy.y - centerY, enemy.x - centerX);
    angleTravelled += Math.abs(((angle - previousAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    previousAngle = angle;
    previousX = enemy.x;
    previousY = enemy.y;
  }

  return { pathLength, angleTravelled, longestMotionlessRun, slowestSpeed };
}

/** Ground a cornered enemy has to cover over the whole run to count as mobile. */
function rimPinDistanceFloor(config: SpaceshipSimulationConfig, kind: string): number {
  const seconds = (RIM_PIN_STEPS * config.fixedStepMs) / 1000;
  return getEnemyArchetype(config, kind).speedPerSecond * seconds * RIM_PIN_SPEED_SHARE;
}

function quietArenaConfig(): SpaceshipSimulationConfig {
  return createSpaceshipSimulationConfig({
    ambientAsteroidIntervalMinTicks: 100_000,
    ambientAsteroidIntervalMaxTicks: 100_000
  });
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
        pendingSpawns: [
          {
            kind: "gunship" as const,
            planSequence: 0,
            spawnIntervalTicks: 12,
            sectors: [],
            hpMultiplier: null,
            tempoMultiplier: null
          }
        ]
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
        pendingSpawns: [
          {
            kind: "asteroid",
            planSequence: 0,
            spawnIntervalTicks: 12,
            sectors: [],
            hpMultiplier: null,
            tempoMultiplier: null
          }
        ]
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
    const legalRadius = config.arenaRadius - getEnemyArchetype(config, "gunship").radius;
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
          y: config.worldHeight / 2 - getEnemyArchetype(config, "gunship").preferredDistance,
          previousY: config.worldHeight / 2 - getEnemyArchetype(config, "gunship").preferredDistance
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

  it("keeps a wall-pinned enemy sliding along the rim instead of freezing", () => {
    const config = quietArenaConfig();
    const archetype = getEnemyArchetype(config, "gunship");
    // The ship parks well inside the preferred range, so the enemy backs off
    // straight into the wall — the geometry that used to stop it dead.
    const run = runRimPinnedEnemy(
      config,
      "gunship",
      100,
      Math.PI,
      archetype.preferredDistance - 200
    );

    expect(run).not.toBeNull();
    if (run === null) return;
    expect(run.longestMotionlessRun).toBeLessThanOrEqual(RIM_PIN_MOTIONLESS_LIMIT);
    expect(run.slowestSpeed).toBeGreaterThan(archetype.speedPerSecond * RIM_PIN_STALL_SHARE);
    expect(run.pathLength).toBeGreaterThan(rimPinDistanceFloor(config, "gunship"));
    expect(run.angleTravelled).toBeGreaterThan(Math.PI / 8);
  });

  it("frees a pinned enemy from every ship placement the arena allows", () => {
    const config = quietArenaConfig();
    let covered = 0;

    for (const kind of ["gunship", "boss"]) {
      const archetype = getEnemyArchetype(config, kind);
      for (const spawnSequence of [100, 101]) {
        for (const bearingQuarters of [2, 3, 4, 5, 6]) {
          for (const separationShare of [0.3, 0.6, 0.9]) {
            const run = runRimPinnedEnemy(
              config,
              kind,
              spawnSequence,
              (Math.PI * bearingQuarters) / 4,
              archetype.preferredDistance * separationShare
            );
            if (run === null) continue;
            covered += 1;
            expect(run.longestMotionlessRun).toBeLessThanOrEqual(RIM_PIN_MOTIONLESS_LIMIT);
            expect(run.slowestSpeed).toBeGreaterThan(
              archetype.speedPerSecond * RIM_PIN_STALL_SHARE
            );
            expect(run.pathLength).toBeGreaterThan(rimPinDistanceFloor(config, kind));
          }
        }
      }
    }

    expect(covered).toBeGreaterThan(20);
  });

  it("leaves the course unchanged away from the rim", () => {
    const config = quietArenaConfig();
    const centerX = config.worldWidth / 2;
    const centerY = config.worldHeight / 2;
    const enemyX = centerX + 900;
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 73),
      pendingSpawns: [],
      spaceship: {
        x: centerX,
        y: centerY,
        previousX: centerX,
        previousY: centerY,
        velocity: { x: 0, y: 0 }
      },
      enemies: [quietEnemy(config, { x: enemyX, previousX: enemyX })]
    };

    for (let step = 0; step < 60; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
      const enemy = state.enemies[0];
      expect(enemy).toBeDefined();
      if (enemy === undefined) break;
      // Well inside the band where the wall has no say over the blend.
      expect(Math.hypot(enemy.x - centerX, enemy.y - centerY)).toBeLessThan(
        (config.arenaRadius - enemy.radius) * 0.8
      );
    }

    // Golden values recorded from the blend before the rim rule was added.
    expect(state.enemies[0]?.x).toBeCloseTo(2853.9148503025867, 6);
    expect(state.enemies[0]?.y).toBeCloseTo(2129.5418583681662, 6);
  });
});

describe("ambient asteroid scheduler", () => {
  it("keeps the wave spawn RNG independent from the ambient domain", () => {
    const config = createSpaceshipSimulationConfig({ enemySpawnIntervalTicks: 1 });
    const initial: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 311),
      pendingSpawns: [
        {
          kind: "gunship",
          planSequence: 0,
          spawnIntervalTicks: 12,
          sectors: [],
          hpMultiplier: null,
          tempoMultiplier: null
        }
      ]
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
      pendingSpawns: [
        {
          kind: "asteroid",
          planSequence: 0,
          spawnIntervalTicks: 12,
          sectors: [],
          hpMultiplier: null,
          tempoMultiplier: null
        }
      ],
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
        teamUpgradeOffer: null
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
    const enemyX =
      config.worldWidth / 2 + config.arenaRadius - getEnemyArchetype(config, "gunship").radius;
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
      source: "cannon",
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
    expect(result.credits).toBe(2);
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
