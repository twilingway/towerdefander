import { describe, expect, it } from "vitest";

import {
  BALANCE_STATS_FILE_VERSION,
  MAX_BATCH_RUNS,
  batchReportSchema,
  batchRequestSchema,
  countBatchCells,
  countBatchRuns,
  runStatsSchema,
  type BatchRequest
} from "./balanceStats.ts";

function request(overrides: Partial<BatchRequest> = {}): BatchRequest {
  return {
    levels: ["veteran"],
    enemyOffsets: [0],
    crewSizes: [3],
    presetIds: ["default"],
    shipArchetypeIds: ["guardian"],
    runsPerCell: 20,
    firstSeed: 1,
    maxWaves: 40,
    startWave: 1,
    intermissionSeconds: null,
    ...overrides
  };
}

const zeroStats = runStatsSchema.parse({
  shotsByCannon: 0,
  shotsByMachineGun: 0,
  hitsByCannon: 0,
  hitsByMachineGun: 0,
  damageDealtByCannon: 0,
  damageDealtByMachineGun: 0,
  damageTakenFromBullets: 0,
  damageTakenFromMissiles: 0,
  damageTakenFromAsteroids: 0,
  damageTakenFromBeams: 0,
  shieldBlocks: 0,
  shieldEnergySpentOnBlocks: 0,
  shieldOverdrawnHits: 0,
  creditsEarned: 0,
  creditsSpent: 0,
  asteroidsDestroyed: 0
});

const zeroSummary = { min: 0, median: 0, mean: 0, p95: 0, max: 0 };

function report(overrides: Record<string, unknown> = {}) {
  return {
    version: BALANCE_STATS_FILE_VERSION,
    batchId: "abc123",
    status: "running" as const,
    startedAtMs: 1,
    finishedAtMs: null,
    request: request(),
    presets: [{ id: "default", name: "Базовый" }],
    totalCells: 1,
    cells: [],
    ...overrides
  };
}

describe("batch request", () => {
  it("rejects an empty axis", () => {
    expect(batchRequestSchema.safeParse(request({ levels: [] })).success).toBe(false);
    expect(batchRequestSchema.safeParse(request({ crewSizes: [] })).success).toBe(false);
  });

  it("rejects an offset outside the difficulty range", () => {
    expect(batchRequestSchema.safeParse(request({ enemyOffsets: [3] })).success).toBe(false);
  });

  it("counts cells and runs across all four axes", () => {
    const asked = request({
      levels: ["rookie", "veteran", "ace"],
      enemyOffsets: [-1, 0, 1],
      crewSizes: [1, 2, 3],
      presetIds: ["default", "hard"],
      shipArchetypeIds: ["guardian"],
      runsPerCell: 10
    });
    expect(countBatchCells(asked)).toBe(54);
    expect(countBatchRuns(asked)).toBe(540);
    expect(countBatchRuns(asked)).toBeLessThan(MAX_BATCH_RUNS);
  });
});

describe("batch report", () => {
  it("accepts a partial report while the batch is still running", () => {
    expect(batchReportSchema.safeParse(report()).success).toBe(true);
  });

  it("refuses a report written by another version of the format", () => {
    expect(batchReportSchema.safeParse(report({ version: 999 })).success).toBe(false);
  });

  it("refuses an unknown field rather than carrying it forward", () => {
    expect(batchReportSchema.safeParse(report({ leftover: 1 })).success).toBe(false);
  });

  it("accepts a finished cell with its wave series", () => {
    const parsed = batchReportSchema.safeParse(
      report({
        status: "complete",
        finishedAtMs: 2,
        cells: [
          {
            key: {
              level: "veteran",
              enemyOffset: 0,
              crewSize: 3,
              presetId: "default",
              shipArchetypeId: "guardian"
            },
            completedRuns: 1,
            wave: zeroSummary,
            score: zeroSummary,
            seconds: zeroSummary,
            outcomes: { spaceshipDestroyed: 1, waveTimeout: 0, unfinished: 0 },
            bossWavesCleared: 1,
            bossKills: 1,
            stats: zeroStats,
            upgradesBought: { hullPlating1: 1, heavyRounds: 2 },
            splitVotes: 3,
            builds: [
              {
                key: "heavyRoundsx2+hullPlating1x1",
                build: { heavyRounds: 2, hullPlating1: 1 },
                runs: 1,
                medianWave: 5,
                bestWave: 5,
                medianScore: 700
              }
            ],
            upgradeImpact: [
              {
                upgradeId: "gunner_damage",
                bought: 2,
                runsWith: 1,
                medianWaveWith: 5,
                runsWithout: 0,
                medianWaveWithout: 0
              }
            ],
            waves: [
              {
                waveNumber: 5,
                runsReaching: 1,
                runsCleared: 1,
                runsBought: 1,
                bossWave: true,
                bossKills: 1,
                medianSeconds: 42.5,
                medianHpEnd: 61,
                killsByKind: { gunship: 2, boss: 1 },
                compositionByKind: { gunship: 2, boss: 1 },
                stats: zeroStats
              }
            ],
            runs: [
              {
                seed: 1,
                wave: 5,
                score: 700,
                seconds: 300,
                upgrades: { gunner_damage: 2, pilot_hull: 1 },
                outcome: "defeat",
                defeatReason: "spaceship_destroyed",
                bossKills: 1
              }
            ]
          }
        ]
      })
    );
    expect(parsed.success).toBe(true);
  });
});
