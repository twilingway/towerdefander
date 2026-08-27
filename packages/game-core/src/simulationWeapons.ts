import type { FriendlyWeaponSource, ProjectileState, Vector2 } from "./spaceshipSimulation.ts";

/** Heat behaviour of one friendly barrel, read straight from the balance preset. */
export interface WeaponHeatTuning {
  readonly capacity: number;
  readonly perShot: number;
  readonly coolingPerSecond: number;
  readonly rearmThreshold: number;
}

export interface WeaponStep {
  /** The trigger is down, the barrel is cool enough and the cooldown has elapsed. */
  readonly eligible: boolean;
  /** False when the projectile cap leaves no room; the shot is lost, not queued. */
  readonly canSpawn: boolean;
  readonly origin: Vector2;
  readonly angle: number;
  readonly muzzleOffset: number;
  readonly speed: number;
  readonly damage: number;
  readonly radius: number;
  readonly source: FriendlyWeaponSource;
  readonly projectileSequence: number;
  readonly spawnSequence: number;
  readonly tick: number;
  readonly secondsPerStep: number;
  readonly heat: number;
  readonly overheated: boolean;
  readonly heatTuning: WeaponHeatTuning;
}

export interface WeaponOutcome {
  /** Null when nothing was fired this tick, either uneligible or out of room. */
  readonly projectile: ProjectileState | null;
  /** True when the trigger counted: the queue clears and the cooldown restarts. */
  readonly triggered: boolean;
  readonly heat: number;
  readonly overheated: boolean;
}

/**
 * One tick of a friendly weapon: spawn, heat, cooling and the overheat latch.
 * Cannon and machine gun differ only in the numbers they bring here, so a third
 * barrel is another call rather than another copy of this block.
 */
export function advanceFriendlyWeapon(step: WeaponStep): WeaponOutcome {
  const direction = { x: Math.cos(step.angle), y: Math.sin(step.angle) };
  let heat = step.heat;
  let projectile: ProjectileState | null = null;

  if (step.eligible && step.canSpawn) {
    const id = `projectile-${String(step.projectileSequence)}`;
    const muzzleX = step.origin.x + direction.x * step.muzzleOffset;
    const muzzleY = step.origin.y + direction.y * step.muzzleOffset;
    projectile = {
      id,
      projectileId: id,
      spawnSequence: step.spawnSequence,
      previousX: muzzleX,
      previousY: muzzleY,
      x: muzzleX,
      y: muzzleY,
      velocity: { x: direction.x * step.speed, y: direction.y * step.speed },
      radius: step.radius,
      damage: step.damage,
      spawnedTick: step.tick,
      source: step.source
    };
    heat = Math.min(step.heatTuning.capacity, heat + step.heatTuning.perShot);
  } else {
    heat = Math.max(0, heat - step.heatTuning.coolingPerSecond * step.secondsPerStep);
  }

  let overheated = step.overheated;
  if (!overheated && heat >= step.heatTuning.capacity) {
    overheated = true;
  } else if (overheated && heat <= step.heatTuning.rearmThreshold) {
    overheated = false;
  }

  return { projectile, triggered: step.eligible, heat, overheated };
}
