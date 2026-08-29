import {
  SPAWN_SECTORS,
  type AsteroidState,
  type CombatConfig,
  type CombatEnemyState,
  type EnemyWeaponTuning,
  type HomingMissileState,
  type HostileProjectileState,
  type SpawnKind,
  type SpawnSector,
  type WaveDifficulty
} from "./combatTypes.ts";
import { AIM_DOMAIN, UINT32_MAX } from "./combatConstants.ts";
import { deriveDomainSeed, nextUint32 } from "./rng.ts";
import { arenaFromConfig, pointOnCircle, unitDirection } from "./combatMath.ts";
import { archetypeOf } from "./combatValidation.ts";
import { getWaveDifficulty } from "./waveDirector.ts";
import { canonicalizeAngle } from "./spaceshipSimulation.ts";
export function burstAimOffset(weapon: EnemyWeaponTuning, shot: number): number {
  if (weapon.burstCount <= 1) return 0;
  const step = weapon.burstSpreadRadians / (weapon.burstCount - 1);
  return -weapon.burstSpreadRadians / 2 + step * shot;
}

/** `target` is the point being aimed at, which is not always where the ship is. */
export function createHostileBullet(
  enemy: CombatEnemyState,
  target: { readonly x: number; readonly y: number },
  weapon: EnemyWeaponTuning,
  aimOffset: number,
  spawnSequence: number,
  tick: number
): HostileProjectileState {
  const heading = Math.atan2(target.y - enemy.y, target.x - enemy.x) + aimOffset;
  return {
    id: `hostile-${String(spawnSequence)}`,
    spawnSequence,
    previousX: enemy.x,
    previousY: enemy.y,
    x: enemy.x,
    y: enemy.y,
    velocity: {
      x: Math.cos(heading) * weapon.projectileSpeedPerSecond,
      y: Math.sin(heading) * weapon.projectileSpeedPerSecond
    },
    radius: weapon.projectileRadius,
    spawnedTick: tick,
    damage: weapon.damage,
    shieldHitCost: weapon.shieldHitCost,
    lifetimeTicks: weapon.projectileLifetimeTicks,
    visual: weapon.visual
  };
}

export function createMissile(
  enemy: CombatEnemyState,
  target: { readonly x: number; readonly y: number },
  weapon: EnemyWeaponTuning,
  aimOffset: number,
  spawnSequence: number,
  tick: number
): HomingMissileState {
  const heading = canonicalizeAngle(Math.atan2(target.y - enemy.y, target.x - enemy.x) + aimOffset);
  return {
    id: `missile-${String(spawnSequence)}`,
    spawnSequence,
    previousX: enemy.x,
    previousY: enemy.y,
    x: enemy.x,
    y: enemy.y,
    velocity: {
      x: Math.cos(heading) * weapon.projectileSpeedPerSecond,
      y: Math.sin(heading) * weapon.projectileSpeedPerSecond
    },
    radius: weapon.projectileRadius,
    spawnedTick: tick,
    heading,
    damage: weapon.damage,
    shieldHitCost: weapon.shieldHitCost,
    lifetimeTicks: weapon.projectileLifetimeTicks,
    speedPerSecond: weapon.projectileSpeedPerSecond,
    turnRatePerSecond: weapon.turnRatePerSecond,
    visual: weapon.visual
  };
}

export function sectorEntryAngle(
  sectors: readonly SpawnSector[],
  angleRandom: number,
  pickRandom: number
): number {
  if (sectors.length === 0) return angleRandom * Math.PI * 2;
  const pickedIndex = Math.min(sectors.length - 1, Math.floor(pickRandom * sectors.length));
  const sector = sectors[pickedIndex];
  if (sector === undefined) return angleRandom * Math.PI * 2;
  // Screen-space bearings: north points up, angles grow clockwise.
  const sectorWidth = Math.PI / 4;
  const sectorCenter = -Math.PI / 2 + SPAWN_SECTORS.indexOf(sector) * sectorWidth;
  return sectorCenter + (angleRandom - 0.5) * sectorWidth;
}

export function spawnEntity(
  kind: SpawnKind,
  origin: "wave" | "ambient",
  initialRngState: number,
  spawnSequence: number,
  tick: number,
  waveNumber: number,
  config: CombatConfig,
  sectors: readonly SpawnSector[],
  overrides: { readonly hpMultiplier: number | null; readonly tempoMultiplier: number | null }
): {
  readonly rngState: number;
  readonly enemy: CombatEnemyState | null;
  readonly asteroid: AsteroidState | null;
} {
  let rngState = initialRngState;
  const values: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const [next, random] = nextUint32(rngState);
    rngState = next;
    values.push(random / UINT32_MAX);
  }
  // values[2] was already drawn and unused, so multi-sector picking costs no extra RNG.
  const entryAngle = sectorEntryAngle(sectors, values[0] ?? 0, values[2] ?? 0);
  const arena = arenaFromConfig(config);
  const waveDifficulty = getWaveDifficulty(config, waveNumber);
  // A group may override the wave curve for itself only.
  const difficulty: WaveDifficulty = {
    budget: waveDifficulty.budget,
    hpMultiplier: overrides.hpMultiplier ?? waveDifficulty.hpMultiplier,
    tempoMultiplier: overrides.tempoMultiplier ?? waveDifficulty.tempoMultiplier
  };
  if (kind === "asteroid") {
    const point = pointOnCircle(arena, entryAngle, arena.radius);
    const exitOffset = ((values[1] ?? 0.5) * 2 - 1) * (Math.PI / 3);
    const target = pointOnCircle(arena, entryAngle + Math.PI + exitOffset, arena.radius);
    const direction = unitDirection(point.x, point.y, target.x, target.y);
    const hp = config.asteroidHp * difficulty.hpMultiplier;
    return {
      rngState,
      enemy: null,
      asteroid: {
        id: `asteroid-${String(spawnSequence)}`,
        spawnSequence,
        origin,
        previousX: point.x,
        previousY: point.y,
        x: point.x,
        y: point.y,
        velocity: {
          x: direction.x * config.asteroidSpeedPerSecond,
          y: direction.y * config.asteroidSpeedPerSecond
        },
        radius: config.asteroidRadius,
        spawnedTick: tick,
        hp,
        maxHp: hp,
        damage: config.asteroidDamage
      }
    };
  }
  const archetype = archetypeOf(config, kind);
  const entityRadius = archetype.radius;
  const point = pointOnCircle(arena, entryAngle, arena.radius - entityRadius);
  const hp = archetype.hp * difficulty.hpMultiplier;
  return {
    rngState,
    asteroid: null,
    enemy: {
      id: `${kind}-${String(spawnSequence)}`,
      spawnSequence,
      kind,
      previousX: point.x,
      previousY: point.y,
      x: point.x,
      y: point.y,
      velocity: { x: 0, y: 0 },
      heading: 0,
      angularVelocity: 0,
      orbitSign: spawnSequence % 2 === 0 ? 1 : -1,
      radius: entityRadius,
      spawnedTick: tick,
      hp,
      maxHp: hp,
      weaponCooldownTicks: archetype.weapons.map((weapon) =>
        Math.max(1, Math.ceil(weapon.cooldownTicks / difficulty.tempoMultiplier))
      ),
      // Never looked yet, so the first step refreshes whatever the reaction
      // window is — otherwise a slow archetype would steer at its own spawn
      // point for half a second after it arrives.
      perception: { tick: -1, x: point.x, y: point.y, velocityX: 0, velocityY: 0 },
      // Folded off the spawn stream rather than drawn from it, so adding the
      // spread did not shift every seeded spawn that came before it. The
      // sequence separates the enemies, so two spawned in one wave do not fire
      // the same errors.
      aimRngState: deriveDomainSeed(rngState, waveNumber, AIM_DOMAIN ^ spawnSequence)
    }
  };
}

export function canSpawnKind(
  config: CombatConfig,
  kind: SpawnKind,
  enemies: readonly CombatEnemyState[],
  asteroids: readonly AsteroidState[],
  workingDynamicCount: number
): boolean {
  if (workingDynamicCount >= config.caps.dynamicEntities) return false;
  return kind === "asteroid"
    ? asteroids.length < config.caps.asteroids
    : enemies.length < config.caps.enemyShips;
}

export function canAddEntity(
  config: CombatConfig,
  kind: "hostileProjectile" | "homingMissile",
  currentCount: number,
  workingDynamicCount: number
): boolean {
  if (workingDynamicCount >= config.caps.dynamicEntities) return false;
  return (
    currentCount <
    (kind === "hostileProjectile" ? config.caps.hostileProjectiles : config.caps.homingMissiles)
  );
}

export function scheduleAmbientAsteroid(
  rngState: number,
  currentEncounterTick: number,
  config: CombatConfig
): { readonly rngState: number; readonly dueTick: number } {
  const [nextState, random] = nextUint32(rngState);
  const intervalRange =
    config.ambientAsteroidIntervalMaxTicks - config.ambientAsteroidIntervalMinTicks + 1;
  const delay = config.ambientAsteroidIntervalMinTicks + (random % intervalRange);
  return {
    rngState: nextState,
    dueTick: currentEncounterTick + delay
  };
}
