import {
  ASTEROID_SPAWN_KIND,
  type BalanceTuning,
  type EnemyWeaponTuning,
  type WaveDefinition,
  type WaveSpawnEntry
} from "@spaceship-defender/protocol";

const FIXED_STEP_MS = 50;
/** One simulation step. Operators edit seconds; the preset stores ticks. */
export const TICK_SECONDS = FIXED_STEP_MS / 1000;

export function ticksToSeconds(ticks: number): number {
  return Number((ticks * TICK_SECONDS).toFixed(2));
}

/** Never rounds down to zero: a value has to survive as at least one tick. */
export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds / TICK_SECONDS));
}

/**
 * How far a shot from this weapon can travel before its lifetime runs out. A
 * homing missile spends part of that on turning, so its useful range is lower.
 * A beam has neither speed nor lifetime: it reaches exactly as far as the
 * distance the barrel opens fire at, inside the tick it fired.
 */
export function weaponReach(weapon: EnemyWeaponTuning): number {
  if (weapon.kind === "laser") return Math.round(weapon.engagementRange);
  return Math.round(
    weapon.projectileSpeedPerSecond * weapon.projectileLifetimeTicks * TICK_SECONDS
  );
}

export interface WaveSummary {
  readonly waveNumber: number;
  readonly threatCount: number;
  readonly spawnCost: number;
  readonly directorBudget: number;
  readonly spawnSeconds: number;
  readonly overBudget: boolean;
}

export function spawnCostOf(tuning: BalanceTuning, kind: string): number {
  if (kind === ASTEROID_SPAWN_KIND) return tuning.asteroidSpawnCost;
  return tuning.enemyArchetypes[kind]?.spawnCost ?? 0;
}

/** Mirrors getWaveDifficulty in game-core so the console can show the same budget. */
export function directorBudgetAt(tuning: BalanceTuning, waveNumber: number): number {
  const director = tuning.waveCampaign.director;
  const offset = Math.max(0, waveNumber - 1);
  return Math.min(director.budgetCap, director.baseBudget + director.budgetGrowth * offset);
}

/** Mirrors getWaveDifficulty so the console shows the numbers the run will use. */
export function waveMultipliers(
  tuning: BalanceTuning,
  waveNumber: number
): { readonly hp: number; readonly tempo: number } {
  const director = tuning.waveCampaign.director;
  const offset = Math.max(0, waveNumber - 1);
  const wave = tuning.waveCampaign.waves[waveNumber - 1];
  return {
    hp: wave?.hpMultiplier ?? Math.min(director.hpMultiplierCap, 1 + director.hpGrowth * offset),
    tempo:
      wave?.tempoMultiplier ??
      Math.min(director.tempoMultiplierCap, 1 + director.tempoGrowth * offset)
  };
}

export interface EntryStats {
  readonly hp: number;
  readonly hpMultiplier: number;
  readonly tempoMultiplier: number;
  readonly cooldownTicks: number | null;
  readonly damage: number | null;
}

/** What a single member of this group will actually be worth on that wave. */
export function entryStats(
  tuning: BalanceTuning,
  entry: WaveSpawnEntry,
  waveNumber: number
): EntryStats {
  const wave = waveMultipliers(tuning, waveNumber);
  const hpMultiplier = entry.hpMultiplier ?? wave.hp;
  const tempoMultiplier = entry.tempoMultiplier ?? wave.tempo;
  if (entry.kind === ASTEROID_SPAWN_KIND) {
    return {
      hp: tuning.asteroidHp * hpMultiplier,
      hpMultiplier,
      tempoMultiplier,
      cooldownTicks: null,
      damage: tuning.asteroidDamage
    };
  }
  const archetype = tuning.enemyArchetypes[entry.kind];
  const weapon = archetype?.weapons[0];
  return {
    hp: (archetype?.hp ?? 0) * hpMultiplier,
    hpMultiplier,
    tempoMultiplier,
    cooldownTicks:
      weapon === undefined ? null : Math.max(1, Math.ceil(weapon.cooldownTicks / tempoMultiplier)),
    damage: weapon?.damage ?? null
  };
}

export function summariseWave(
  tuning: BalanceTuning,
  wave: WaveDefinition,
  waveNumber: number
): WaveSummary {
  let threatCount = 0;
  let spawnCost = 0;
  let spawnTicks = 0;
  for (const entry of wave.entries) {
    threatCount += entry.count;
    spawnCost += spawnCostOf(tuning, entry.kind) * entry.count;
    // The wave is a schedule, so its length is the last arrival on it, not the
    // sum of every group's waits: two groups running side by side take as long
    // as the longer one.
    spawnTicks = Math.max(
      spawnTicks,
      entry.startDelayTicks + entry.spawnIntervalTicks * Math.max(0, entry.count - 1)
    );
  }
  const directorBudget = directorBudgetAt(tuning, waveNumber);
  return {
    waveNumber,
    threatCount,
    spawnCost,
    directorBudget,
    spawnSeconds: (spawnTicks * FIXED_STEP_MS) / 1000,
    overBudget: spawnCost > directorBudget
  };
}

export function summariseCampaign(tuning: BalanceTuning): readonly WaveSummary[] {
  return tuning.waveCampaign.waves.map((wave, index) => summariseWave(tuning, wave, index + 1));
}

export function unlockedKindsAt(tuning: BalanceTuning, waveNumber: number): readonly string[] {
  return Object.entries(tuning.enemyArchetypes)
    .filter(([, archetype]) => waveNumber >= archetype.unlockWave)
    .map(([kind]) => kind);
}
