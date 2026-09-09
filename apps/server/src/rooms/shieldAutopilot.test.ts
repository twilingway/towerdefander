import {
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState,
  type CombatEnemyState,
  type HostileProjectileState,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState
} from "@spaceship-defender/game-core";
import { describe, expect, it } from "vitest";

import { nextShieldIntent } from "./shieldAutopilot.js";

const config: SpaceshipSimulationConfig = createSpaceshipSimulationConfig({
  enemySpawnIntervalTicks: 1000
});

function cleanState(): SpaceshipSimulationState {
  return createSpaceshipSimulationState(config, 11);
}

/** A bullet closing on the hull from the given offset at the given velocity. */
function bullet(
  state: SpaceshipSimulationState,
  offset: { x: number; y: number },
  velocity: { x: number; y: number }
): HostileProjectileState {
  const x = state.spaceship.x + offset.x;
  const y = state.spaceship.y + offset.y;
  return {
    id: "bullet-test",
    spawnSequence: 1,
    spawnedTick: 0,
    previousX: x,
    previousY: y,
    x,
    y,
    velocity,
    radius: 6,
    damage: 10,
    shieldHitCost: 10,
    lifetimeTicks: 100,
    visual: null
  };
}

/** A gunship holding station at the given offset from the hull. */
function enemy(
  state: SpaceshipSimulationState,
  offset: { x: number; y: number }
): CombatEnemyState {
  const x = state.spaceship.x + offset.x;
  const y = state.spaceship.y + offset.y;
  return {
    id: "gunship-test",
    spawnSequence: 1,
    kind: "gunship",
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
    radius: 30,
    spawnedTick: 0,
    hp: 200,
    maxHp: 200,
    weaponCooldownTicks: [10_000],
    shotsFired: 0
  };
}

describe("shield autopilot", () => {
  it("raises the sector towards a closing bullet", () => {
    const state = cleanState();
    const incoming = bullet(state, { x: 300, y: 0 }, { x: -720, y: 0 });
    const intent = nextShieldIntent({ ...state, hostileProjectiles: [incoming] }, config);

    expect(intent.active).toBe(true);
    expect(intent.vector.x).toBeGreaterThan(0.99);
    expect(Math.abs(intent.vector.y)).toBeLessThan(0.01);
    expect(intent.receivedTick).toBe(state.clock.tick);
  });

  it("keeps the sector down with no threat and with one flying away", () => {
    const state = cleanState();
    expect(nextShieldIntent(state, config).active).toBe(false);

    const leaving = bullet(state, { x: 300, y: 0 }, { x: 720, y: 0 });
    const distant = bullet(state, { x: 2000, y: 0 }, { x: -720, y: 0 });
    expect(nextShieldIntent({ ...state, hostileProjectiles: [leaving] }, config).active).toBe(
      false
    );
    expect(nextShieldIntent({ ...state, hostileProjectiles: [distant] }, config).active).toBe(
      false
    );
  });

  it("holds a raised sector through the pause between shots", () => {
    /*
     * The blink this exists for. The policy is a per-tick decision with no
     * memory, and the raise window is 0.9 s - but in a firefight the gap between
     * two shells is routinely longer than that, so the sector dropped with most
     * of the bank still full and paid a second of cooling plus half a second of
     * raising to come back. A shell one and a half seconds out is too far to
     * raise for and near enough to keep holding for.
     */
    const state = cleanState();
    const far = bullet(state, { x: 1100, y: 0 }, { x: -700, y: 0 });
    const world = { ...state, hostileProjectiles: [far] };

    expect(nextShieldIntent({ ...world, shieldPhase: "down" }, config).active).toBe(false);
    expect(nextShieldIntent({ ...world, shieldPhase: "up" }, config).active).toBe(true);
    // Mid-ramp counts as committed too: dropping there throws away the half
    // second already spent and puts the sector up later than the shot.
    expect(nextShieldIntent({ ...world, shieldPhase: "raising" }, config).active).toBe(true);
  });

  it("still drops a held sector once the arena is quiet", () => {
    // The hold is a wider window, not an open one: in a real lull the sector
    // comes down and the bank refills, which is what this policy is for.
    const state = cleanState();
    const away = bullet(state, { x: 4000, y: 0 }, { x: 700, y: 0 });
    expect(
      nextShieldIntent({ ...state, shieldPhase: "up", hostileProjectiles: [away] }, config).active
    ).toBe(false);
    expect(nextShieldIntent({ ...state, shieldPhase: "up" }, config).active).toBe(false);
  });

  it("raises for the ships when nothing of theirs will land", () => {
    /*
     * Reported twice, and the same cause both times. A shot only counted if it
     * would reach the shield ring, so a ship running from a group - or circling
     * one - had almost nothing qualify: the shells miss astern. The sector then
     * stayed down with enemies a few hull lengths away, and because an intent
     * with no target carries a zero vector, which means "leave the sector where
     * it is", it sat pointing at the tail while the fight was ahead.
     */
    const state = cleanState();
    const behind = enemy(state, { x: -366, y: -40 });
    const missing = bullet(state, { x: -200, y: -220 }, { x: 620, y: 0 });
    const fleeing = {
      ...state,
      spaceship: { ...state.spaceship, velocity: { x: 620, y: 0 } },
      enemies: [behind],
      hostileProjectiles: [missing],
      shieldPhase: "down" as const
    };
    const intent = nextShieldIntent(fleeing, config);
    expect(intent.active).toBe(true);
    // Facing the group, not held wherever it happened to be.
    expect(intent.vector.x).toBeLessThan(-0.9);
  });

  it("leaves the sector down for a ship still out of its own reach", () => {
    // The bound that keeps this from being "any enemy anywhere": an enemy that
    // cannot shoot us yet is not a reason to spend the bank. The distance is the
    // archetype's own `engagementRange`, so it is tuned in the console rather
    // than here.
    const state = cleanState();
    const far = enemy(state, { x: -2400, y: 0 });
    expect(nextShieldIntent({ ...state, enemies: [far], shieldPhase: "down" }, config).active).toBe(
      false
    );
    expect(nextShieldIntent({ ...state, enemies: [far], shieldPhase: "up" }, config).active).toBe(
      false
    );
  });

  it("keeps one rhythm whatever the operator set the bank to", () => {
    /*
     * Thresholds in seconds of drain rather than shares of the bank. A share
     * looks equivalent and is not: at a capacity of 1200 a tenth of it is six
     * seconds of shield held back untouched, and a raise gate at sixty percent
     * asks for thirty-six seconds of drain - a full minute with no sector while
     * it refills. What the bank should buy is a longer *first* hold, not a
     * different policy.
     */
    const bigBank = createSpaceshipSimulationConfig({
      enemySpawnIntervalTicks: 1000,
      shieldCapacity: 1200
    });
    const state = createSpaceshipSimulationState(bigBank, 11);
    const incoming = bullet(state, { x: 300, y: 0 }, { x: -720, y: 0 });
    const world = { ...state, hostileProjectiles: [incoming] };
    // Four seconds of drain is eighty of the twelve hundred: a sector down with
    // that much back goes up, where a fraction of the bank would still be
    // waiting for seven hundred and twenty.
    expect(
      nextShieldIntent({ ...world, shieldPhase: "down", shieldEnergy: 100 }, bigBank).active
    ).toBe(true);
    // And a sector already up spends down to a second of drain, not to a tenth
    // of the bank.
    expect(
      nextShieldIntent({ ...world, shieldPhase: "up", shieldEnergy: 40 }, bigBank).active
    ).toBe(true);
    expect(
      nextShieldIntent({ ...world, shieldPhase: "up", shieldEnergy: 10 }, bigBank).active
    ).toBe(false);
  });

  it("does not raise for a hold too short to be worth the ramp", () => {
    // Every raise spends half a second getting up, protecting nothing. Raising
    // with a second of drain in the bank is how the blink started: up for a
    // moment, cooling for a second, and around again.
    const state = cleanState();
    const incoming = bullet(state, { x: 300, y: 0 }, { x: -720, y: 0 });
    const world = { ...state, hostileProjectiles: [incoming], shieldPhase: "down" as const };
    expect(nextShieldIntent({ ...world, shieldEnergy: 25 }, config).active).toBe(false);
    expect(nextShieldIntent({ ...world, shieldEnergy: 90 }, config).active).toBe(true);
  });

  it("drops the sector while the bank is spent, which is what clears the latch", () => {
    const state = cleanState();
    const incoming = bullet(state, { x: 300, y: 0 }, { x: -720, y: 0 });
    const spent: SpaceshipSimulationState = {
      ...state,
      hostileProjectiles: [incoming],
      shieldEnergy: 0,
      shieldRearmRequired: true
    };
    expect(nextShieldIntent(spent, config).active).toBe(false);

    const refilled: SpaceshipSimulationState = {
      ...spent,
      shieldEnergy: config.shieldCapacity,
      shieldRearmRequired: false
    };
    expect(nextShieldIntent(refilled, config).active).toBe(true);
  });

  it("leaves the bearing untouched when nothing is closing", () => {
    const state = cleanState();
    expect(nextShieldIntent(state, config).vector).toEqual({ x: 0, y: 0 });
  });
});
