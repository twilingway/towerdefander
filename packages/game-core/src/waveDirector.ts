import {
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

/**
 * A wave is a schedule, not a queue.
 *
 * Each group is laid out from its own start at its own interval, and the whole
 * list is then sorted by arrival. Written as a queue it played as blocks — every
 * interceptor, then every rock, then every gunship — because the order entries
 * happen to be written in decided who came first. Ties keep the authoring order,
 * so two groups due on the same tick stay deterministic.
 */
export function createScriptedWavePlan(wave: WaveDefinition): readonly PendingSpawn[] {
  const plan: PendingSpawn[] = [];
  for (const entry of wave.entries) {
    for (let index = 0; index < entry.count; index += 1) {
      plan.push({
        kind: entry.kind,
        planSequence: plan.length,
        dueTick: entry.startDelayTicks + index * entry.spawnIntervalTicks,
        sectors: entry.sectors,
        hpMultiplier: entry.hpMultiplier,
        tempoMultiplier: entry.tempoMultiplier
      });
    }
  }
  return [...plan].sort(
    (left, right) => left.dueTick - right.dueTick || left.planSequence - right.planSequence
  );
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

export function hasLiveWaveThreats(enemies: readonly CombatEnemyState[]): boolean {
  return enemies.length > 0;
}

/**
 * How many of the last authored waves the director may re-stage. Deep enough
 * that two waves running do not repeat, shallow enough that what it stages is
 * the end of the campaign rather than its opening.
 */
const DIRECTOR_TEMPLATE_DEPTH = 5;

function spawnCostIn(config: CombatConfig, kind: SpawnKind): number {
  return kind === "asteroid" ? config.asteroidSpawnCost : archetypeOf(config, kind).spawnCost;
}

/**
 * Past the last authored wave the director re-stages one of them rather than
 * inventing a wave of its own.
 *
 * Invented, it played as a dump: a shuffled bag of whatever the budget could
 * afford, every one of them arriving one spawn interval after the last, so a
 * late wave put forty ships and rocks on the field inside half a minute and
 * nothing about it read like the campaign the crew had just played. An authored
 * wave is a schedule - groups of one kind, each from its own sector, opening
 * every half minute, at a cadence that belongs to the family. All of that is
 * shape, and the shape is what the director was missing; the only thing it
 * needs to decide is how many, which is what its budget is for.
 */
function stagedWavePlan(
  config: CombatConfig,
  waveNumber: number,
  template: WaveDefinition
): readonly PendingSpawn[] {
  const kinds = new Set<SpawnKind>(["asteroid", ...enemyKindsOf(config)]);
  const staged = template.entries.filter(
    (entry) =>
      kinds.has(entry.kind) &&
      (entry.kind === "asteroid" || archetypeOf(config, entry.kind).spawnPolicy !== "boss")
  );
  const templateCost = staged.reduce(
    (total, entry) => total + entry.count * spawnCostIn(config, entry.kind),
    0
  );
  // The budget decides the size of the wave and nothing else. A template that
  // costs nothing - every group a rock - is staged as written.
  const scale = templateCost > 0 ? getWaveDifficulty(config, waveNumber).budget / templateCost : 1;
  const entries = staged.map((entry) => ({
    ...entry,
    count: Math.max(1, Math.round(entry.count * scale))
  }));
  // The boss is the director's own call, on its own interval, so the template's
  // boss is dropped above and this one added back - at the hour the campaign
  // gave it, which is a floor anyway: a boss waits for the field to clear.
  const boss = findBossKindForWave(config, waveNumber);
  if (boss !== undefined) {
    // Taken from the campaign at large, not from this template: only every
    // fifth authored wave carries a boss, and a template without one would put
    // this at the top of the wave instead of the half-hour the campaign gives
    // it. Read across the table, every staged boss keeps the campaign's hour.
    const authored = config.waveCampaign.waves
      .flatMap(({ entries }) => entries)
      .find(
        (entry) =>
          entry.kind !== "asteroid" && archetypeOf(config, entry.kind).spawnPolicy === "boss"
      );
    entries.push({
      kind: boss,
      count: 1,
      startDelayTicks: authored?.startDelayTicks ?? 0,
      spawnIntervalTicks: authored?.spawnIntervalTicks ?? 1,
      sectors: authored?.sectors ?? [],
      hpMultiplier: null,
      tempoMultiplier: null
    });
  }
  return createScriptedWavePlan({ ...template, entries });
}

export function createDirectedWavePlan(
  config: CombatConfig,
  waveNumber: number,
  initialRngState: number
): { readonly plan: readonly PendingSpawn[]; readonly rngState: number } {
  const authored = config.waveCampaign.waves;
  if (authored.length > 0) {
    const depth = Math.min(DIRECTOR_TEMPLATE_DEPTH, authored.length);
    const [rngState, choice] = nextUint32(initialRngState);
    const template = authored[authored.length - depth + (choice % depth)];
    if (template !== undefined) {
      return { plan: stagedWavePlan(config, waveNumber, template), rngState };
    }
  }
  return improviseWavePlan(config, waveNumber, initialRngState);
}

/**
 * What is left when there is no campaign to re-stage: a preset with an empty
 * wave table, which is how the built-in defaults ship. A bag of affordable
 * kinds, one arrival per spawn interval.
 */
function improviseWavePlan(
  config: CombatConfig,
  waveNumber: number,
  initialRngState: number
): { readonly plan: readonly PendingSpawn[]; readonly rngState: number } {
  let remaining = getWaveDifficulty(config, waveNumber).budget;
  let rngState = initialRngState;
  const spawnCostOf = (kind: SpawnKind): number => spawnCostIn(config, kind);
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
      // The director keeps its old cadence: one arrival per interval.
      dueTick: planSequence * config.enemySpawnIntervalTicks,
      sectors: [],
      hpMultiplier: null,
      tempoMultiplier: null
    })),
    rngState
  };
}
