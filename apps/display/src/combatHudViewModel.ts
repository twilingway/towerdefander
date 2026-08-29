import type { ShieldPhase } from "@spaceship-defender/protocol";

export interface RadarPoint {
  readonly x: number;
  readonly y: number;
}

export interface RadarProjection {
  readonly center: number;
  readonly radius: number;
  readonly scale: number;
}

export function getResourcePercent(value: number, capacity: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(capacity) || capacity <= 0) return 0;
  return Math.max(0, Math.min(100, (value / capacity) * 100));
}

export function createRadarProjection(
  arenaRadius: number,
  viewBoxSize = 200,
  padding = 12
): RadarProjection {
  const center = viewBoxSize / 2;
  const radius = Math.max(0, center - padding);
  const scale = Number.isFinite(arenaRadius) && arenaRadius > 0 ? radius / arenaRadius : 0;
  return { center, radius, scale };
}

export function projectWorldToRadar(
  worldX: number,
  worldY: number,
  worldWidth: number,
  worldHeight: number,
  projection: RadarProjection
): RadarPoint {
  return {
    x: projection.center + (worldX - worldWidth / 2) * projection.scale,
    y: projection.center + (worldY - worldHeight / 2) * projection.scale
  };
}

/**
 * A team upgrade is paid for at the end of one wave and applies to the next,
 * and the authoritative selection then stays put until another purchase
 * replaces it. Only the wave it actually paid for may present it as current.
 */
export function getCurrentWaveUpgrade<TSelection extends { readonly waveNumber: number }>(
  selection: TSelection | null,
  waveNumber: number
): TSelection | null {
  return selection !== null && selection.waveNumber + 1 === waveNumber ? selection : null;
}

/**
 * What the shield is doing, in the words the crew needs. The phase alone does
 * not explain a shield that is down: after a full drain it also has to be
 * re-armed, and both of those read as a dead button unless they are said out
 * loud. Raising is the one that matters most - a shield that is on its way up
 * looks broken to anyone who just pressed the key.
 */
export function getShieldStatusLabel(
  phase: ShieldPhase,
  rearmRequired: boolean,
  energy: number
): string {
  if (phase === "up") return "АКТИВЕН";
  if (phase === "raising") return "ПОДНИМАЕТСЯ";
  if (phase === "cooling") return "ОСТЫВАЕТ";
  if (rearmRequired) return "НУЖЕН ПЕРЕВЗВОД";
  if (energy <= 0) return "РАЗРЯЖЕН";
  return "выключен";
}
