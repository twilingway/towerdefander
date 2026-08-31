import { describe, expect, it } from "vitest";

import {
  BALANCE_STATS_FILE_VERSION,
  type BatchCell,
  type BatchReport,
  type CellKey,
  type RunStatsReport
} from "@spaceship-defender/protocol";

import {
  accuracyBars,
  bossRows,
  cellId,
  cellLabel,
  economyByWave,
  outcomeBars,
  reachShare,
  upgradeRows,
  waveByLevel,
  waveByOffset
} from "./aggregate.js";

const zeroStats: RunStatsReport = {
  shotsByCannon: 0,
  shotsByMachineGun: 0,
  hitsByCannon: 0,
  hitsByMachineGun: 0,
  damageDealtByCannon: 0,
  damageDealtByMachineGun: 0,
  damageTakenFromBullets: 0,
  damageTakenFromMissiles: 0,
  damageTakenFromAsteroids: 0,
  shieldBlocks: 0,
  shieldEnergySpentOnBlocks: 0,
  shieldOverdrawnHits: 0,
  creditsEarned: 0,
  creditsSpent: 0,
  asteroidsDestroyed: 0
};

function cell(key: CellKey, overrides: Partial<BatchCell> = {}): BatchCell {
  return {
    key,
    completedRuns: 4,
    wave: { min: 3, median: 6, mean: 6, p95: 8, max: 8 },
    score: { min: 100, median: 400, mean: 400, p95: 700, max: 700 },
    seconds: { min: 100, median: 300, mean: 300, p95: 500, max: 500 },
    outcomes: { spaceshipDestroyed: 3, waveTimeout: 1, unfinished: 0 },
    bossWavesCleared: 1,
    bossKills: 1,
    stats: zeroStats,
    upgradesBought: {},
    splitVotes: 0,
    builds: [],
    upgradeImpact: [],
    waves: [],
    runs: [],
    ...overrides
  };
}

function report(cells: BatchCell[]): BatchReport {
  return {
    version: BALANCE_STATS_FILE_VERSION,
    batchId: "b1",
    status: "complete",
    startedAtMs: 1,
    finishedAtMs: 2,
    request: {
      levels: ["rookie", "ace"],
      enemyOffsets: [0],
      crewSizes: [3],
      presetIds: ["default"],
      shipArchetypeIds: ["guardian"],
      runsPerCell: 4,
      firstSeed: 1,
      maxWaves: 40,
      startWave: 1,
      intermissionSeconds: null
    },
    presets: [{ id: "default", name: "Базовый" }],
    totalCells: cells.length,
    cells
  };
}

describe("cell identity", () => {
  it("keys a cell by all five axes", () => {
    const key: CellKey = {
      level: "ace",
      enemyOffset: -1,
      crewSize: 2,
      presetId: "default",
      shipArchetypeId: "guardian"
    };
    expect(cellId(key)).toBe("default|guardian|ace|-1|2");
    expect(cellLabel(key)).toBe("guardian · Ас · сдвиг -1 · экипаж 2");
  });

  it("marks a non-negative offset with a sign so the axis reads in order", () => {
    expect(
      cellLabel({
        level: "rookie",
        enemyOffset: 0,
        crewSize: 1,
        presetId: "p",
        shipArchetypeId: "guardian"
      })
    ).toContain("сдвиг +0");
  });
});

describe("wave series", () => {
  const cells = [
    cell(
      {
        level: "rookie",
        enemyOffset: 0,
        crewSize: 3,
        presetId: "default",
        shipArchetypeId: "guardian"
      },
      {
        wave: { min: 1, median: 5, mean: 5, p95: 6, max: 6 }
      }
    ),
    cell(
      {
        level: "ace",
        enemyOffset: 0,
        crewSize: 3,
        presetId: "default",
        shipArchetypeId: "guardian"
      },
      {
        wave: { min: 2, median: 9, mean: 9, p95: 10, max: 10 }
      }
    )
  ];

  it("groups the median wave by level with crew size as the series", () => {
    const bars = waveByLevel(report(cells));
    expect(bars.categories).toEqual(["Новичок", "Ас"]);
    expect(bars.series).toHaveLength(1);
    expect(bars.series[0]?.points).toEqual([5, 9]);
  });

  it("puts the difficulty offset on the axis with one line per level", () => {
    const bars = waveByOffset(report(cells));
    expect(bars.categories).toEqual(["+0"]);
    expect(bars.series.map(({ label }) => label)).toEqual(["Новичок", "Ас"]);
  });
});

describe("reach share", () => {
  it("reports the percentage of runs that got to each wave", () => {
    const withWaves = cell(
      {
        level: "ace",
        enemyOffset: 0,
        crewSize: 3,
        presetId: "default",
        shipArchetypeId: "guardian"
      },
      {
        completedRuns: 4,
        waves: [
          {
            waveNumber: 1,
            runsReaching: 4,
            runsCleared: 4,
            runsBought: 4,
            bossWave: false,
            bossKills: 0,
            medianSeconds: 30,
            medianHpEnd: 90,
            killsByKind: {},
            compositionByKind: {},
            stats: zeroStats
          },
          {
            waveNumber: 5,
            runsReaching: 1,
            runsCleared: 1,
            runsBought: 1,
            bossWave: true,
            bossKills: 1,
            medianSeconds: 60,
            medianHpEnd: 20,
            killsByKind: { boss: 1 },
            compositionByKind: { boss: 1 },
            stats: zeroStats
          }
        ]
      }
    );

    expect(reachShare(withWaves)).toEqual({ waves: [1, 5], share: [100, 25] });
    expect(bossRows(withWaves)).toEqual([{ waveNumber: 5, reaching: 1, cleared: 1, kills: 1 }]);
  });
});

describe("accuracy", () => {
  it("reads zero shots as zero rather than NaN", () => {
    const bars = accuracyBars([
      cell({
        level: "ace",
        enemyOffset: 0,
        crewSize: 3,
        presetId: "default",
        shipArchetypeId: "guardian"
      })
    ]);
    expect(bars.series[0]?.points).toEqual([0]);
  });

  it("turns hits over shots into whole percent", () => {
    const bars = accuracyBars([
      cell(
        {
          level: "ace",
          enemyOffset: 0,
          crewSize: 3,
          presetId: "default",
          shipArchetypeId: "guardian"
        },
        { stats: { ...zeroStats, shotsByCannon: 200, hitsByCannon: 50 } }
      )
    ]);
    expect(bars.series[0]?.points).toEqual([25]);
  });
});

describe("outcomes and upgrades", () => {
  it("stacks the three ways a run can end", () => {
    const bars = outcomeBars([
      cell({
        level: "ace",
        enemyOffset: 0,
        crewSize: 3,
        presetId: "default",
        shipArchetypeId: "guardian"
      })
    ]);
    expect(bars.series.map(({ points }) => points[0])).toEqual([3, 1, 0]);
  });

  it("orders bought upgrades by how often they were bought", () => {
    const rows = upgradeRows(
      cell(
        {
          level: "ace",
          enemyOffset: 0,
          crewSize: 3,
          presetId: "default",
          shipArchetypeId: "guardian"
        },
        { upgradesBought: { pilot_hull: 1, gunner_damage: 5, shield_arc: 3 } }
      )
    );
    expect(rows.map(({ upgradeId }) => upgradeId)).toEqual([
      "gunner_damage",
      "shield_arc",
      "pilot_hull"
    ]);
  });

  it("puts earned and spent credits on one wave axis", () => {
    const series = economyByWave(
      cell(
        {
          level: "ace",
          enemyOffset: 0,
          crewSize: 3,
          presetId: "default",
          shipArchetypeId: "guardian"
        },
        {
          waves: [
            {
              waveNumber: 2,
              runsReaching: 1,
              runsCleared: 1,
              runsBought: 1,
              bossWave: false,
              bossKills: 0,
              medianSeconds: 20,
              medianHpEnd: 80,
              killsByKind: {},
              compositionByKind: {},
              stats: { ...zeroStats, creditsEarned: 12, creditsSpent: 5 }
            }
          ]
        }
      )
    );
    expect(series.categories).toEqual(["2"]);
    expect(series.series.map(({ points }) => points[0])).toEqual([12, 5]);
  });
});
