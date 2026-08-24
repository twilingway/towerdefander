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
