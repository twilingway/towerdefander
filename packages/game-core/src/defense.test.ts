import { describe, expect, it } from "vitest";

import {
  advanceDefense,
  applyDefenseAction,
  createDefenseState,
  prototypeDefenseConfig,
  type DefenseConfig,
  type DefenseState
} from "./index.js";

function config(overrides: Partial<DefenseConfig> = {}): DefenseConfig {
  return {
    ...prototypeDefenseConfig,
    spawns: [],
    ...overrides,
    enemy: {
      ...prototypeDefenseConfig.enemy,
      ...overrides.enemy
    }
  };
}

function damagedState(base: DefenseState, gateHealth: number, treasury: number): DefenseState {
  return {
    ...base,
    treasury,
    sectors: [{ ...base.sectors[0], gateHealth }, base.sectors[1]]
  };
}

describe("defense state creation", () => {
  it("creates the same state for the same explicit inputs", () => {
    const settings = config();

    expect(createDefenseState(settings, 42)).toEqual(createDefenseState(settings, 42));
  });

  it("rejects invalid configuration and seed", () => {
    expect(() => createDefenseState(config({ fixedStepMs: 0 }), 1)).toThrow(RangeError);
    expect(() => createDefenseState(config({ sectorCount: 3 }), 1)).toThrow(RangeError);
    expect(() => createDefenseState(config(), Number.NaN)).toThrow(RangeError);
    expect(() => createDefenseState(config({ spawns: [{ tick: 0, sectorId: 0 }] }), 1)).toThrow(
      RangeError
    );
  });
});

describe("fixed-step defense simulation", () => {
  it("stays reproducible for the same sequence of steps", () => {
    const settings = config({
      spawns: [
        { tick: 1, sectorId: 0 },
        { tick: 2, sectorId: 1 }
      ]
    });
    let first = createDefenseState(settings, 7);
    let second = createDefenseState(settings, 7);

    for (let step = 0; step < 6; step += 1) {
      first = advanceDefense(first, settings);
      second = advanceDefense(second, settings);
    }

    expect(first).toEqual(second);
  });

  it("damages a gate once and removes an enemy that reaches it", () => {
    const settings = config({
      pathLength: 1,
      baseDefenseDamage: 1,
      enemy: {
        ...prototypeDefenseConfig.enemy,
        maxHealth: 10,
        gateDamage: 25
      },
      spawns: [{ tick: 1, sectorId: 0 }]
    });

    const result = advanceDefense(createDefenseState(settings, 1), settings);

    expect(result.sectors[0].gateHealth).toBe(75);
    expect(result.enemies).toEqual([]);
    expect(result.result).toBe("victory");
  });

  it("rewards a kill and reaches terminal victory", () => {
    const settings = config({
      baseDefenseDamage: 10,
      enemy: {
        ...prototypeDefenseConfig.enemy,
        maxHealth: 10,
        reward: 7
      },
      spawns: [{ tick: 1, sectorId: 1 }]
    });

    const result = advanceDefense(createDefenseState(settings, 1), settings);

    expect(result.treasury).toBe(settings.startingTreasury + 7);
    expect(result.result).toBe("victory");
    expect(advanceDefense(result, settings)).toBe(result);
  });

  it("targets the nearest enemy and uses spawn order to break a tie", () => {
    const settings = config({ pathLength: 100, baseDefenseDamage: 3 });
    const initial: DefenseState = {
      ...createDefenseState(settings, 1),
      enemies: [
        { enemyId: "earlier", sectorId: 0, health: 10, progress: 5 },
        { enemyId: "later", sectorId: 0, health: 10, progress: 5 },
        { enemyId: "nearest", sectorId: 1, health: 10, progress: 6 },
        { enemyId: "farther", sectorId: 1, health: 10, progress: 2 }
      ]
    };

    const result = advanceDefense(initial, settings);

    expect(result.enemies.find((enemy) => enemy.enemyId === "earlier")?.health).toBe(7);
    expect(result.enemies.find((enemy) => enemy.enemyId === "later")?.health).toBe(10);
    expect(result.enemies.find((enemy) => enemy.enemyId === "nearest")?.health).toBe(7);
    expect(result.enemies.find((enemy) => enemy.enemyId === "farther")?.health).toBe(10);
  });

  it("reaches terminal defeat when a gate reaches zero", () => {
    const settings = config({
      pathLength: 1,
      gateMaxHealth: 20,
      baseDefenseDamage: 1,
      enemy: {
        ...prototypeDefenseConfig.enemy,
        maxHealth: 100,
        gateDamage: 20
      },
      spawns: [{ tick: 1, sectorId: 0 }]
    });

    const result = advanceDefense(createDefenseState(settings, 1), settings);

    expect(result.result).toBe("defeat");
    expect(result.sectors[0].gateHealth).toBe(0);
    expect(advanceDefense(result, settings)).toBe(result);
  });
});

describe("shared defense economy", () => {
  it("repairs a damaged gate without exceeding its maximum", () => {
    const settings = config({ gateMaxHealth: 100, repairAmount: 20, repairCost: 15 });
    const initial = damagedState(createDefenseState(settings, 1), 90, 20);

    const result = applyDefenseAction(initial, settings, { type: "repair", sectorId: 0 });

    expect(result.accepted).toBe(true);
    expect(result.state.treasury).toBe(5);
    expect(result.state.sectors[0].gateHealth).toBe(100);
    expect(initial.sectors[0].gateHealth).toBe(90);
  });

  it("rejects unavailable and unaffordable repairs without partial mutation", () => {
    const settings = config({ repairCost: 15 });
    const full = createDefenseState(settings, 1);
    const damaged = damagedState(full, 50, 14);

    expect(applyDefenseAction(full, settings, { type: "repair", sectorId: 0 })).toEqual({
      accepted: false,
      reason: "not_available",
      state: full
    });
    expect(applyDefenseAction(damaged, settings, { type: "repair", sectorId: 0 })).toEqual({
      accepted: false,
      reason: "insufficient_funds",
      state: damaged
    });
  });

  it("upgrades defense with increasing costs up to the maximum", () => {
    const settings = config({
      startingTreasury: 100,
      maxDefenseLevel: 2,
      upgradeBaseCost: 20
    });
    const initial = createDefenseState(settings, 1);
    const first = applyDefenseAction(initial, settings, { type: "upgrade", sectorId: 1 });

    expect(first.accepted).toBe(true);
    expect(first.state.sectors[1].defenseLevel).toBe(2);
    expect(first.state.treasury).toBe(80);
    expect(applyDefenseAction(first.state, settings, { type: "upgrade", sectorId: 1 })).toEqual({
      accepted: false,
      reason: "not_available",
      state: first.state
    });
  });

  it("rejects actions after battle completion", () => {
    const settings = config();
    const finished = { ...createDefenseState(settings, 1), result: "victory" as const };

    expect(applyDefenseAction(finished, settings, { type: "upgrade", sectorId: 0 })).toEqual({
      accepted: false,
      reason: "battle_finished",
      state: finished
    });
  });
});
