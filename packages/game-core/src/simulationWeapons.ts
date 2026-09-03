import type {
  FriendlyWeaponSource,
  ProjectileHoming,
  ProjectileState,
  Vector2
} from "./spaceshipSimulation.ts";
import type { FriendlyProjectileLike, FriendlyWeaponKind } from "./combatTypes.ts";

/** Heat behaviour of one friendly barrel, read straight from the balance preset. */
export interface WeaponHeatTuning {
  readonly capacity: number;
  readonly perShot: number;
  readonly coolingPerSecond: number;
  readonly rearmThreshold: number;
}

export interface WeaponStep {
  /** What this barrel fires: a bullet, a beam, or a shot that turns. */
  readonly kind: FriendlyWeaponKind;
  /** Laser only: how far the beam reaches and how thick it is for a hit. */
  readonly range: number;
  readonly beamRadius: number;
  /** Missile only: null when nothing was in the acquisition cone at launch. */
  readonly homing: ProjectileHoming | null;
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
  /** A laser pulse, resolved in this same tick and never stored as an entity. */
  readonly beam: FriendlyProjectileLike | null;
  /** True when the trigger counted: the queue clears and the cooldown restarts. */
  readonly triggered: boolean;
  readonly heat: number;
  readonly overheated: boolean;
}

/**
 * One tick of a friendly weapon: spawn, heat, cooling and the overheat latch.
 * The barrels differ only in the numbers and the kind they bring here, so a
 * third barrel is another call rather than another copy of this block.
 *
 * The kind decides only what is born on a firing tick. Heat, cooldown, the
 * overheat latch and the entity budget are the same for all three, which is
 * why a laser costs a shot's worth of heat without costing a shot's worth of
 * arena.
 */
export function advanceFriendlyWeapon(step: WeaponStep): WeaponOutcome {
  const direction = { x: Math.cos(step.angle), y: Math.sin(step.angle) };
  let heat = step.heat;
  let projectile: ProjectileState | null = null;
  let beam: FriendlyProjectileLike | null = null;
  // A beam needs no room in the projectile cap: it is gone by the end of the
  // tick that fired it.
  const fired = step.eligible && (step.kind === "laser" || step.canSpawn);

  if (fired) {
    const muzzleX = step.origin.x + direction.x * step.muzzleOffset;
    const muzzleY = step.origin.y + direction.y * step.muzzleOffset;
    if (step.kind === "laser") {
      beam = {
        id: `beam-${String(step.projectileSequence)}`,
        spawnSequence: step.spawnSequence,
        previousX: muzzleX,
        previousY: muzzleY,
        x: muzzleX + direction.x * step.range,
        y: muzzleY + direction.y * step.range,
        velocity: { x: 0, y: 0 },
        radius: step.beamRadius,
        damage: step.damage,
        spawnedTick: step.tick,
        source: step.source
      };
    } else {
      const id = `projectile-${String(step.projectileSequence)}`;
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
        source: step.source,
        homing: step.kind === "missile" ? step.homing : null
      };
    }
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

  return { projectile, beam, triggered: step.eligible, heat, overheated };
}
