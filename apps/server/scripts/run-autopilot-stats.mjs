/**
 * Headless balance harness: the real simulation driven by the real autopilot
 * policy, with no browser, no network and no wall clock anywhere in the loop.
 *
 * The visible demo answers "does this look right". This answers "how far does a
 * crew of this skill actually get", which needs hundreds of runs rather than
 * one, and needs them reproducible. Everything here is a pure function of the
 * seed, so a run replays bit for bit.
 *
 * One cell of the measurement matrix. The whole matrix is `run-balance-batch`,
 * which drives the same engine in `balance-run.mjs`.
 *
 * Usage:
 *   node apps/server/scripts/run-autopilot-stats.mjs [--runs 20] [--level ace]
 *                                        [--seed 1] [--intermission 1]
 *                                        [--max-waves 40] [--start-wave 5]
 *                                        [--crew 3] [--enemy-offset 0]
 *                                        [--preset path.json] [--preset-id id]
 */
import { parseArgs } from "node:util";

import {
  DEFAULT_MAX_WAVES,
  TICK_MS,
  buildConfig,
  playRun,
  profileFor,
  readTuning,
  summarise
} from "./balance-run.mjs";

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "20" },
    level: { type: "string", default: "ace" },
    seed: { type: "string", default: "1" },
    intermission: { type: "string" },
    "max-waves": { type: "string" },
    "start-wave": { type: "string" },
    crew: { type: "string" },
    "enemy-offset": { type: "string" },
    preset: { type: "string" },
    "preset-id": { type: "string" },
    json: { type: "boolean", default: false }
  }
});

function positiveInteger(raw, name) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer, got ${String(raw)}`);
  }
  return value;
}

function boundedInteger(raw, name, min, max) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer in [${String(min)}, ${String(max)}]`);
  }
  return value;
}

async function main() {
  const runs = positiveInteger(values.runs, "--runs");
  const firstSeed = positiveInteger(values.seed, "--seed");
  const maxWaves =
    values["max-waves"] === undefined
      ? DEFAULT_MAX_WAVES
      : positiveInteger(values["max-waves"], "--max-waves");
  const startWave =
    values["start-wave"] === undefined ? 1 : positiveInteger(values["start-wave"], "--start-wave");
  const crewSize = values.crew === undefined ? 3 : boundedInteger(values.crew, "--crew", 1, 3);
  const enemyOffset =
    values["enemy-offset"] === undefined
      ? undefined
      : boundedInteger(values["enemy-offset"], "--enemy-offset", -2, 2);

  // Falls back to the server's own preset file, so the harness runs bare.
  const { tuning, presetId } = await readTuning(values.preset, values["preset-id"]);
  const { config, autopilot } = buildConfig(tuning, {
    intermissionSeconds: values.intermission,
    enemyOffset
  });
  const profile = profileFor(autopilot, values.level);

  const results = [];
  for (let index = 0; index < runs; index += 1) {
    results.push(
      playRun(config, {
        seed: firstSeed + index,
        level: values.level,
        profile,
        maxWaves,
        startWave,
        crewSize
      })
    );
  }

  const report = {
    harness: "spaceship-defender-autopilot-stats",
    level: values.level,
    presetId,
    crewSize,
    enemyOffset: enemyOffset ?? null,
    startWave,
    runs,
    intermissionSeconds: Number(((config.intermissionTicks * TICK_MS) / 1000).toFixed(2)),
    wave: summarise(results.map(({ wave }) => wave)),
    score: summarise(results.map(({ score }) => score)),
    seconds: summarise(results.map(({ seconds }) => seconds)),
    results
  };

  if (values.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(
    `${report.harness}: ${String(runs)} runs at "${values.level}", crew ${String(crewSize)}, ` +
      `preset "${presetId}", intermission ${String(report.intermissionSeconds)}s`
  );
  console.log(
    `  wave   min ${String(report.wave.min)}  median ${String(report.wave.median)}  ` +
      `mean ${String(report.wave.mean)}  max ${String(report.wave.max)}`
  );
  console.log(
    `  score  min ${String(report.score.min)}  median ${String(report.score.median)}  ` +
      `mean ${String(report.score.mean)}  max ${String(report.score.max)}`
  );
  console.log(
    `  length median ${String(report.seconds.median)}s  max ${String(report.seconds.max)}s`
  );
}

await main();
