/**
 * The matrix driver: runs every cell of levels x enemy offsets x crew sizes x
 * presets and writes the report the console charts.
 *
 * The aggregate document is rewritten after every finished cell, so a batch
 * killed by a server restart is still readable and still charted, and the file
 * — not the parent's memory — is the durable record of progress. One NDJSON
 * line per finished cell goes to stdout for whoever is watching live.
 *
 * Usage:
 *   node apps/server/scripts/run-balance-batch.mjs --out <dir>
 *        [--levels rookie,veteran,ace] [--offsets=-1,0,1] [--crews 1,2,3]
 *        [--presets default] [--runs 20] [--seed 1] [--max-waves 40]
 *        [--start-wave 1] [--intermission 3] [--preset path.json]
 */
import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import {
  BALANCE_STATS_FILE_VERSION,
  batchReportSchema,
  batchRequestSchema,
  countBatchCells,
  countBatchRuns,
  MAX_BATCH_CELLS,
  MAX_BATCH_RUNS
} from "@spaceship-defender/protocol";

import { buildConfig, playRun, profileFor, readPresets, readTuning } from "./balance-run.mjs";
import { aggregateCell } from "./batch-aggregate.mjs";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    levels: { type: "string", default: "rookie,veteran,ace" },
    offsets: { type: "string", default: "0" },
    crews: { type: "string", default: "3" },
    presets: { type: "string" },
    runs: { type: "string", default: "20" },
    seed: { type: "string", default: "1" },
    "max-waves": { type: "string", default: "40" },
    "start-wave": { type: "string", default: "1" },
    intermission: { type: "string" },
    preset: { type: "string" },
    "batch-id": { type: "string" }
  }
});

const list = (raw) =>
  String(raw)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

async function writeAtomic(path, document) {
  const temporary = `${path}.${String(process.pid)}-${String(Date.now())}.tmp`;
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function main() {
  const outDirectory = values.out;
  if (outDirectory === undefined) throw new Error("--out <directory> is required");

  const presetsOnDisk = await readPresets(values.preset);
  const requestedPresets =
    values.presets === undefined ? [presetsOnDisk.activePresetId] : list(values.presets);

  const request = batchRequestSchema.parse({
    levels: list(values.levels),
    enemyOffsets: list(values.offsets).map(Number),
    crewSizes: list(values.crews).map(Number),
    presetIds: requestedPresets,
    runsPerCell: Number(values.runs),
    firstSeed: Number(values.seed),
    maxWaves: Number(values["max-waves"]),
    startWave: Number(values["start-wave"]),
    intermissionSeconds: values.intermission === undefined ? null : Number(values.intermission)
  });

  const totalCells = countBatchCells(request);
  if (totalCells > MAX_BATCH_CELLS) {
    throw new RangeError(
      `Batch asks for ${String(totalCells)} cells, ceiling is ${String(MAX_BATCH_CELLS)}`
    );
  }
  const totalRuns = countBatchRuns(request);
  if (totalRuns > MAX_BATCH_RUNS) {
    throw new RangeError(
      `Batch asks for ${String(totalRuns)} runs, ceiling is ${String(MAX_BATCH_RUNS)}`
    );
  }

  const batchId = values["batch-id"] ?? randomUUID().slice(0, 8);
  await mkdir(outDirectory, { recursive: true });
  const aggregatePath = join(outDirectory, `batch-${batchId}.json`);
  const detailPath = join(outDirectory, `batch-${batchId}.runs.json`);

  // Tuning is read once per preset: the file does not change under a batch, and
  // re-reading it per cell would let a console save split one measurement in two.
  const tunings = new Map();
  for (const presetId of request.presetIds) {
    tunings.set(presetId, await readTuning(values.preset, presetId));
  }

  const report = {
    version: BALANCE_STATS_FILE_VERSION,
    batchId,
    status: "running",
    startedAtMs: Date.now(),
    finishedAtMs: null,
    request,
    presets: request.presetIds.map((id) => ({
      id,
      name: tunings.get(id)?.presetName ?? id
    })),
    totalCells,
    cells: []
  };
  const details = [];
  await writeAtomic(aggregatePath, report);

  for (const presetId of request.presetIds) {
    const { tuning } = tunings.get(presetId);
    for (const level of request.levels) {
      for (const enemyOffset of request.enemyOffsets) {
        for (const crewSize of request.crewSizes) {
          const { config, autopilot } = buildConfig(tuning, {
            intermissionSeconds: request.intermissionSeconds ?? undefined,
            enemyOffset
          });
          const profile = profileFor(autopilot, level, config.cannonWeaponKind);
          const runs = [];
          for (let index = 0; index < request.runsPerCell; index += 1) {
            runs.push(
              playRun(config, {
                seed: request.firstSeed + index,
                level,
                profile,
                maxWaves: request.maxWaves,
                startWave: request.startWave,
                crewSize,
                detail: true
              })
            );
          }
          const key = { level, enemyOffset, crewSize, presetId };
          report.cells.push(aggregateCell(key, runs));
          details.push({ key, runs });
          await writeAtomic(aggregatePath, report);
          // One line per finished cell: the parent watches this to report
          // progress without reopening the file.
          console.log(
            JSON.stringify({
              event: "cell",
              batchId,
              key,
              completedCells: report.cells.length,
              totalCells: report.totalCells,
              completedRuns: report.cells.length * request.runsPerCell,
              totalRuns
            })
          );
        }
      }
    }
  }

  report.status = "complete";
  report.finishedAtMs = Date.now();
  batchReportSchema.parse(report);
  await writeAtomic(aggregatePath, report);
  await writeAtomic(detailPath, { version: BALANCE_STATS_FILE_VERSION, batchId, cells: details });
  console.log(JSON.stringify({ event: "done", batchId, totalCells: report.totalCells }));
}

await main();
