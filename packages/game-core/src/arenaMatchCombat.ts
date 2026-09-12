import {
  type ArenaBeamState,
  type ArenaMatchConfig,
  type ArenaProjectileState,
  type ArenaShipIntent,
  type ArenaShipState
} from "./arenaMatchTypes.ts";
import { LASER_BEAM_TICKS } from "./collisions.ts";
import { relativeSweptCircleTime, type MovingEntity } from "./spatialGrid.ts";
import { shortestAngleDelta } from "./simulationMath.ts";
import { advanceFriendlyWeapon } from "./simulationWeapons.ts";

export interface ArenaFireResult {
  readonly ship: ArenaShipState;
  readonly projectiles: readonly ArenaProjectileState[];
  readonly beams: readonly ArenaBeamState[];
  readonly nextProjectileSequence: number;
}

/**
 * Both barrels of one hull for one tick.
 *
 * The heat, the cooldown and what is born on a firing tick all come from
 * `advanceFriendlyWeapon`, the same function the co-op ship fires through; only
 * the assembly is here. Two simplifications the prototype makes deliberately:
 * the muzzle sits on the hull rather than on the drawn turret mount, and the
 * barrel is not converged. Both cost aim accuracy at long range and neither
 * changes who can hit whom, so they wait until the mode is worth the polish.
 */
export function fireArenaWeapons(
  ship: ArenaShipState,
  intent: ArenaShipIntent,
  tick: number,
  projectileSequence: number,
  roomForProjectile: boolean,
  config: ArenaMatchConfig
): ArenaFireResult {
  const stats = ship.stats;
  const secondsPerStep = config.ship.fixedStepMs / 1000;
  const origin = { x: ship.spaceship.x, y: ship.spaceship.y };
  const projectiles: ArenaProjectileState[] = [];
  const beams: ArenaBeamState[] = [];
  let sequence = projectileSequence;

  const cannonEligible =
    ship.alive &&
    !ship.cannonOverheated &&
    intent.firing &&
    (ship.lastFiredTick === null || tick - ship.lastFiredTick >= stats.fireCooldownTicks);

  const cannonShot = advanceFriendlyWeapon({
    kind: ship.cannonKind,
    range: stats.cannonLaserRange,
    beamRadius: stats.laserBeamRadius,
    homing: null,
    eligible: cannonEligible,
    canSpawn: roomForProjectile,
    origin,
    angle: ship.turretAngle,
    muzzleOffset: stats.spaceshipRadius + stats.projectileRadius,
    speed: stats.projectileSpeedPerSecond,
    damage: stats.friendlyProjectileDamage,
    radius: stats.projectileRadius,
    source: "cannon",
    projectileSequence: sequence,
    spawnSequence: sequence,
    tick,
    secondsPerStep,
    heat: ship.cannonHeat,
    overheated: ship.cannonOverheated,
    heatTuning: {
      capacity: stats.cannonHeatCapacity,
      perShot: stats.cannonHeatPerShot,
      coolingPerSecond: stats.cannonCoolingPerSecond,
      rearmThreshold: stats.cannonRearmThreshold
    }
  });

  if (cannonShot.projectile !== null) {
    projectiles.push({ ...cannonShot.projectile, ownerShipId: ship.id });
    sequence += 1;
  }
  if (cannonShot.beam !== null) {
    beams.push(beamFrom(cannonShot.beam, ship.id, tick, sequence));
    sequence += 1;
  }

  const mgEligible =
    ship.alive &&
    !ship.mgOverheated &&
    intent.mgFiring &&
    (ship.lastMgFiredTick === null || tick - ship.lastMgFiredTick >= stats.mgFireCooldownTicks);

  const mgShot = advanceFriendlyWeapon({
    kind: ship.mgKind,
    range: stats.mgLaserRange,
    beamRadius: stats.laserBeamRadius,
    homing: null,
    eligible: mgEligible,
    canSpawn: roomForProjectile && projectiles.length === 0,
    origin,
    angle: ship.heading,
    muzzleOffset: stats.spaceshipRadius + stats.mgProjectileRadius,
    speed: stats.mgProjectileSpeedPerSecond,
    damage: stats.mgDamage,
    radius: stats.mgProjectileRadius,
    source: "machineGun",
    projectileSequence: sequence,
    spawnSequence: sequence,
    tick,
    secondsPerStep,
    heat: ship.mgHeat,
    overheated: ship.mgOverheated,
    heatTuning: {
      capacity: stats.mgHeatCapacity,
      perShot: stats.mgHeatPerShot,
      coolingPerSecond: stats.mgCoolingPerSecond,
      rearmThreshold: stats.mgRearmThreshold
    }
  });

  if (mgShot.projectile !== null) {
    projectiles.push({ ...mgShot.projectile, ownerShipId: ship.id });
    sequence += 1;
  }
  if (mgShot.beam !== null) {
    beams.push(beamFrom(mgShot.beam, ship.id, tick, sequence));
    sequence += 1;
  }

  return {
    ship: {
      ...ship,
      // Everything born this tick, counted for the display's muzzle flash.
      shotsFired: ship.shotsFired + projectiles.length + beams.length,
      cannonHeat: cannonShot.heat,
      cannonOverheated: cannonShot.overheated,
      lastFiredTick: cannonShot.triggered ? tick : ship.lastFiredTick,
      mgHeat: mgShot.heat,
      mgOverheated: mgShot.overheated,
      lastMgFiredTick: mgShot.triggered ? tick : ship.lastMgFiredTick
    },
    projectiles,
    beams,
    nextProjectileSequence: sequence
  };
}

function beamFrom(
  beam: { x: number; y: number; previousX: number; previousY: number; radius: number },
  ownerShipId: string,
  tick: number,
  sequence: number
): ArenaBeamState {
  return {
    id: `beam-${ownerShipId}-${String(sequence)}`,
    ownerShipId,
    previousX: beam.previousX,
    previousY: beam.previousY,
    x: beam.x,
    y: beam.y,
    radius: beam.radius,
    spawnedTick: tick
  };
}

export function expireArenaBeams(
  beams: readonly ArenaBeamState[],
  tick: number
): readonly ArenaBeamState[] {
  return beams.filter((beam) => tick - beam.spawnedTick < LASER_BEAM_TICKS);
}

/** Straight-line flight, then the two ways a shot leaves the match: age and the wall. */
export function moveArenaProjectiles(
  projectiles: readonly ArenaProjectileState[],
  tick: number,
  config: ArenaMatchConfig,
  centre: { readonly x: number; readonly y: number }
): readonly ArenaProjectileState[] {
  const secondsPerStep = config.ship.fixedStepMs / 1000;
  const lifetimeTicks = Math.max(
    1,
    Math.round(config.ship.projectileLifetimeMs / config.ship.fixedStepMs)
  );
  /*
   * The arena's own envelope, clipped to the world.
   *
   * A shot may outlive the disc by a padding, but never the world: positions
   * travel as coordinates inside a square, and one past its edge is refused by
   * the display contract - which is what it looked like when the screen froze
   * on its last good snapshot.
   */
  const envelope = Math.min(
    config.arenaRadius + config.ship.worldPadding,
    Math.min(config.ship.worldWidth, config.ship.worldHeight) / 2
  );

  const moved: ArenaProjectileState[] = [];
  for (const projectile of projectiles) {
    if (tick - projectile.spawnedTick >= lifetimeTicks) continue;
    const x = projectile.x + projectile.velocity.x * secondsPerStep;
    const y = projectile.y + projectile.velocity.y * secondsPerStep;
    if (Math.hypot(x - centre.x, y - centre.y) > envelope) continue;
    moved.push({ ...projectile, previousX: projectile.x, previousY: projectile.y, x, y });
  }
  return moved;
}

export interface ArenaHitResolution {
  readonly ships: readonly ArenaShipState[];
  readonly projectiles: readonly ArenaProjectileState[];
}

/**
 * Every shot against every hull that is not its owner.
 *
 * The sweep is the same `relativeSweptCircleTime` the co-op uses, so a fast
 * shell cannot tunnel through a hull between two ticks. The shield check is a
 * local copy rather than `isInsideShieldArc`, which is bound to the co-op step
 * state; the arithmetic is the same three lines, and reaching into the co-op
 * shape from here would tie the two simulations together for no gain.
 */
export function resolveArenaHits(
  ships: readonly ArenaShipState[],
  projectiles: readonly ArenaProjectileState[],
  config: ArenaMatchConfig
): ArenaHitResolution {
  const damage = new Map<string, number>();
  const shieldSpend = new Map<string, number>();
  const killedBy = new Map<string, string>();
  const spent = new Set<string>();

  for (const projectile of projectiles) {
    let bestTime: number | null = null;
    let bestShip: ArenaShipState | null = null;

    for (const ship of ships) {
      if (!ship.alive || ship.id === projectile.ownerShipId) continue;
      const time = relativeSweptCircleTime(
        projectileEntity(projectile),
        shipEntity(ship, config.ship.spaceshipRadius)
      );
      if (time === null) continue;
      if (bestTime === null || time < bestTime) {
        bestTime = time;
        bestShip = ship;
      }
    }

    if (bestShip === null || bestTime === null) continue;
    spent.add(projectile.id);

    if (blockedByShield(projectile, bestTime, bestShip)) {
      shieldSpend.set(bestShip.id, (shieldSpend.get(bestShip.id) ?? 0) + projectile.damage);
      continue;
    }

    const total = (damage.get(bestShip.id) ?? 0) + projectile.damage;
    damage.set(bestShip.id, total);
    if (total >= bestShip.hp && !killedBy.has(bestShip.id)) {
      killedBy.set(bestShip.id, projectile.ownerShipId);
    }
  }

  if (spent.size === 0) return { ships, projectiles };

  const nextShips = ships.map((ship) => {
    const taken = damage.get(ship.id) ?? 0;
    const drained = shieldSpend.get(ship.id) ?? 0;
    if (taken === 0 && drained === 0) return ship;
    const hp = Math.max(0, ship.hp - taken);
    return {
      ...ship,
      hp,
      shieldEnergy: Math.max(0, ship.shieldEnergy - drained),
      alive: hp > 0,
      eliminatedBy: hp > 0 ? ship.eliminatedBy : (killedBy.get(ship.id) ?? ship.eliminatedBy)
    };
  });

  return {
    ships: nextShips,
    projectiles: projectiles.filter((projectile) => !spent.has(projectile.id))
  };
}

function blockedByShield(
  projectile: ArenaProjectileState,
  timeOfImpact: number,
  ship: ArenaShipState
): boolean {
  if (!ship.shieldActive) return false;
  const hitX = projectile.previousX + (projectile.x - projectile.previousX) * timeOfImpact;
  const hitY = projectile.previousY + (projectile.y - projectile.previousY) * timeOfImpact;
  const bearing = Math.atan2(hitY - ship.spaceship.y, hitX - ship.spaceship.x);
  return Math.abs(shortestAngleDelta(ship.shieldAngle, bearing)) <= ship.stats.shieldArcRadians / 2;
}

function projectileEntity(projectile: ArenaProjectileState): MovingEntity {
  return {
    id: projectile.id,
    spawnSequence: projectile.spawnSequence,
    previousX: projectile.previousX,
    previousY: projectile.previousY,
    x: projectile.x,
    y: projectile.y,
    velocity: projectile.velocity,
    radius: projectile.radius,
    spawnedTick: projectile.spawnedTick
  };
}

function shipEntity(ship: ArenaShipState, fallbackRadius: number): MovingEntity {
  return {
    id: ship.id,
    spawnSequence: ship.slot,
    previousX: ship.spaceship.previousX ?? ship.spaceship.x,
    previousY: ship.spaceship.previousY ?? ship.spaceship.y,
    x: ship.spaceship.x,
    y: ship.spaceship.y,
    velocity: ship.spaceship.velocity,
    radius: ship.stats.spaceshipRadius || fallbackRadius,
    spawnedTick: 0
  };
}
