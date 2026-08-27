import type { ArenaCircle } from "./arenaGeometry.ts";
import type { Vector2 } from "./spaceshipSimulation.ts";
import { type CombatConfig } from "./combatTypes.ts";

export function unitDirection(fromX: number, fromY: number, toX: number, toY: number): Vector2 {
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  const length = Math.hypot(deltaX, deltaY) || 1;
  return { x: deltaX / length, y: deltaY / length };
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function arenaFromConfig(config: CombatConfig): ArenaCircle {
  return {
    centerX: config.worldWidth / 2,
    centerY: config.worldHeight / 2,
    radius: config.arenaRadius
  };
}

export function pointOnCircle(
  arena: ArenaCircle,
  angle: number,
  radius: number
): { readonly x: number; readonly y: number } {
  return {
    x: arena.centerX + Math.cos(angle) * radius,
    y: arena.centerY + Math.sin(angle) * radius
  };
}
