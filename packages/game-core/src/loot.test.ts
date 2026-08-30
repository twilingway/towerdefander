import { describe, expect, it } from "vitest";

import {
  advanceCombat,
  advanceSpaceshipSimulation,
  type CombatStepState,
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState,
  getEnemyArchetype,
  type AsteroidState,
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
    source: "cannon"
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
    expect(result.lootDrops[0]?.amount).toBe(config.lootBossRepairAmount);
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

  it("recovers what is still on the field when the wave clears", () => {
    // A boss is the last enemy alive by construction, so killing it ends the
    // wave on the same tick. Without the sweep its repair would be wiped by
    // the arena reset and could never be collected.
    const config = withArchetypeChance("boss", 0);
    const initial = createSpaceshipSimulationState(config, 80);
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

    expect(result.encounterPhase).toBe("intermission");
    expect(result.lootDrops).toEqual([]);
    expect(result.spaceshipHp).toBe(100 + config.lootBossRepairAmount);
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
