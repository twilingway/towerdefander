import { z } from "zod";

import { AUTOPILOT_LEVELS } from "./balance.ts";

/**
 * The batch report is a file format shared by a writer (the headless harness)
 * and a reader (the server and the console) — not a wire contract, so it
 * carries its own version rather than moving `PROTOCOL_VERSION`, which would
 * force display and controller redeploys for a change neither can observe.
 *
 * Unlike the balance file there are **no migrations**. A report is a
 * measurement, and a measurement of a metric whose meaning has since changed is
 * worse than no measurement: the reader drops a foreign version and says how
 * many it dropped.
 */
export const BALANCE_STATS_FILE_VERSION = 1 as const;

/** Ceilings that keep one console click from pinning a core for an hour. */
export const MAX_BATCH_RUNS = 2000;
export const MAX_BATCH_CELLS = 90;

export const ENEMY_OFFSETS = [-2, -1, 0, 1, 2] as const;
export const CREW_SIZES = [1, 2, 3] as const;

const nonNegativeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const nonNegativeFinite = z.number().nonnegative();

export const batchStatusSchema = z.enum(["running", "complete", "stopped", "failed"]);
export type BatchStatus = z.infer<typeof batchStatusSchema>;

export const batchRequestSchema = z
  .object({
    levels: z.array(z.enum(AUTOPILOT_LEVELS)).min(1).max(3),
    enemyOffsets: z.array(z.number().int().min(-2).max(2)).min(1).max(5),
    crewSizes: z.array(z.number().int().min(1).max(3)).min(1).max(3),
    presetIds: z.array(z.string().min(1).max(64)).min(1).max(10),
    runsPerCell: z.number().int().positive().max(200),
    firstSeed: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    maxWaves: z.number().int().positive().max(200),
    startWave: z.number().int().positive().max(200),
    /** Null keeps whatever the preset says. */
    intermissionSeconds: z.number().positive().max(600).nullable()
  })
  .strict();
export type BatchRequest = z.infer<typeof batchRequestSchema>;

const summarySchema = z
  .object({
    min: z.number(),
    median: z.number(),
    mean: z.number(),
    p95: z.number(),
    max: z.number()
  })
  .strict();
export type StatSummary = z.infer<typeof summarySchema>;

/** The fifteen counters `game-core` keeps, as a delta or as a run total. */
export const runStatsSchema = z
  .object({
    shotsByCannon: nonNegativeFinite,
    shotsByMachineGun: nonNegativeFinite,
    hitsByCannon: nonNegativeFinite,
    hitsByMachineGun: nonNegativeFinite,
    damageDealtByCannon: nonNegativeFinite,
    damageDealtByMachineGun: nonNegativeFinite,
    damageTakenFromBullets: nonNegativeFinite,
    damageTakenFromMissiles: nonNegativeFinite,
    damageTakenFromAsteroids: nonNegativeFinite,
    shieldBlocks: nonNegativeFinite,
    shieldEnergySpentOnBlocks: nonNegativeFinite,
    shieldOverdrawnHits: nonNegativeFinite,
    creditsEarned: nonNegativeFinite,
    creditsSpent: nonNegativeFinite,
    asteroidsDestroyed: nonNegativeFinite
  })
  .strict();
export type RunStatsReport = z.infer<typeof runStatsSchema>;

const countsByKindSchema = z.record(z.string().min(1).max(64), nonNegativeFinite);

export const waveAggregateSchema = z
  .object({
    waveNumber: z.number().int().positive(),
    /** How many runs of the cell got this far, and how many walked away from it. */
    runsReaching: nonNegativeInteger,
    runsCleared: nonNegativeInteger,
    bossWave: z.boolean(),
    bossKills: nonNegativeFinite,
    medianSeconds: nonNegativeFinite,
    medianHpEnd: z.number(),
    killsByKind: countsByKindSchema,
    compositionByKind: countsByKindSchema,
    stats: runStatsSchema
  })
  .strict();
export type WaveAggregate = z.infer<typeof waveAggregateSchema>;

/** How many of each upgrade a run managed to buy: its build. */
export const buildSchema = z.record(z.string().min(1).max(64), nonNegativeInteger);
export type UpgradeBuild = z.infer<typeof buildSchema>;

export const thinRunSchema = z
  .object({
    seed: z.number().int().positive(),
    wave: z.number().int().positive(),
    score: z.number(),
    seconds: nonNegativeFinite,
    upgrades: buildSchema,
    outcome: z.enum(["defeat", "victory", "unfinished"]),
    defeatReason: z.enum(["spaceship_destroyed", "wave_timeout"]).nullable(),
    bossKills: nonNegativeFinite
  })
  .strict();
export type ThinRun = z.infer<typeof thinRunSchema>;

export const buildResultSchema = z
  .object({
    /** Stable signature of the build, e.g. `gunner_damage x2 + pilot_hull x1`. */
    key: z.string().max(400),
    build: buildSchema,
    /** One run behind a row is an anecdote; the table shows this on purpose. */
    runs: nonNegativeInteger,
    medianWave: nonNegativeFinite,
    bestWave: nonNegativeFinite,
    medianScore: z.number()
  })
  .strict();
export type BuildResult = z.infer<typeof buildResultSchema>;

export const upgradeImpactSchema = z
  .object({
    upgradeId: z.string().min(1).max(64),
    bought: nonNegativeInteger,
    runsWith: nonNegativeInteger,
    medianWaveWith: nonNegativeFinite,
    runsWithout: nonNegativeInteger,
    medianWaveWithout: nonNegativeFinite
  })
  .strict();
export type UpgradeImpact = z.infer<typeof upgradeImpactSchema>;

export const cellKeySchema = z
  .object({
    level: z.enum(AUTOPILOT_LEVELS),
    enemyOffset: z.number().int().min(-2).max(2),
    crewSize: z.number().int().min(1).max(3),
    presetId: z.string().min(1).max(64)
  })
  .strict();
export type CellKey = z.infer<typeof cellKeySchema>;

export const batchCellSchema = z
  .object({
    key: cellKeySchema,
    completedRuns: nonNegativeInteger,
    wave: summarySchema,
    score: summarySchema,
    seconds: summarySchema,
    outcomes: z
      .object({
        spaceshipDestroyed: nonNegativeInteger,
        waveTimeout: nonNegativeInteger,
        unfinished: nonNegativeInteger
      })
      .strict(),
    bossWavesCleared: nonNegativeInteger,
    bossKills: nonNegativeFinite,
    stats: runStatsSchema,
    upgradesBought: z.record(z.string().min(1).max(64), nonNegativeInteger),
    /** How often the seats disagreed, which is what the crew axis measures. */
    splitVotes: nonNegativeInteger,
    builds: z.array(buildResultSchema).max(24),
    upgradeImpact: z.array(upgradeImpactSchema).max(32),
    waves: z.array(waveAggregateSchema).max(200),
    runs: z.array(thinRunSchema).max(200)
  })
  .strict();
export type BatchCell = z.infer<typeof batchCellSchema>;

export const batchReportSchema = z
  .object({
    version: z.literal(BALANCE_STATS_FILE_VERSION),
    batchId: z.string().min(1).max(64),
    status: batchStatusSchema,
    startedAtMs: z.number().int().positive(),
    finishedAtMs: z.number().int().positive().nullable(),
    request: batchRequestSchema,
    presets: z
      .array(z.object({ id: z.string().min(1).max(64), name: z.string().max(200) }).strict())
      .max(10),
    totalCells: z.number().int().positive().max(MAX_BATCH_CELLS),
    cells: z.array(batchCellSchema).max(MAX_BATCH_CELLS)
  })
  .strict();
export type BatchReport = z.infer<typeof batchReportSchema>;

/** What the list endpoint returns: headers only, so it stays small. */
export const batchHeaderSchema = z
  .object({
    batchId: z.string().min(1).max(64),
    status: batchStatusSchema,
    startedAtMs: z.number().int().positive(),
    finishedAtMs: z.number().int().positive().nullable(),
    totalCells: z.number().int().positive(),
    completedCells: nonNegativeInteger,
    request: batchRequestSchema
  })
  .strict();
export type BatchHeader = z.infer<typeof batchHeaderSchema>;

export const batchListResponseSchema = z
  .object({
    batches: z.array(batchHeaderSchema).max(200),
    /** Reports on disk written by another version of this format. */
    droppedForVersion: nonNegativeInteger
  })
  .strict();
export type BatchListResponse = z.infer<typeof batchListResponseSchema>;

export const batchProgressSchema = z
  .object({
    batchId: z.string().min(1).max(64),
    completedCells: nonNegativeInteger,
    totalCells: z.number().int().positive(),
    completedRuns: nonNegativeInteger,
    totalRuns: z.number().int().positive(),
    currentCell: cellKeySchema.nullable(),
    log: z.array(z.string().max(400)).max(50)
  })
  .strict();
export type BatchProgress = z.infer<typeof batchProgressSchema>;

export const batchRunningResponseSchema = z
  .object({ running: batchProgressSchema.nullable() })
  .strict();
export type BatchRunningResponse = z.infer<typeof batchRunningResponseSchema>;

/** Cells the request asks for, which both the ceiling check and the UI need. */
export function countBatchCells(request: BatchRequest): number {
  return (
    request.levels.length *
    request.enemyOffsets.length *
    request.crewSizes.length *
    request.presetIds.length
  );
}

export function countBatchRuns(request: BatchRequest): number {
  return countBatchCells(request) * request.runsPerCell;
}
