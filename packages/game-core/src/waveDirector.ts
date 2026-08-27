import {
  type AsteroidState,
  type CombatConfig,
  type CombatEnemyState,
  type EnemyKind,
  type PendingSpawn,
  type SpawnKind,
  type WaveDefinition,
  type WaveDifficulty
} from "./combatTypes.ts";
import { SPAWN_DOMAIN } from "./combatConstants.ts";
import { deriveDomainSeed, nextUint32 } from "./rng.ts";
import { archetypeOf, enemyKindsOf } from "./combatValidation.ts";

export function getScriptedWave(config: CombatConfig, waveNumber: number): WaveDefinition | null {
  if (!Number.isSafeInteger(waveNumber) || waveNumber <= 0) return null;
  return config.waveCampaign.waves[waveNumber - 1] ?? null;
}

export function getWaveDifficulty(config: CombatConfig, waveNumber: number): WaveDifficulty {
  const director = config.waveCampaign.director;
  const waveOffset = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, waveNumber - 1));
  const scripted = getScriptedWave(config, waveNumber);
  return {
    budget: Math.min(director.budgetCap, director.baseBudget + director.budgetGrowth * waveOffset),
    hpMultiplier:
      scripted?.hpMultiplier ??
      Math.min(director.hpMultiplierCap, 1 + director.hpGrowth * waveOffset),
    tempoMultiplier:
      scripted?.tempoMultiplier ??
      Math.min(director.tempoMultiplierCap, 1 + director.tempoGrowth * waveOffset)
  };
}

export function createWavePlan(
  config: CombatConfig,
  runSeed: number,
  waveNumber: number
): { readonly plan: readonly PendingSpawn[]; readonly rngState: number } {
  const rngState = deriveDomainSeed(runSeed, waveNumber, SPAWN_DOMAIN);
  const scripted = getScriptedWave(config, waveNumber);
  if (scripted !== null) {
    return { plan: createScriptedWavePlan(scripted), rngState };
  }
  return createDirectedWavePlan(config, waveNumber, rngState);
}

export function createScriptedWavePlan(wave: WaveDefinition): readonly PendingSpawn[] {
  const plan: PendingSpawn[] = [];
  for (const entry of wave.entries) {
    for (let index = 0; index < entry.count; index += 1) {
      plan.push({
        kind: entry.kind,
        planSequence: plan.length,
        spawnIntervalTicks: entry.spawnIntervalTicks,
        sectors: entry.sectors,
        hpMultiplier: entry.hpMultiplier,
        tempoMultiplier: entry.tempoMultiplier
      });
    }
  }
  return plan;
}

export function findBossKindForWave(
  config: CombatConfig,
  waveNumber: number
): EnemyKind | undefined {
  const interval = config.waveCampaign.director.bossWaveInterval;
  if (interval === null || waveNumber % interval !== 0) return undefined;
  return enemyKindsOf(config).find((kind) => {
    const archetype = archetypeOf(config, kind);
    return archetype.spawnPolicy === "boss" && waveNumber >= archetype.unlockWave;
  });
}

/** A boss holds its slot until the rest of the wave is destroyed. */
export function waitsForClearedWave(config: CombatConfig, kind: SpawnKind): boolean {
  return kind !== "asteroid" && archetypeOf(config, kind).spawnPolicy === "boss";
}

export function hasLiveWaveThreats(
  enemies: readonly CombatEnemyState[],
  asteroids: readonly AsteroidState[]
): boolean {
  return enemies.length > 0 || asteroids.some(({ origin }) => origin === "wave");
}

export function createDirectedWavePlan(
  config: CombatConfig,
  waveNumber: number,
  initialRngState: number
): { readonly plan: readonly PendingSpawn[]; readonly rngState: number } {
  let remaining = getWaveDifficulty(config, waveNumber).budget;
  let rngState = initialRngState;
  const spawnCostOf = (kind: SpawnKind): number =>
    kind === "asteroid" ? config.asteroidSpawnCost : archetypeOf(config, kind).spawnCost;
  const available = enemyKindsOf(config)
    .filter((kind) => {
      const archetype = archetypeOf(config, kind);
      return archetype.spawnPolicy === "standard" && waveNumber >= archetype.unlockWave;
    })
    .sort((left, right) => spawnCostOf(right) - spawnCostOf(left) || left.localeCompare(right));
  const kinds: SpawnKind[] = [];
  const anchor = available[0];
  if (anchor !== undefined && remaining >= spawnCostOf(anchor)) {
    kinds.push(anchor);
    remaining -= spawnCostOf(anchor);
  }
  while (remaining > 0) {
    const [afterPick, pick] = nextUint32(rngState);
    const [afterChoice, choice] = nextUint32(afterPick);
    rngState = afterChoice;
    const affordable = available.filter((kind) => spawnCostOf(kind) <= remaining);
    const kind: SpawnKind =
      affordable.length === 0 || pick % 3 === 0
        ? "asteroid"
        : (affordable[choice % affordable.length] ?? "asteroid");
    kinds.push(kind);
    remaining -= spawnCostOf(kind);
  }
  for (let index = kinds.length - 1; index > 0; index -= 1) {
    const [next, random] = nextUint32(rngState);
    rngState = next;
    const swapIndex = random % (index + 1);
    const current = kinds[index];
    const swap = kinds[swapIndex];
    if (current !== undefined && swap !== undefined) {
      kinds[index] = swap;
      kinds[swapIndex] = current;
    }
  }
  // Appended after the shuffle so the boss always closes the wave.
  const boss = findBossKindForWave(config, waveNumber);
  if (boss !== undefined) {
    kinds.push(boss);
  }
  return {
    plan: kinds.map((kind, planSequence) => ({
      kind,
      planSequence,
      spawnIntervalTicks: config.enemySpawnIntervalTicks,
      sectors: [],
      hpMultiplier: null,
      tempoMultiplier: null
    })),
    rngState
  };
}
