import {
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState,
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
