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

describe("the counter over a whole fight", () => {
  it("keeps climbing across cooldowns, not just the first shot", () => {
    /*
     * The one this exists for. A counter that reaches one and sticks there
     * would give a display exactly one muzzle flash per enemy per run, and
     * nothing would look broken - the flash lasts a quarter of a second, so a
     * pair of eyes on a live arena cannot tell "fired once" from "never fired
     * again". Only the second increment proves the signal is a signal.
     */
    const config = twinConfig(1);
    let state: SpaceshipSimulationState = withEnemy(
      createSpaceshipSimulationState(config, 11),
      twinAt(createSpaceshipSimulationState(config, 11), 1)
    );
    const seen: number[] = [];
    // 400 cooldown ticks per shot, so a thousand steps hold two of them.
    for (let tick = 0; tick < 1000; tick += 1) {
      state = advanceSpaceshipSimulation(state, config);
      const count = state.enemies[0]?.shotsFired;
      if (count !== undefined && seen.at(-1) !== count) seen.push(count);
    }
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)).toBeGreaterThan(1);
    // One at a time, never a jump: the increment is per tick, not per barrel.
    expect(seen).toEqual(seen.map((_, index) => index + 1));
  });
});
