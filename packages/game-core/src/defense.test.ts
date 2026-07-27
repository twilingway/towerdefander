import { describe, expect, it } from "vitest";

import {
  STARTING_TREASURY_PER_SECTOR,
  advanceDefense,
  applyDefenseAction,
  createDefenseState,
  createPrototypeDefenseConfig,
  getAirstrikeTargetSectorIds,
  isAirstrikeTargetAllowed,
  prototypeDefenseConfig,
  validateDefenseConfig,
  type DefenseConfig,
  type DefenseState,
  type SectorId,
  type WaveConfig,
  type WaveSpawn
} from "./index.js";

const sectorCounts = [2, 3, 4, 5, 6] as const;

function wave(spawns: WaveConfig["spawns"] = []): WaveConfig {
  return { spawns };
}

function sectorIds(sectorCount: number): SectorId[] {
  return Array.from({ length: sectorCount }, (_, sectorId) => sectorId as SectorId);
}

function bossSpawns(sectorCount: number, step = 1): WaveSpawn[] {
  return sectorIds(sectorCount).map((sectorId) => ({
    step,
    sectorId,
    enemyType: "boss"
  }));
}

function minimalWaves(
  sectorCount: number,
  firstWaveSpawns: readonly WaveSpawn[] = []
): readonly WaveConfig[] {
  return [wave(firstWaveSpawns), wave(), wave(), wave(), wave(bossSpawns(sectorCount))];
}

function config(sectorCount = 2, overrides: Partial<DefenseConfig> = {}): DefenseConfig {
  const base = createPrototypeDefenseConfig(sectorCount);
  return {
    ...base,
    fixedStepMs: 1000,
    intermissionDurationMs: 1000,
    waves: minimalWaves(sectorCount),
    ...overrides,
    enemyArchetypes: {
      ...base.enemyArchetypes,
      ...overrides.enemyArchetypes
    },
    airstrike: {
      ...base.airstrike,
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

function damagedState(
  base: DefenseState,
  sectorId: SectorId,
  gateHealth: number,
  treasury = base.treasury
): DefenseState {
  return {
    ...base,
    treasury,
    sectors: base.sectors.map((sector) =>
      sector.sectorId === sectorId ? { ...sector, gateHealth } : sector
    )
  };
}

describe("dynamic defense configuration", () => {
  it.each(sectorCounts)(
    "creates deterministic first-wave state for %i sectors with derived treasury",
    (sectorCount) => {
      const settings = config(sectorCount);
      const state = createDefenseState(settings, 42);

      expect(state).toEqual(createDefenseState(settings, 42));
      expect(state).toMatchObject({
        waveNumber: 1,
        stage: "intermission",
        intermissionRemainingSteps: 1,
        waveStep: 0,
        airstrikeCharge: 0,
        treasury: STARTING_TREASURY_PER_SECTOR * sectorCount
      });
      expect(state.sectors.map((sector) => sector.sectorId)).toEqual(sectorIds(sectorCount));
      expect(state.sectors).toHaveLength(sectorCount);
      expect("startingTreasury" in settings).toBe(false);
    }
  );

  it.each(sectorCounts)(
    "expands prototype wave templates canonically and symmetrically for %i sectors",
    (sectorCount) => {
      const settings = createPrototypeDefenseConfig(sectorCount);

      for (const currentWave of settings.waves) {
        expect(currentWave.spawns.length % sectorCount).toBe(0);
        for (let index = 0; index < currentWave.spawns.length; index += sectorCount) {
          const expansion = currentWave.spawns.slice(index, index + sectorCount);
          expect(expansion.map((spawn) => spawn.sectorId)).toEqual(sectorIds(sectorCount));
          expect(new Set(expansion.map((spawn) => spawn.step))).toHaveLength(1);
          expect(new Set(expansion.map((spawn) => spawn.enemyType))).toHaveLength(1);
        }
      }

      const perSectorSchedules = sectorIds(sectorCount).map((sectorId) =>
        settings.waves.map((currentWave) =>
          currentWave.spawns
            .filter((spawn) => spawn.sectorId === sectorId)
            .map(({ step, enemyType }) => ({ step, enemyType }))
        )
      );
      for (const schedule of perSectorSchedules.slice(1)) {
        expect(schedule).toEqual(perSectorSchedules[0]);
      }

      const bosses = settings.waves[4]?.spawns.filter((spawn) => spawn.enemyType === "boss");
      expect(bosses?.map((spawn) => spawn.sectorId)).toEqual(sectorIds(sectorCount));
    }
  );

  it("keeps the exported default prototype at two sectors", () => {
    expect(prototypeDefenseConfig).toEqual(createPrototypeDefenseConfig(2));
  });

  it.each([1, 7, 2.5, Number.NaN])("rejects invalid prototype sectorCount %s", (sectorCount) => {
    expect(() => createPrototypeDefenseConfig(sectorCount)).toThrow(RangeError);
  });

  it("rejects invalid intermission, spawn order, sector references, and boss coverage", () => {
    expect(() => {
      validateDefenseConfig(config(2, { fixedStepMs: 0 }));
    }).toThrow(RangeError);
    expect(() => {
      validateDefenseConfig(config(2, { fixedStepMs: 600, intermissionDurationMs: 1000 }));
    }).toThrow(RangeError);
    expect(() => {
      validateDefenseConfig(config(2, { waves: [wave()] }));
    }).toThrow(RangeError);

    expect(() => {
      validateDefenseConfig(
        config(2, {
          waves: minimalWaves(2, [
            { step: 2, sectorId: 0, enemyType: "balanced" },
            { step: 1, sectorId: 1, enemyType: "balanced" }
          ])
        })
      );
    }).toThrow(RangeError);

    expect(() => {
      validateDefenseConfig(
        config(2, {
          waves: minimalWaves(2, [{ step: 1, sectorId: 2, enemyType: "balanced" }])
        })
      );
    }).toThrow(RangeError);

    const missingBoss = minimalWaves(3).map((currentWave, waveIndex) =>
      waveIndex === 4
        ? wave(currentWave.spawns.filter((spawn) => spawn.sectorId !== 2))
        : currentWave
    );
    expect(() => {
      validateDefenseConfig(config(3, { waves: missingBoss }));
    }).toThrow(RangeError);

    const duplicateBoss = minimalWaves(2).map((currentWave, waveIndex) =>
      waveIndex === 4
        ? wave([...currentWave.spawns, { step: 2, sectorId: 0, enemyType: "boss" }])
        : currentWave
    );
    expect(() => {
      validateDefenseConfig(config(2, { waves: duplicateBoss }));
    }).toThrow(RangeError);

    const earlyBoss = minimalWaves(2).map((currentWave, waveIndex) =>
      waveIndex === 0 ? wave([{ step: 1, sectorId: 0, enemyType: "boss" }]) : currentWave
    );
    expect(() => {
      validateDefenseConfig(config(2, { waves: earlyBoss }));
    }).toThrow(RangeError);
    expect(() => createDefenseState(config(), Number.NaN)).toThrow(RangeError);
  });
});

describe("dynamic deterministic simulation", () => {
  it("uses a clean transition from intermission into first combat spawn", () => {
    const settings = config(2, {
      waves: minimalWaves(2, [{ step: 1, sectorId: 0, enemyType: "balanced" }])
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

  it.each(sectorCounts)(
    "applies spawn, attack, movement, and gate damage to %i sectors",
    (count) => {
      const spawns = sectorIds(count).map((sectorId): WaveSpawn => ({
        step: 1,
        sectorId,
        enemyType: "fast"
      }));
      const settings = config(count, {
        pathLength: 2,
        baseDefenseDamage: 1,
        waves: minimalWaves(count, spawns)
      });
      const result = advanceDefense(
        enterCombat(createDefenseState(settings, 1), settings),
        settings
      );

      expect(result.enemies).toEqual([]);
      expect(result.sectors).toHaveLength(count);
      for (const sector of result.sectors) {
        expect(sector.gateHealth).toBe(
          settings.gateMaxHealth - settings.enemyArchetypes.fast.gateDamage
        );
      }
    }
  );

  it.each(sectorCounts)("produces the same result for repeated %i-sector runs", (count) => {
    const settings = config(count, { baseDefenseDamage: 100 });
    let first = createDefenseState(settings, 77);
    let second = createDefenseState(settings, 77);

    for (let step = 0; step < 12; step += 1) {
      first = advanceDefense(first, settings);
      second = advanceDefense(second, settings);
    }

    expect(first).toEqual(second);
    expect(first.result).toBe("victory");
  });

  it("increments the wave on the clearing transition and preserves shared state", () => {
    const settings = config(2, {
      baseDefenseDamage: 100,
      waves: minimalWaves(2, [{ step: 1, sectorId: 0, enemyType: "balanced" }])
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

  it("retains declaration order when targets tie", () => {
    const settings = config(2, { pathLength: 100, baseDefenseDamage: 3 });
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
});

describe("dynamic economy and ring airstrike", () => {
  it.each(sectorCounts)("repairs and upgrades the final sector in a %i-sector defense", (count) => {
    const settings = config(count);
    const targetSectorId = (count - 1) as SectorId;
    const initial = damagedState(createDefenseState(settings, 1), targetSectorId, 80);
    const repaired = applyDefenseAction(initial, settings, {
      type: "repair",
      sectorId: targetSectorId
    });
    const upgraded = applyDefenseAction(repaired.state, settings, {
      type: "upgrade",
      sectorId: targetSectorId
    });

    expect(repaired.accepted).toBe(true);
    expect(upgraded.accepted).toBe(true);
    expect(upgraded.state.sectors[targetSectorId]?.defenseLevel).toBe(2);
  });

  it.each(sectorCounts)("derives ordered unique ring targets for %i sectors", (count) => {
    for (const sourceSectorId of sectorIds(count)) {
      const targets = getAirstrikeTargetSectorIds(sourceSectorId, count);
      const expected = [
        sourceSectorId,
        ((sourceSectorId - 1 + count) % count) as SectorId,
        ((sourceSectorId + 1) % count) as SectorId
      ].filter((sectorId, index, values) => values.indexOf(sectorId) === index);

      expect(targets).toEqual(expected);
      for (const targetSectorId of sectorIds(count)) {
        expect(isAirstrikeTargetAllowed(sourceSectorId, targetSectorId, count)).toBe(
          expected.includes(targetSectorId)
        );
      }
    }
  });

  it("deduplicates both neighbors in a two-sector ring", () => {
    expect(getAirstrikeTargetSectorIds(0, 2)).toEqual([0, 1]);
    expect(getAirstrikeTargetSectorIds(1, 2)).toEqual([1, 0]);
  });

  it("rejects globally valid sectors outside the defense and non-neighbor targets", () => {
    expect(isAirstrikeTargetAllowed(0, 5, 2)).toBe(false);
    expect(isAirstrikeTargetAllowed(0, 3, 6)).toBe(false);

    const settings = config(6);
    const combat: DefenseState = {
      ...enterCombat(createDefenseState(settings, 1), settings),
      airstrikeCharge: 100,
      enemies: [
        {
          enemyId: "far",
          sectorId: 3,
          enemyType: "balanced",
          health: 10,
          maxHealth: 10,
          progress: 1
        }
      ]
    };
    const result = applyDefenseAction(combat, settings, {
      type: "airstrike",
      sourceSectorId: 0,
      targetSectorId: 3,
      actionId: "action-far",
      playerId: "player-0"
    });

    expect(result).toEqual({ accepted: false, reason: "not_available", state: combat });
  });

  it("spends airstrike charge before adding kill rewards in a neighboring sector", () => {
    const settings = config(6, {
      airstrike: { chargeRequired: 100, damage: 50 }
    });
    const combat = enterCombat(createDefenseState(settings, 1), settings);
    const initial: DefenseState = {
      ...combat,
      airstrikeCharge: 100,
      enemies: [
        {
          enemyId: "one",
          sectorId: 5,
          enemyType: "fast",
          health: 10,
          maxHealth: 10,
          progress: 1
        },
        {
          enemyId: "two",
          sectorId: 5,
          enemyType: "heavy",
          health: 20,
          maxHealth: 20,
          progress: 2
        }
      ]
    };

    const result = applyDefenseAction(initial, settings, {
      type: "airstrike",
      sourceSectorId: 0,
      targetSectorId: 5,
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
      targetSectorId: 5,
      actionId: "action-1",
      playerId: "player-1"
    });
  });

  it("rejects airstrike outside combat, without full charge, or with an empty target", () => {
    const settings = config();
    const intermission = createDefenseState(settings, 1);
    const action = {
      type: "airstrike" as const,
      sourceSectorId: 0 as const,
      targetSectorId: 1 as const,
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

  it("rejects economy actions for a sector outside the configured defense", () => {
    const settings = config(2);
    const state = createDefenseState(settings, 1);

    expect(applyDefenseAction(state, settings, { type: "upgrade", sectorId: 5 })).toEqual({
      accepted: false,
      reason: "not_available",
      state
    });
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
