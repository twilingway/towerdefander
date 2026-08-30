/**
 * Folds the runs of one matrix cell into the shape the console charts read.
 *
 * Cell totals are sums across the cell; per-wave figures are means per run that
 * reached the wave, so waves stay comparable to each other however many runs
 * got there.
 */
import { summarise } from "./balance-run.mjs";

const RUN_STAT_KEYS = [
  "shotsByCannon",
  "shotsByMachineGun",
  "hitsByCannon",
  "hitsByMachineGun",
  "damageDealtByCannon",
  "damageDealtByMachineGun",
  "damageTakenFromBullets",
  "damageTakenFromMissiles",
  "damageTakenFromAsteroids",
  "shieldBlocks",
  "shieldEnergySpentOnBlocks",
  "shieldOverdrawnHits",
  "creditsEarned",
  "creditsSpent",
  "asteroidsDestroyed"
];

const round = (value) => Number(value.toFixed(2));

function zeroStats() {
  return Object.fromEntries(RUN_STAT_KEYS.map((key) => [key, 0]));
}

function addStats(target, source) {
  for (const key of RUN_STAT_KEYS) target[key] += source?.[key] ?? 0;
  return target;
}

function scaleStats(stats, divisor) {
  const safe = divisor > 0 ? divisor : 1;
  return Object.fromEntries(RUN_STAT_KEYS.map((key) => [key, round(stats[key] / safe)]));
}

function addCounts(target, source) {
  for (const [key, value] of Object.entries(source ?? {})) {
    target[key] = (target[key] ?? 0) + value;
  }
  return target;
}

function meanCounts(counts, divisor) {
  const safe = divisor > 0 ? divisor : 1;
  return Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [key, round(value / safe)])
  );
}

function median(values) {
  if (values.length === 0) return 0;
  return round(summarise(values).median);
}

function aggregateWaves(runs) {
  const byWave = new Map();
  for (const run of runs) {
    for (const wave of run.waves) {
      const entry = byWave.get(wave.waveNumber) ?? {
        waveNumber: wave.waveNumber,
        runsReaching: 0,
        runsCleared: 0,
        bossWave: false,
        bossKills: 0,
        seconds: [],
        hpEnd: [],
        killsByKind: {},
        compositionByKind: {},
        stats: zeroStats()
      };
      entry.runsReaching += 1;
      if (wave.cleared) entry.runsCleared += 1;
      entry.bossWave ||= wave.bossWave;
      entry.bossKills += wave.bossKills;
      entry.seconds.push(wave.seconds ?? 0);
      entry.hpEnd.push(wave.hpEnd);
      addCounts(entry.killsByKind, wave.killsByKind);
      addCounts(entry.compositionByKind, wave.composition);
      addStats(entry.stats, wave.stats);
      byWave.set(wave.waveNumber, entry);
    }
  }
  return [...byWave.values()]
    .sort((left, right) => left.waveNumber - right.waveNumber)
    .map((entry) => ({
      waveNumber: entry.waveNumber,
      runsReaching: entry.runsReaching,
      runsCleared: entry.runsCleared,
      bossWave: entry.bossWave,
      bossKills: round(entry.bossKills / entry.runsReaching),
      medianSeconds: median(entry.seconds),
      medianHpEnd: median(entry.hpEnd),
      killsByKind: meanCounts(entry.killsByKind, entry.runsReaching),
      compositionByKind: meanCounts(entry.compositionByKind, entry.runsReaching),
      stats: scaleStats(entry.stats, entry.runsReaching)
    }));
}

/** What one run ended up flying: how many of each upgrade it managed to buy. */
export function buildOf(run) {
  const build = {};
  for (const upgrade of run.upgrades) {
    build[upgrade.upgradeId] = (build[upgrade.upgradeId] ?? 0) + 1;
  }
  return build;
}

function buildKey(build) {
  const entries = Object.entries(build).sort(([left], [right]) => left.localeCompare(right));
  return entries.length === 0
    ? ""
    : entries.map(([id, count]) => `${id}x${String(count)}`).join("+");
}

/**
 * Runs grouped by the build they flew, best result first.
 *
 * Draws are seeded per wave, so with enough seeds most builds are unique and
 * carry one run each. `runs` is therefore part of the answer, not decoration:
 * a build with one run is an anecdote, and the table says so by showing it.
 */
export function aggregateBuilds(runs) {
  const byKey = new Map();
  for (const run of runs) {
    const build = buildOf(run);
    const key = buildKey(build);
    const entry = byKey.get(key) ?? { key, build, waves: [], scores: [] };
    entry.waves.push(run.wave);
    entry.scores.push(run.score);
    byKey.set(key, entry);
  }
  return [...byKey.values()]
    .map((entry) => ({
      key: entry.key,
      build: entry.build,
      runs: entry.waves.length,
      medianWave: median(entry.waves),
      bestWave: Math.max(...entry.waves),
      medianScore: median(entry.scores)
    }))
    .sort(
      (left, right) => right.medianWave - left.medianWave || right.medianScore - left.medianScore
    )
    .slice(0, 24);
}

/**
 * Per upgrade: how far the runs that bought it got, against the runs that did
 * not. Blunter than the build table and far less prone to reading noise, since
 * every run lands in exactly one of the two columns.
 */
export function aggregateUpgradeImpact(runs) {
  const ids = [...new Set(runs.flatMap((run) => run.upgrades.map(({ upgradeId }) => upgradeId)))];
  return ids
    .map((upgradeId) => {
      const withIt = runs.filter((run) => buildOf(run)[upgradeId] !== undefined);
      const without = runs.filter((run) => buildOf(run)[upgradeId] === undefined);
      return {
        upgradeId,
        bought: withIt.reduce((sum, run) => sum + (buildOf(run)[upgradeId] ?? 0), 0),
        runsWith: withIt.length,
        medianWaveWith: median(withIt.map(({ wave }) => wave)),
        runsWithout: without.length,
        medianWaveWithout: median(without.map(({ wave }) => wave))
      };
    })
    .sort((left, right) => right.medianWaveWith - left.medianWaveWith);
}

export function aggregateCell(key, runs) {
  const stats = zeroStats();
  const upgradesBought = {};
  let splitVotes = 0;
  let bossKills = 0;
  let bossWavesCleared = 0;
  const outcomes = { spaceshipDestroyed: 0, waveTimeout: 0, unfinished: 0 };

  for (const run of runs) {
    addStats(stats, run.stats);
    for (const upgrade of run.upgrades) {
      upgradesBought[upgrade.upgradeId] = (upgradesBought[upgrade.upgradeId] ?? 0) + 1;
      const voted = Object.values(upgrade.votes);
      if (new Set(voted).size > 1) splitVotes += 1;
    }
    for (const wave of run.waves) {
      bossKills += wave.bossKills;
      if (wave.bossWave && wave.cleared) bossWavesCleared += 1;
    }
    if (run.outcome === "unfinished") outcomes.unfinished += 1;
    else if (run.defeatReason === "wave_timeout") outcomes.waveTimeout += 1;
    else outcomes.spaceshipDestroyed += 1;
  }

  return {
    key,
    completedRuns: runs.length,
    wave: summarise(runs.map(({ wave }) => wave)),
    score: summarise(runs.map(({ score }) => score)),
    seconds: summarise(runs.map(({ seconds }) => seconds)),
    outcomes,
    bossWavesCleared,
    bossKills,
    stats: scaleStats(stats, 1),
    upgradesBought,
    splitVotes,
    builds: aggregateBuilds(runs),
    upgradeImpact: aggregateUpgradeImpact(runs),
    waves: aggregateWaves(runs),
    runs: runs.map((run) => ({
      seed: run.seed,
      wave: run.wave,
      score: run.score,
      seconds: run.seconds,
      upgrades: buildOf(run),
      outcome: run.outcome,
      defeatReason: run.defeatReason,
      bossKills: run.waves.reduce((sum, wave) => sum + wave.bossKills, 0)
    }))
  };
}
