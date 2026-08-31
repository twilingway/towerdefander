import type { BatchCell, BatchReport, CellKey, WaveAggregate } from "@spaceship-defender/protocol";

/** One named series of numbers; every chart on this screen eats these. */
export interface Series {
  readonly label: string;
  readonly points: readonly number[];
}

export interface GroupedBars {
  readonly categories: readonly string[];
  readonly series: readonly Series[];
}

export const LEVEL_LABELS: Record<string, string> = {
  rookie: "Новичок",
  veteran: "Ветеран",
  ace: "Ас"
};

export function cellId(key: CellKey): string {
  return `${key.presetId}|${key.shipArchetypeId}|${key.level}|${String(key.enemyOffset)}|${String(key.crewSize)}`;
}

export function cellLabel(key: CellKey): string {
  return `${key.shipArchetypeId} · ${LEVEL_LABELS[key.level] ?? key.level} · сдвиг ${key.enemyOffset >= 0 ? "+" : ""}${String(key.enemyOffset)} · экипаж ${String(key.crewSize)}`;
}

function uniqueInOrder<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** Median reached wave, levels along the axis and crew sizes as the series. */
export function waveByLevel(report: BatchReport): GroupedBars {
  const levels = uniqueInOrder(report.cells.map(({ key }) => key.level));
  const crews = uniqueInOrder(report.cells.map(({ key }) => key.crewSize)).sort(
    (left, right) => left - right
  );
  return {
    categories: levels.map((level) => LEVEL_LABELS[level] ?? level),
    series: crews.map((crewSize) => ({
      label: `экипаж ${String(crewSize)}`,
      points: levels.map((level) =>
        medianOf(report, (key) => key.level === level && key.crewSize === crewSize)
      )
    }))
  };
}

/** Median reached wave against the enemy difficulty offset, one line per level. */
export function waveByOffset(report: BatchReport): GroupedBars {
  const offsets = uniqueInOrder(report.cells.map(({ key }) => key.enemyOffset)).sort(
    (left, right) => left - right
  );
  const levels = uniqueInOrder(report.cells.map(({ key }) => key.level));
  return {
    categories: offsets.map((offset) => `${offset >= 0 ? "+" : ""}${String(offset)}`),
    series: levels.map((level) => ({
      label: LEVEL_LABELS[level] ?? level,
      points: offsets.map((offset) =>
        medianOf(report, (key) => key.level === level && key.enemyOffset === offset)
      )
    }))
  };
}

function medianOf(report: BatchReport, matches: (key: CellKey) => boolean): number {
  const cells = report.cells.filter(({ key }) => matches(key));
  if (cells.length === 0) return 0;
  const values = cells.map((cell) => cell.wave.median).sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)] ?? 0;
}

/** Share of the cell's runs that reached each wave, as a percentage. */
export function reachShare(cell: BatchCell): { waves: number[]; share: number[] } {
  const waves = cell.waves.map(({ waveNumber }) => waveNumber);
  const total = cell.completedRuns === 0 ? 1 : cell.completedRuns;
  return {
    waves,
    share: cell.waves.map(({ runsReaching }) => Math.round((runsReaching / total) * 100))
  };
}

/** Hull destroyed, wave timeout and unfinished, stacked per selected cell. */
export function outcomeBars(cells: readonly BatchCell[]): GroupedBars {
  return {
    categories: cells.map((cell) => cellLabel(cell.key)),
    series: [
      { label: "Корпус разрушен", points: cells.map((cell) => cell.outcomes.spaceshipDestroyed) },
      { label: "Таймаут волны", points: cells.map((cell) => cell.outcomes.waveTimeout) },
      { label: "Не доиграно", points: cells.map((cell) => cell.outcomes.unfinished) }
    ]
  };
}

/** Damage dealt per barrel and damage taken per threat class, wave by wave. */
export function damageByWave(cell: BatchCell): GroupedBars {
  return {
    categories: cell.waves.map(({ waveNumber }) => String(waveNumber)),
    series: [
      { label: "Турель", points: cell.waves.map(({ stats }) => stats.damageDealtByCannon) },
      { label: "Нос", points: cell.waves.map(({ stats }) => stats.damageDealtByMachineGun) },
      { label: "Пули", points: cell.waves.map(({ stats }) => stats.damageTakenFromBullets) },
      { label: "Ракеты", points: cell.waves.map(({ stats }) => stats.damageTakenFromMissiles) },
      { label: "Астероиды", points: cell.waves.map(({ stats }) => stats.damageTakenFromAsteroids) }
    ]
  };
}

/** Hits over shots per barrel, in percent; zero shots reads as zero, not NaN. */
export function accuracyBars(cells: readonly BatchCell[]): GroupedBars {
  const share = (hits: number, shots: number) =>
    shots <= 0 ? 0 : Math.round((hits / shots) * 100);
  return {
    categories: cells.map((cell) => cellLabel(cell.key)),
    series: [
      {
        label: "Турель, %",
        points: cells.map(({ stats }) => share(stats.hitsByCannon, stats.shotsByCannon))
      },
      {
        label: "Нос, %",
        points: cells.map(({ stats }) => share(stats.hitsByMachineGun, stats.shotsByMachineGun))
      }
    ]
  };
}

/**
 * Credits earned against credits spent, wave by wave.
 *
 * Both are **means per run that reached the wave**, which is what makes the
 * spent line land on values below the fixed price of five: a wave where nine of
 * sixteen runs survived to the intermission and bought shows 9x5/16, not 5.
 * The table beside the chart carries the counts the mean is made of.
 */
export function economyByWave(cell: BatchCell): GroupedBars {
  return {
    categories: cell.waves.map(({ waveNumber }) => String(waveNumber)),
    series: [
      { label: "Заработано на прогон", points: cell.waves.map(({ stats }) => stats.creditsEarned) },
      { label: "Потрачено на прогон", points: cell.waves.map(({ stats }) => stats.creditsSpent) }
    ]
  };
}

export interface EconomyRow {
  readonly waveNumber: number;
  readonly reaching: number;
  readonly cleared: number;
  readonly bought: number;
  readonly spentPerRun: number;
  readonly earnedPerRun: number;
}

/** The counts behind the means, so a value under the price explains itself. */
export function economyRows(cell: BatchCell): EconomyRow[] {
  return cell.waves.map((wave) => ({
    waveNumber: wave.waveNumber,
    reaching: wave.runsReaching,
    cleared: wave.runsCleared,
    bought: wave.runsBought,
    spentPerRun: wave.stats.creditsSpent,
    earnedPerRun: wave.stats.creditsEarned
  }));
}

/** A build as one line: `gunner_damage ×2 + pilot_hull`. */
export function buildLabel(build: Readonly<Record<string, number>>): string {
  const parts = Object.entries(build)
    .sort(([, left], [, right]) => right - left)
    .map(([upgradeId, count]) => (count > 1 ? `${upgradeId} ×${String(count)}` : upgradeId));
  return parts.length === 0 ? "ничего не куплено" : parts.join(" + ");
}

/** Which upgrades the crew actually bought, most bought first. */
export function upgradeRows(cell: BatchCell): { upgradeId: string; count: number }[] {
  return Object.entries(cell.upgradesBought)
    .map(([upgradeId, count]) => ({ upgradeId, count }))
    .sort((left, right) => right.count - left.count);
}

/** Every archetype that appeared in a wave of this cell, in a stable order. */
export function compositionKinds(waves: readonly WaveAggregate[]): string[] {
  return [...new Set(waves.flatMap((wave) => Object.keys(wave.compositionByKind)))].sort();
}

export function compositionByWave(cell: BatchCell): GroupedBars {
  const kinds = compositionKinds(cell.waves);
  return {
    categories: cell.waves.map(({ waveNumber }) => String(waveNumber)),
    series: kinds.map((kind) => ({
      label: kind,
      points: cell.waves.map((wave) => wave.compositionByKind[kind] ?? 0)
    }))
  };
}

/** Boss waves the cell reached, and how often they were cleared. */
export function bossRows(cell: BatchCell): {
  waveNumber: number;
  reaching: number;
  cleared: number;
  kills: number;
}[] {
  return cell.waves
    .filter(({ bossWave }) => bossWave)
    .map(({ waveNumber, runsReaching, runsCleared, bossKills }) => ({
      waveNumber,
      reaching: runsReaching,
      cleared: runsCleared,
      kills: bossKills
    }));
}
