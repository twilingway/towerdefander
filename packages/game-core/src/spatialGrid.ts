import type { Vector2 } from "./spaceshipSimulation.ts";

export interface MovingEntity {
  readonly id: string;
  readonly spawnSequence: number;
  readonly previousX: number;
  readonly previousY: number;
  readonly x: number;
  readonly y: number;
  readonly velocity: Vector2;
  readonly radius: number;
  readonly spawnedTick: number;
}

export interface CollisionCandidate {
  readonly timeOfImpact: number;
  readonly sourceSequence: number;
  readonly targetSequence: number;
  readonly sourceId: string;
  readonly targetId: string;
  readonly targetKind: "enemy" | "asteroid" | "missile";
}

export function relativeSweptCircleTime(source: MovingEntity, target: MovingEntity): number | null {
  const startX = source.previousX - target.previousX;
  const startY = source.previousY - target.previousY;
  const endX = source.x - target.x;
  const endY = source.y - target.y;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const radius = source.radius + target.radius;
  const c = startX * startX + startY * startY - radius * radius;
  if (c <= 0) return 0;
  const a = deltaX * deltaX + deltaY * deltaY;
  if (a === 0) return null;
  const b = 2 * (startX * deltaX + startY * deltaY);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const first = (-b - root) / (2 * a);
  const second = (-b + root) / (2 * a);
  if (first >= 0 && first <= 1) return first;
  if (second >= 0 && second <= 1) return second;
  return null;
}

interface GridTarget extends MovingEntity {
  readonly kindForCollision: CollisionCandidate["targetKind"];
}

export type SpatialGrid = ReadonlyMap<string, readonly GridTarget[]>;

export function buildSpatialGrid(targets: readonly GridTarget[], cellSize: number): SpatialGrid {
  const grid = new Map<string, GridTarget[]>();
  for (const target of [...targets].sort((a, b) => a.spawnSequence - b.spawnSequence)) {
    const minimumX = Math.floor((Math.min(target.previousX, target.x) - target.radius) / cellSize);
    const maximumX = Math.floor((Math.max(target.previousX, target.x) + target.radius) / cellSize);
    const minimumY = Math.floor((Math.min(target.previousY, target.y) - target.radius) / cellSize);
    const maximumY = Math.floor((Math.max(target.previousY, target.y) + target.radius) / cellSize);
    for (let x = minimumX; x <= maximumX; x += 1) {
      for (let y = minimumY; y <= maximumY; y += 1) {
        const key = `${String(x)}:${String(y)}`;
        const bucket = grid.get(key) ?? [];
        bucket.push(target);
        grid.set(key, bucket);
      }
    }
  }
  return grid;
}

export function querySpatialGrid(
  grid: SpatialGrid,
  source: MovingEntity,
  cellSize: number
): readonly GridTarget[] {
  const minimumX = Math.floor((Math.min(source.previousX, source.x) - source.radius) / cellSize);
  const maximumX = Math.floor((Math.max(source.previousX, source.x) + source.radius) / cellSize);
  const minimumY = Math.floor((Math.min(source.previousY, source.y) - source.radius) / cellSize);
  const maximumY = Math.floor((Math.max(source.previousY, source.y) + source.radius) / cellSize);
  const unique = new Map<string, GridTarget>();
  for (let x = minimumX; x <= maximumX; x += 1) {
    for (let y = minimumY; y <= maximumY; y += 1) {
      for (const target of grid.get(`${String(x)}:${String(y)}`) ?? [])
        unique.set(target.id, target);
    }
  }
  return [...unique.values()].sort((a, b) => a.spawnSequence - b.spawnSequence);
}

export function compareCollision(a: CollisionCandidate, b: CollisionCandidate): number {
  return (
    a.timeOfImpact - b.timeOfImpact ||
    a.sourceSequence - b.sourceSequence ||
    a.targetSequence - b.targetSequence
  );
}
