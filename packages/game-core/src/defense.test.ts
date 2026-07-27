import { describe, expect, it } from "vitest";

import {
  advanceDefense,
  applyDefenseAction,
  createDefenseState,
  prototypeDefenseConfig,
  type DefenseConfig,
  type DefenseState,
  type WaveConfig
} from "./index.js";

function wave(spawns: WaveConfig["spawns"] = []): WaveConfig {
  return { spawns };
}

function config(overrides: Partial<DefenseConfig> = {}): DefenseConfig {
  return {
    ...prototypeDefenseConfig,
    fixedStepMs: 1000,
    intermissionDurationMs: 1000,
    waves: [wave(), wave(), wave(), wave(), wave([{ step: 1, sectorId: 0, enemyType: "boss" }])],
    ...overrides,
    enemyArchetypes: {
      ...prototypeDefenseConfig.enemyArchetypes,
      ...overrides.enemyArchetypes
    },
    airstrike: {
      ...prototypeDefenseConfig.airstrike,
      ...overrides.airstrike
    }
  };
}

function enterCombat(state: DefenseState, settings: DefenseConfig): DefenseState {
  expect(state.stage).toBe("intermission");
  const result = advanceDefense(state, settings);
  expect(result.stage).toBe("combat");
  return result;
}

function damagedState(base: DefenseState, gateHealth: number, treasury: number): DefenseState {
  return {
    ...base,
    treasury,
    sectors: [{ ...base.sectors[0], gateHealth }, base.sectors[1]]
  };
}

describe("defense state creation", () => {
  it("creates deterministic first-wave intermission state", () => {
    const settings = config();
    const state = createDefenseState(settings, 42);

    expect(state).toEqual(createDefenseState(settings, 42));
    expect(state).toMatchObject({
      waveNumber: 1,
      stage: "intermission",
      intermissionRemainingSteps: 1,
      waveStep: 0,
      airstrikeCharge: 0
    });
  });

  it("rejects invalid wave, intermission, spawn, and boss configuration", () => {
    expect(() => createDefenseState(config({ fixedStepMs: 0 }), 1)).toThrow(RangeError);
    expect(() =>
      createDefenseState(config({ fixedStepMs: 600, intermissionDurationMs: 1000 }), 1)
    ).toThrow(RangeError);
    expect(() => createDefenseState(config({ waves: [wave()] }), 1)).toThrow(RangeError);
    expect(() =>
      createDefenseState(
        config({
          waves: [
            wave([{ step: 1, sectorId: 0, enemyType: "boss" }]),
            wave(),
            wave(),
            wave(),
            wave([{ step: 1, sectorId: 0, enemyType: "boss" }])
          ]
        }),
        1
      )
    ).toThrow(RangeError);
    expect(() => createDefenseState(config(), Number.NaN)).toThrow(RangeError);
  });
});

describe("five-wave deterministic simulation", () => {
  it("uses a clean transition from intermission into first combat spawn", () => {
    const settings = config({
      waves: [
        wave([{ step: 1, sectorId: 0, enemyType: "balanced" }]),
        wave(),
        wave(),
        wave(),
        wave([{ step: 1, sectorId: 0, enemyType: "boss" }])
      ]
    });
    const combat = advanceDefense(createDefenseState(settings, 1), settings);

    expect(combat).toMatchObject({
      stage: "combat",
      waveNumber: 1,
      waveStep: 0,
      intermissionRemainingSteps: 0,
      enemies: []
    });

    const firstStep = advanceDefense(combat, settings);
    expect(firstStep.waveStep).toBe(1);
    expect(firstStep.enemies[0]).toMatchObject({
      enemyType: "balanced",
      maxHealth: settings.enemyArchetypes.balanced.maxHealth
    });
  });

  it("increments the wave on the clearing transition and preserves shared state", () => {
    const settings = config({
      baseDefenseDamage: 100,
      waves: [
        wave([{ step: 1, sectorId: 0, enemyType: "balanced" }]),
        wave(),
        wave(),
        wave(),
        wave([{ step: 1, sectorId: 0, enemyType: "boss" }])
      ]
    });
    const initial = { ...createDefenseState(settings, 1), treasury: 77, airstrikeCharge: 25 };
    const result = advanceDefense(enterCombat(initial, settings), settings);

    expect(result).toMatchObject({
      stage: "intermission",
      waveNumber: 2,
      waveStep: 0,
      treasury: 77 + settings.enemyArchetypes.balanced.reward,
      airstrikeCharge: 25 + settings.enemyArchetypes.balanced.airstrikeCharge
    });
  });

  it("uses enemy-specific speed and gate damage", () => {
    const settings = config({
      pathLength: 2,
      baseDefenseDamage: 1,
      waves: [
        wave([{ step: 1, sectorId: 0, enemyType: "fast" }]),
        wave(),
        wave(),
        wave(),
        wave([{ step: 1, sectorId: 0, enemyType: "boss" }])
      ]
    });
    const result = advanceDefense(enterCombat(createDefenseState(settings, 1), settings), settings);

    expect(result.enemies).toEqual([]);
    expect(result.sectors[0].gateHealth).toBe(
      settings.gateMaxHealth - settings.enemyArchetypes.fast.gateDamage
    );
  });

  it("retains declaration order when targets tie", () => {
    const settings = config({ pathLength: 100, baseDefenseDamage: 3 });
    const combat = enterCombat(createDefenseState(settings, 1), settings);
    const initial: DefenseState = {
      ...combat,
      enemies: [
        {
          enemyId: "earlier",
          sectorId: 0,
          enemyType: "balanced",
          health: 10,
          maxHealth: 10,
          progress: 5
        },
        {
          enemyId: "later",
          sectorId: 0,
          enemyType: "balanced",
          health: 10,
          maxHealth: 10,
          progress: 5
        }
      ]
    };

    const result = advanceDefense(initial, settings);
    expect(result.enemies.find((enemy) => enemy.enemyId === "earlier")?.health).toBe(7);
    expect(result.enemies.find((enemy) => enemy.enemyId === "later")?.health).toBe(10);
  });

  it("finishes only after the fifth wave boss is cleared", () => {
    const settings = config({ baseDefenseDamage: 100 });
    let state = createDefenseState(settings, 1);

    for (let step = 0; step < 12 && state.result === "in_progress"; step += 1) {
      state = advanceDefense(state, settings);
    }

    expect(state.waveNumber).toBe(5);
    expect(state.result).toBe("victory");
    expect(advanceDefense(state, settings)).toBe(state);
  });
});

describe("shared defense economy and ability", () => {
  it("allows repair and upgrade during intermission", () => {
    const settings = config({ startingTreasury: 100 });
    const initial = damagedState(createDefenseState(settings, 1), 80, 100);
    const repaired = applyDefenseAction(initial, settings, { type: "repair", sectorId: 0 });
    const upgraded = applyDefenseAction(repaired.state, settings, {
      type: "upgrade",
      sectorId: 1
    });

    expect(repaired.accepted).toBe(true);
    expect(upgraded.accepted).toBe(true);
    expect(upgraded.state.sectors[1].defenseLevel).toBe(2);
  });

  it("spends airstrike charge before adding kill rewards", () => {
    const settings = config({
      airstrike: { chargeRequired: 100, damage: 50 }
    });
    const combat = enterCombat(createDefenseState(settings, 1), settings);
    const initial: DefenseState = {
      ...combat,
      airstrikeCharge: 100,
      enemies: [
        {
          enemyId: "one",
          sectorId: 1,
          enemyType: "fast",
          health: 10,
          maxHealth: 10,
          progress: 1
        },
        {
          enemyId: "two",
          sectorId: 1,
          enemyType: "heavy",
          health: 20,
          maxHealth: 20,
          progress: 2
        }
      ]
    };

    const result = applyDefenseAction(initial, settings, {
      type: "airstrike",
      targetSectorId: 1,
      actionId: "action-1",
      playerId: "player-1"
    });

    expect(result.accepted).toBe(true);
    expect(result.state.enemies).toEqual([]);
    expect(result.state.airstrikeCharge).toBe(
      settings.enemyArchetypes.fast.airstrikeCharge + settings.enemyArchetypes.heavy.airstrikeCharge
    );
    expect(result.state.lastAirstrikeEffect).toMatchObject({
      sequence: 1,
      targetSectorId: 1,
      actionId: "action-1",
      playerId: "player-1"
    });
  });

  it("rejects airstrike outside combat, without full charge, or with an empty target", () => {
    const settings = config();
    const intermission = createDefenseState(settings, 1);
    const action = {
      type: "airstrike" as const,
      targetSectorId: 0 as const,
      actionId: "action-1",
      playerId: "player-1"
    };

    expect(applyDefenseAction(intermission, settings, action).accepted).toBe(false);
    const combat = enterCombat(intermission, settings);
    expect(applyDefenseAction(combat, settings, action).accepted).toBe(false);
    expect(applyDefenseAction({ ...combat, airstrikeCharge: 100 }, settings, action).accepted).toBe(
      false
    );
  });

  it("rejects economy actions after battle completion", () => {
    const settings = config();
    const finished = { ...createDefenseState(settings, 1), result: "victory" as const };

    expect(applyDefenseAction(finished, settings, { type: "upgrade", sectorId: 0 })).toEqual({
      accepted: false,
      reason: "battle_finished",
      state: finished
    });
  });
});
