import { describe, expect, it } from "vitest";

import {
  advanceSpaceshipSimulation,
  applyShieldInput,
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState,
  getEnemyArchetype,
  type CombatEnemyState,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState
} from "./index.ts";

const BEAM_RANGE = 900;
const BEAM_DAMAGE = 24;
const BEAM_SHIELD_COST = 12;

/**
 * A single-barrel beam archetype at ace skill: no jitter and a full lead
 * factor, so anything the beam does with the lead is the beam's own doing and
 * not the skill profile's.
 */
function beamConfig(overrides: Partial<SpaceshipSimulationConfig> = {}) {
  const base = createSpaceshipSimulationConfig();
  const gunship = getEnemyArchetype(base, "gunship");
  const bullet = gunship.weapons[0];
  if (bullet === undefined) throw new Error("gunship has no weapon");
  return createSpaceshipSimulationConfig({
    enemySpawnIntervalTicks: 100_000,
    ambientAsteroidIntervalMinTicks: 100_000,
    ambientAsteroidIntervalMaxTicks: 100_000,
    enemyArchetypes: {
      ...base.enemyArchetypes,
      burner: {
        ...gunship,
        combatSkill: "ace",
        weapons: [
          {
            ...bullet,
            kind: "laser",
            cooldownTicks: 400,
            damage: BEAM_DAMAGE,
            shieldHitCost: BEAM_SHIELD_COST,
            engagementRange: BEAM_RANGE,
            burstCount: 1
          }
        ]
      }
    },
    ...overrides
  });
}

function burnerAt(
  state: SpaceshipSimulationState,
  offsetX: number,
  perception: CombatEnemyState["perception"]
): CombatEnemyState {
  const x = state.spaceship.x + offsetX;
  const y = state.spaceship.y;
  return {
    id: "burner-1",
    spawnSequence: 1,
    kind: "burner",
    previousX: x,
    previousY: y,
    x,
    y,
    velocity: { x: 0, y: 0 },
    heading: Math.PI,
    angularVelocity: 0,
    orbitSign: 1,
    perception,
    aimRngState: 1,
    radius: 30,
    spawnedTick: 0,
    hp: 100,
    maxHp: 100,
    weaponCooldownTicks: [0]
  };
}

/** Perception the enemy has to refresh, so it fires at where the ship is now. */
const FRESH: CombatEnemyState["perception"] = { tick: -1, x: 0, y: 0, velocityX: 0, velocityY: 0 };

function withEnemy(
  state: SpaceshipSimulationState,
  enemy: CombatEnemyState
): SpaceshipSimulationState {
  return {
    ...state,
    pendingSpawns: [],
    spaceship: {
      ...state.spaceship,
      previousX: state.spaceship.previousX ?? state.spaceship.x,
      previousY: state.spaceship.previousY ?? state.spaceship.y
    },
    enemies: [enemy]
  };
}

describe("enemy beam", () => {
  it("resolves in the tick it fires and never again", () => {
    const config = beamConfig();
    const initial = createSpaceshipSimulationState(config, 11);
    const opened = advanceSpaceshipSimulation(
      withEnemy(initial, burnerAt(initial, 500, FRESH)),
      config
    );

    expect(opened.spaceshipHp).toBe(config.spaceshipMaxHp - BEAM_DAMAGE);
    // A beam is not a shot in flight: nothing was added to either projectile list.
    expect(opened.hostileProjectiles).toHaveLength(0);
    expect(opened.homingMissiles).toHaveLength(0);
    expect(opened.hostileBeams).toHaveLength(1);

    // The cooldown is four hundred ticks, so the next steps carry the same beam
    // for the display and take nothing more off the hull.
    const later = advanceSpaceshipSimulation(opened, config);
    expect(later.spaceshipHp).toBe(opened.spaceshipHp);
  });

  it("misses the ship that left the position the enemy still believes in", () => {
    const config = beamConfig();
    const initial = createSpaceshipSimulationState(config, 12);
    // A rookie refreshes every ten ticks, so this belief survives the step.
    const stale = {
      tick: 1,
      x: initial.spaceship.x,
      y: initial.spaceship.y - 700,
      velocityX: 0,
      velocityY: 0
    };
    const rookieConfig = createSpaceshipSimulationConfig({
      ...config,
      enemyArchetypes: {
        ...config.enemyArchetypes,
        burner: { ...getEnemyArchetype(config, "burner"), combatSkill: "rookie" }
      }
    });
    const stepped = advanceSpaceshipSimulation(
      withEnemy(initial, burnerAt(initial, 500, stale)),
      rookieConfig
    );

    expect(stepped.spaceshipHp).toBe(rookieConfig.spaceshipMaxHp);
    // A beam went out and missed - not a shot that turned into something else.
    expect(stepped.hostileBeams).toHaveLength(1);
    expect(stepped.homingMissiles).toHaveLength(0);
    expect(stepped.hostileProjectiles).toHaveLength(0);
    // The shot still counted: the barrel is reloading rather than holding fire.
    expect(stepped.enemies[0]?.weaponCooldownTicks[0]).toBeGreaterThan(0);
  });

  it("is caught by a shield sector and paid for out of its energy", () => {
    const config = beamConfig();
    const initial = createSpaceshipSimulationState(config, 13);
    let state = applyShieldInput(initial, {
      vector: { x: 1, y: 0 },
      active: true,
      receivedTick: 0
    });
    // The sector has to be up before the shot, not raising: the engage delay
    // would otherwise eat the only tick this beam exists in.
    state = {
      ...state,
      shieldAngle: 0,
      shieldActive: true,
      shieldPhase: "up",
      shieldPhaseTicks: 100,
      shieldEnergy: config.shieldCapacity
    };
    const stepped = advanceSpaceshipSimulation(
      withEnemy(state, burnerAt(state, 500, FRESH)),
      config
    );

    expect(stepped.spaceshipHp).toBe(config.spaceshipMaxHp);
    // The sector also drains while it is held, so the block is the floor here.
    expect(stepped.shieldEnergy).toBeLessThanOrEqual(config.shieldCapacity - BEAM_SHIELD_COST);
  });

  it("collapses an underpowered shield and burns the hull anyway", () => {
    const config = beamConfig();
    const initial = createSpaceshipSimulationState(config, 14);
    let state = applyShieldInput(initial, {
      vector: { x: 1, y: 0 },
      active: true,
      receivedTick: 0
    });
    state = {
      ...state,
      shieldAngle: 0,
      shieldActive: true,
      shieldPhase: "up",
      shieldPhaseTicks: 100,
      shieldEnergy: BEAM_SHIELD_COST - 2
    };
    const stepped = advanceSpaceshipSimulation(
      withEnemy(state, burnerAt(state, 500, FRESH)),
      config
    );

    expect(stepped.shieldEnergy).toBe(0);
    expect(stepped.shieldActive).toBe(false);
    expect(stepped.spaceshipHp).toBe(config.spaceshipMaxHp - BEAM_DAMAGE);
  });

  it("fires with every entity cap full: a beam costs the arena nothing", () => {
    const base = createSpaceshipSimulationConfig().caps;
    const caps = { ...base, hostileProjectiles: 1, homingMissiles: 1 };
    const config = beamConfig({
      caps: {
        ...caps,
        dynamicEntities:
          caps.enemyShips +
          caps.asteroids +
          caps.lootDrops +
          caps.hostileProjectiles +
          caps.homingMissiles +
          caps.friendlyProjectiles
      }
    });
    const initial = createSpaceshipSimulationState(config, 15);
    // Both hostile caps are already spent, parked far enough away to hit nothing.
    const parked = {
      spawnSequence: 2,
      previousX: initial.spaceship.x,
      previousY: initial.spaceship.y - 2000,
      x: initial.spaceship.x,
      y: initial.spaceship.y - 2000,
      velocity: { x: 0, y: 0 },
      radius: 6,
      spawnedTick: 0,
      damage: 1,
      shieldHitCost: 1,
      lifetimeTicks: 1000,
      visual: null
    };
    const stepped = advanceSpaceshipSimulation(
      {
        ...withEnemy(initial, burnerAt(initial, 500, FRESH)),
        hostileProjectiles: [{ ...parked, id: "parked-bullet" }],
        homingMissiles: [
          {
            ...parked,
            id: "parked-missile",
            spawnSequence: 3,
            heading: -Math.PI / 2,
            speedPerSecond: 0,
            turnRatePerSecond: 0
          }
        ]
      },
      config
    );

    expect(stepped.spaceshipHp).toBe(config.spaceshipMaxHp - BEAM_DAMAGE);
    expect(stepped.hostileBeams).toHaveLength(1);
  });

  it("points at the ship rather than ahead of it", () => {
    const config = beamConfig();
    const initial = createSpaceshipSimulationState(config, 16);
    // A ship crossing the beam at speed: a led shot would go visibly ahead of it.
    const crossing = {
      ...initial,
      spaceship: {
        ...initial.spaceship,
        previousX: initial.spaceship.x,
        previousY: initial.spaceship.y - 19
      }
    };
    const stepped = advanceSpaceshipSimulation(
      withEnemy(crossing, burnerAt(crossing, 500, FRESH)),
      config
    );

    const beam = stepped.hostileBeams[0];
    expect(beam).toBeDefined();
    if (beam === undefined) return;
    const beamAngle = Math.atan2(beam.y - beam.previousY, beam.x - beam.previousX);
    const enemy = stepped.enemies[0];
    expect(enemy).toBeDefined();
    if (enemy === undefined) return;
    const directAngle = Math.atan2(stepped.spaceship.y - enemy.y, stepped.spaceship.x - enemy.x);
    expect(beamAngle).toBeCloseTo(directAngle, 6);
  });
});
