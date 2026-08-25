import type { BalanceTuning, SpawnKind, WaveDefinition } from "@spaceship-defender/protocol";

const FIXED_STEP_MS = 50;

export interface WaveSummary {
  readonly waveNumber: number;
  readonly threatCount: number;
  readonly spawnCost: number;
  readonly directorBudget: number;
  readonly spawnSeconds: number;
  readonly overBudget: boolean;
}

export function spawnCostOf(tuning: BalanceTuning, kind: SpawnKind): number {
  return kind === "asteroid" ? tuning.asteroidSpawnCost : tuning.enemyArchetypes[kind].spawnCost;
}

/** Mirrors getWaveDifficulty in game-core so the console can show the same budget. */
export function directorBudgetAt(tuning: BalanceTuning, waveNumber: number): number {
  const director = tuning.waveCampaign.director;
  const offset = Math.max(0, waveNumber - 1);
  return Math.min(director.budgetCap, director.baseBudget + director.budgetGrowth * offset);
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
    spawnTicks += entry.spawnIntervalTicks * entry.count;
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
