import type { BalanceTuning } from "@spaceship-defender/protocol";

export function usageOf(tuning: BalanceTuning, kind: string): readonly number[] {
  return tuning.waveCampaign.waves
    .map((wave, index) => (wave.entries.some((entry) => entry.kind === kind) ? index + 1 : 0))
    .filter((waveNumber) => waveNumber > 0);
}

export function nextArchetypeId(tuning: BalanceTuning, base: string): string {
  const seed = base.length > 0 ? base : "enemy";
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${seed}${String(suffix)}`;
    if (!Object.hasOwn(tuning.enemyArchetypes, candidate)) return candidate;
  }
  return `${seed}${String(Date.now())}`;
}
