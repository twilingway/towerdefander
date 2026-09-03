import { describe, expect, it } from "vitest";

import {
  advanceCombat,
  advanceSpaceshipSimulation,
  type CombatStepState,
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState,
  getEnemyArchetype,
  type AsteroidState,
  type HomingMissileState,
  type HostileProjectileState,
  type CombatEnemyState,
  type LootDropState,
  type ProjectileState,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState
} from "./index.ts";

/** Nothing spawns on its own, so every drop in a test has exactly one cause. */
function quietConfig(overrides: Partial<SpaceshipSimulationConfig> = {}) {
  return createSpaceshipSimulationConfig({
    enemySpawnIntervalTicks: 1000,
    ambientAsteroidIntervalMinTicks: 100_000,
    ambientAsteroidIntervalMaxTicks: 100_000,
    ...overrides
  });
}

function settled(state: SpaceshipSimulationState, config: SpaceshipSimulationConfig) {
  return {
    ...state,
    pendingSpawns: [],
    spaceship: {
      ...state.spaceship,
      previousX: state.spaceship.previousX ?? state.spaceship.x,
      previousY: state.spaceship.previousY ?? state.spaceship.y,
      radius: config.spaceshipRadius
    }
  };
}

function projectileAt(x: number, y: number, config: SpaceshipSimulationConfig): ProjectileState {
  return {
    id: "kill-shot",
    projectileId: "kill-shot",
    spawnSequence: 1,
    previousX: x,
    previousY: y,
    x,
    y,
    velocity: { x: 0, y: 0 },
    radius: config.projectileRadius,
    spawnedTick: 0,
    damage: 10_000,
    source: "cannon",
    homing: null
  };
}

function enemyAt(
  x: number,
  y: number,
  kind: string,
  config: SpaceshipSimulationConfig,
  id = "victim",
  hp = 1
) {
  const archetype = getEnemyArchetype(config, kind);
  const enemy: CombatEnemyState = {
    id,
    spawnSequence: 2,
    kind,
    previousX: x,
    previousY: y,
    x,
    y,
    velocity: { x: 0, y: 0 },
    heading: 0,
    angularVelocity: 0,
    orbitSign: 1,
    perception: { tick: -1, x: 0, y: 0, velocityX: 0, velocityY: 0 },
    aimRngState: 1,
    radius: archetype.radius,
    spawnedTick: 0,
    hp,
    maxHp: archetype.hp,
    weaponCooldownTicks: archetype.weapons.map(() => 1000)
  };
  return enemy;
}

/**
 * Kills one enemy of `kind` far from the ship and returns the step's result.
 * A healthy bystander keeps the wave alive: clearing it would sweep the field
 * and hide whether the drop happened at all.
 */
function killOne(kind: string, config: SpaceshipSimulationConfig, seed = 71) {
  const initial = createSpaceshipSimulationState(config, seed);
  const x = initial.spaceship.x + 900;
  const y = initial.spaceship.y;
  return advanceCombat(
    {
      ...settled(initial, config),
      enemies: [
        enemyAt(x, y, kind, config),
        enemyAt(x, y + 700, "gunship", config, "bystander", 500)
      ],
      projectiles: [projectileAt(x, y, config)]
    },
    config
  );
}

/** The same bystander, for tests that only care about a drop already on the field. */
function bystander(state: SpaceshipSimulationState, config: SpaceshipSimulationConfig) {
  return enemyAt(state.spaceship.x + 1400, state.spaceship.y, "gunship", config, "bystander", 500);
}

function withArchetypeChance(kind: string, chance: number) {
  const base = createSpaceshipSimulationConfig();
  const archetype = base.enemyArchetypes[kind];
  if (archetype === undefined) throw new Error(`no archetype ${kind}`);
  return quietConfig({
    enemyArchetypes: { ...base.enemyArchetypes, [kind]: { ...archetype, lootChance: chance } }
  });
}

describe("salvage drops", () => {
  it("drops nothing when the archetype never leaves salvage", () => {
    const result = killOne("gunship", withArchetypeChance("gunship", 0));
    expect(result.enemies.map(({ id }) => id)).toEqual(["bystander"]);
    expect(result.lootDrops).toEqual([]);
  });

  it("drops exactly one piece when the archetype always leaves salvage", () => {
    const result = killOne("gunship", withArchetypeChance("gunship", 1));
    expect(result.lootDrops).toHaveLength(1);
    expect(["repair", "shieldCell"]).toContain(result.lootDrops[0]?.kind);
  });

  it("leaves a boss repair whatever the archetype chance says", () => {
    const config = withArchetypeChance("boss", 0);
    const result = killOne("boss", config);
    expect(result.lootDrops).toHaveLength(1);
    expect(result.lootDrops[0]?.kind).toBe("repair");
    expect(result.lootDrops[0]?.amount).toBe(config.lootBossRepairShare * config.spaceshipMaxHp);
  });

  it("never drops salvage from an asteroid", () => {
    const config = quietConfig();
    const initial = createSpaceshipSimulationState(config, 73);
    const x = initial.spaceship.x + 900;
    const y = initial.spaceship.y;
    const asteroid: AsteroidState = {
      id: "rock",
      spawnSequence: 3,
      origin: "wave",
      previousX: x,
      previousY: y,
      x,
      y,
      velocity: { x: 0, y: 0 },
      radius: config.asteroidRadius,
      spawnedTick: 0,
      hp: 1,
      maxHp: config.asteroidHp,
      damage: config.asteroidDamage
    };

    const result = advanceCombat(
      {
        ...settled(initial, config),
        enemies: [bystander(initial, config)],
        asteroids: [asteroid],
        projectiles: [projectileAt(x, y, config)]
      },
      config
    );

    expect(result.asteroids).toEqual([]);
    expect(result.lootDrops).toEqual([]);
  });

  it("drops in the same tick and place for the same seed", () => {
    const config = withArchetypeChance("gunship", 0.5);
    const left = killOne("gunship", config, 4242);
    const right = killOne("gunship", config, 4242);
    expect(left.lootDrops).toEqual(right.lootDrops);
  });
});

function dropNear(
  state: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig,
  kind: LootDropState["kind"],
  amount: number,
  distance: number
): LootDropState {
  const x = state.spaceship.x + distance;
  const y = state.spaceship.y;
  return {
    id: "salvage-1",
    spawnSequence: 9,
    previousX: x,
    previousY: y,
    x,
    y,
    velocity: { x: 0, y: 0 },
    radius: config.lootDropRadius,
    spawnedTick: 0,
    kind,
    amount,
    lifetimeTicks: config.lootLifetimeTicks
  };
}

describe("salvage pickup", () => {
  it("pulls salvage in once the ship is inside the magnet radius", () => {
    const config = quietConfig();
    const initial = createSpaceshipSimulationState(config, 75);
    const drop = dropNear(initial, config, "repair", 40, config.lootMagnetRadius - 20);

    let state: CombatStepState = {
      ...settled(initial, config),
      spaceshipHp: 100,
      enemies: [bystander(initial, config)],
      lootDrops: [drop]
    };
    const first = advanceCombat(state, config);
    // It has started moving toward the hull rather than sitting still.
    expect(first.lootDrops[0]?.x).toBeLessThan(drop.x);

    let hp = first.spaceshipHp;
    state = { ...state, ...first };
    for (let tick = 0; tick < 60 && state.lootDrops.length > 0; tick += 1) {
      const stepped = advanceCombat(state, config);
      state = { ...state, ...stepped };
      hp = stepped.spaceshipHp;
    }
    expect(state.lootDrops).toEqual([]);
    expect(hp).toBe(140);
  });

  it("leaves salvage drifting while the ship stays outside the magnet radius", () => {
    const config = quietConfig();
    const initial = createSpaceshipSimulationState(config, 76);
    const drop = dropNear(initial, config, "repair", 40, config.lootMagnetRadius + 200);

    const result = advanceCombat(
      {
        ...settled(initial, config),
        spaceshipHp: 100,
        enemies: [bystander(initial, config)],
        lootDrops: [drop]
      },
      config
    );

    expect(result.lootDrops).toHaveLength(1);
    expect(result.spaceshipHp).toBe(100);
  });

  it("spends a repair on a full hull instead of overflowing it", () => {
    const config = quietConfig();
    const initial = createSpaceshipSimulationState(config, 77);
    const drop = dropNear(initial, config, "repair", 40, config.spaceshipRadius);

    const result = advanceCombat(
      { ...settled(initial, config), enemies: [bystander(initial, config)], lootDrops: [drop] },
      config
    );

    expect(result.lootDrops).toEqual([]);
    expect(result.spaceshipHp).toBe(config.spaceshipMaxHp);
  });

  it("returns shield energy without touching the shield own state", () => {
    const config = quietConfig();
    const initial = createSpaceshipSimulationState(config, 78);
    const drop = dropNear(initial, config, "shieldCell", 25, config.spaceshipRadius);

    const result = advanceCombat(
      {
        ...settled(initial, config),
        shieldEnergy: 10,
        shieldActive: false,
        enemies: [bystander(initial, config)],
        lootDrops: [drop]
      },
      config
    );

    expect(result.lootDrops).toEqual([]);
    expect(result.shieldEnergy).toBe(35);
    expect(result.shieldActive).toBe(false);
  });

  it("lets salvage expire when nobody comes for it", () => {
    const config = quietConfig({ lootLifetimeTicks: 3 });
    const initial = createSpaceshipSimulationState(config, 79);
    const drop = dropNear(initial, config, "repair", 40, config.lootMagnetRadius + 400);

    let state: SpaceshipSimulationState = {
      ...settled(initial, config),
      spaceshipHp: 100,
      enemies: [bystander(initial, config)],
      lootDrops: [drop]
    };
    // The full step, because only it advances the clock the lifetime is read
    // against; `advanceCombat` alone would leave the tick at zero forever.
    for (let tick = 0; tick < 5; tick += 1) {
      state = advanceSpaceshipSimulation(state, config);
    }

    expect(state.lootDrops).toEqual([]);
    expect(state.spaceshipHp).toBe(100);
  });
});

describe("salvage window", () => {
  /** A field with nothing left on it but one drop, which is what opens the window. */
  function clearedField(
    config: SpaceshipSimulationConfig,
    seed: number,
    drop: LootDropState
  ): CombatStepState {
    return {
      ...settled(createSpaceshipSimulationState(config, seed), config),
      spaceshipHp: 100,
      enemies: [],
      lootDrops: [drop]
    };
  }

  it("holds a won wave open instead of ending it on the last kill", () => {
    const config = withArchetypeChance("gunship", 1);
    const initial = createSpaceshipSimulationState(config, 81);
    const x = initial.spaceship.x + 900;
    const y = initial.spaceship.y;

    const result = advanceCombat(
      {
        ...settled(initial, config),
        spaceshipHp: 100,
        enemies: [enemyAt(x, y, "gunship", config)],
        projectiles: [projectileAt(x, y, config)]
      },
      config
    );

    expect(result.encounterPhase).toBe("combat");
    expect(result.lootDrops).toHaveLength(1);
    expect(result.lootWindowTicksRemaining).toBe(config.lootWindowTicks);
    // Nothing is handed over: the wave stays open so the crew can fly to it.
    expect(result.spaceshipHp).toBe(100);
  });

  it("takes the dead wave's shots with it when the window opens", () => {
    // Measured: without this the crew spends the whole window eating the last
    // volley, and homing missiles keep chasing until they connect.
    const config = withArchetypeChance("gunship", 1);
    const initial = createSpaceshipSimulationState(config, 87);
    const x = initial.spaceship.x + 900;
    const y = initial.spaceship.y;
    const bullet: HostileProjectileState = {
      id: "incoming",
      spawnSequence: 5,
      previousX: x,
      previousY: y - 200,
      x,
      y: y - 200,
      velocity: { x: 0, y: 60 },
      radius: 6,
      spawnedTick: 0,
      damage: 10,
      shieldHitCost: 10,
      lifetimeTicks: 400,
      visual: null
    };
    const missile: HomingMissileState = {
      id: "chaser",
      spawnSequence: 6,
      previousX: x,
      previousY: y + 200,
      x,
      y: y + 200,
      velocity: { x: 0, y: -60 },
      radius: 8,
      spawnedTick: 0,
      heading: Math.PI,
      damage: 20,
      shieldHitCost: 20,
      lifetimeTicks: 400,
      speedPerSecond: 60,
      turnRatePerSecond: 1,
      visual: null
    };

    const result = advanceCombat(
      {
        ...settled(initial, config),
        spaceshipHp: 100,
        enemies: [enemyAt(x, y, "gunship", config)],
        projectiles: [projectileAt(x, y, config)],
        hostileProjectiles: [bullet],
        homingMissiles: [missile]
      },
      config
    );

    expect(result.lootWindowTicksRemaining).toBe(config.lootWindowTicks);
    expect(result.hostileProjectiles).toEqual([]);
    expect(result.homingMissiles).toEqual([]);
  });

  it("gives a boss wave the longer window and restarts the drop clock", () => {
    const config = withArchetypeChance("boss", 0);
    const initial = createSpaceshipSimulationState(config, 82);
    const x = initial.spaceship.x + 900;
    const y = initial.spaceship.y;

    const result = advanceCombat(
      {
        ...settled(initial, config),
        spaceshipHp: 100,
        enemies: [enemyAt(x, y, "boss", config)],
        projectiles: [projectileAt(x, y, config)]
      },
      config
    );

    expect(result.encounterPhase).toBe("combat");
    expect(result.lootWindowTicksRemaining).toBe(config.lootBossWindowTicks);
    expect(result.lootDrops[0]?.lifetimeTicks).toBe(config.lootBossWindowTicks);
  });

  it("ends the wave the moment the last drop is collected", () => {
    const config = quietConfig();
    const initial = createSpaceshipSimulationState(config, 83);
    const drop = dropNear(initial, config, "repair", 40, config.lootMagnetRadius - 20);

    let state = clearedField(config, 83, drop);
    const first = advanceCombat(state, config);
    expect(first.encounterPhase).toBe("combat");
    expect(first.lootWindowTicksRemaining).toBe(config.lootWindowTicks);

    state = { ...state, ...first };
    for (let tick = 0; tick < 120 && state.encounterPhase === "combat"; tick += 1) {
      state = { ...state, ...advanceCombat(state, config) };
    }

    expect(state.encounterPhase).toBe("intermission");
    expect(state.lootWindowTicksRemaining).toBe(0);
    expect(state.spaceshipHp).toBe(140);
  });

  it("ends the wave when the window runs out, and hands over nothing", () => {
    const config = quietConfig({ lootWindowTicks: 3 });
    const initial = createSpaceshipSimulationState(config, 84);
    // Far outside the magnet: the crew never reaches this one.
    const drop = dropNear(initial, config, "repair", 40, config.lootMagnetRadius + 400);

    let state = clearedField(config, 84, drop);
    for (let tick = 0; tick < 3; tick += 1) {
      state = { ...state, ...advanceCombat(state, config) };
      expect(state.encounterPhase).toBe("combat");
    }
    state = { ...state, ...advanceCombat(state, config) };

    expect(state.encounterPhase).toBe("intermission");
    expect(state.lootDrops).toEqual([]);
    expect(state.spaceshipHp).toBe(100);
  });

  it("restarts an old drop's clock so nothing rots inside the window", () => {
    const config = quietConfig({ lootWindowTicks: 20 });
    const initial = createSpaceshipSimulationState(config, 85);
    // Alive, but one tick from rotting when the field clears.
    const stale: LootDropState = {
      ...dropNear(initial, config, "repair", 40, config.lootMagnetRadius + 400),
      spawnedTick: -50,
      lifetimeTicks: 51
    };

    const result = advanceCombat(clearedField(config, 85, stale), config);

    expect(result.lootDrops[0]).toMatchObject({ spawnedTick: 0, lifetimeTicks: 20 });
  });

  it("ends a wave that clears with nothing on the field, as it always did", () => {
    const config = withArchetypeChance("gunship", 0);
    const initial = createSpaceshipSimulationState(config, 86);
    const x = initial.spaceship.x + 900;
    const y = initial.spaceship.y;

    const result = advanceCombat(
      {
        ...settled(initial, config),
        enemies: [enemyAt(x, y, "gunship", config)],
        projectiles: [projectileAt(x, y, config)]
      },
      config
    );

    expect(result.encounterPhase).toBe("intermission");
    expect(result.lootWindowTicksRemaining).toBe(0);
  });
});
