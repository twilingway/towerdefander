import { describe, expect, it } from "vitest";

import {
  advanceSpaceshipSimulation,
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState,
  getEnemyArchetype,
  type CombatEnemyState,
  type SpaceshipSimulationState
} from "./index.ts";

/**
 * The signal the display plays a muzzle flash off. Nothing in the simulation
 * reads it, so what matters is only that it moves exactly when a barrel goes
 * off - and moves once per tick, not once per barrel.
 */

const ENGAGEMENT_RANGE = 900;
const OFFSET = 500;

/** An archetype with `barrels` identical ready weapons, all in range. */
function twinConfig(barrels: number) {
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
      twin: {
        ...gunship,
        combatSkill: "ace",
        weapons: Array.from({ length: barrels }, () => ({
          ...bullet,
          cooldownTicks: 400,
          engagementRange: ENGAGEMENT_RANGE,
          burstCount: 1
        }))
      }
    }
  });
}

/** Perception the enemy has to refresh, so it fires at where the ship is now. */
const FRESH: CombatEnemyState["perception"] = { tick: -1, x: 0, y: 0, velocityX: 0, velocityY: 0 };

function twinAt(state: SpaceshipSimulationState, barrels: number): CombatEnemyState {
  const x = state.spaceship.x + OFFSET;
  const y = state.spaceship.y;
  return {
    id: "twin-1",
    spawnSequence: 1,
    kind: "twin",
    previousX: x,
    previousY: y,
    x,
    y,
    velocity: { x: 0, y: 0 },
    heading: Math.PI,
    angularVelocity: 0,
    orbitSign: 1,
    perception: FRESH,
    aimRngState: 1,
    radius: 30,
    spawnedTick: 0,
    hp: 100,
    maxHp: 100,
    weaponCooldownTicks: Array.from({ length: barrels }, () => 0),
    shotsFired: 0
  };
}

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

describe("enemy shot counter", () => {
  it("moves once when the only barrel fires", () => {
    const config = twinConfig(1);
    const initial = createSpaceshipSimulationState(config, 11);
    const fired = advanceSpaceshipSimulation(withEnemy(initial, twinAt(initial, 1)), config);
    expect(fired.hostileProjectiles.length).toBeGreaterThan(0);
    expect(fired.enemies[0]?.shotsFired).toBe(1);
  });

  it("moves once when two barrels fire in the same tick", () => {
    // The invariant worth a test: counting per barrel would make this 2, and the
    // display would then ask for two flashes that land on top of each other.
    const config = twinConfig(2);
    const initial = createSpaceshipSimulationState(config, 11);
    const fired = advanceSpaceshipSimulation(withEnemy(initial, twinAt(initial, 2)), config);
    expect(fired.hostileProjectiles.length).toBeGreaterThan(1);
    expect(fired.enemies[0]?.shotsFired).toBe(1);
  });

  it("holds still while every barrel is on cooldown", () => {
    const config = twinConfig(2);
    const initial = createSpaceshipSimulationState(config, 11);
    const fired = advanceSpaceshipSimulation(withEnemy(initial, twinAt(initial, 2)), config);
    const waiting = advanceSpaceshipSimulation(fired, config);
    expect(waiting.enemies[0]?.shotsFired).toBe(fired.enemies[0]?.shotsFired);
  });

  it("holds still while the ship is out of every barrel's range", () => {
    const config = twinConfig(1);
    const initial = createSpaceshipSimulationState(config, 11);
    const far = { ...twinAt(initial, 1), x: initial.spaceship.x + ENGAGEMENT_RANGE * 3 };
    const stepped = advanceSpaceshipSimulation(withEnemy(initial, far), config);
    expect(stepped.enemies[0]?.shotsFired).toBe(0);
  });
});
