import {
  type CombatConfig,
  type CombatEnemyState,
  type CombatStepState,
  type HomingMissileState
} from "./combatTypes.ts";
import {
  ENEMY_ORBIT_SHARE,
  ENEMY_RANGE_BAND,
  ENEMY_RIM_START,
  ENEMY_STALL_SPEED_FRACTION
} from "./combatConstants.ts";
import { arenaFromConfig, clamp } from "./combatMath.ts";
import { type MovingEntity } from "./spatialGrid.ts";
import { archetypeOf } from "./combatValidation.ts";
import { getWaveDifficulty, hasLiveWaveThreats, waitsForClearedWave } from "./waveDirector.ts";
import {
  burstAimOffset,
  canAddEntity,
  canSpawnKind,
  createHostileBullet,
  createMissile,
  scheduleAmbientAsteroid,
  spawnEntity
} from "./spawning.ts";
import { constrainMovingCircleToArena, type ConstrainedMovingCircle } from "./arenaGeometry.ts";
import {
  advanceAngularTraverse,
  canonicalizeAngle,
  shortestAngleDelta
} from "./spaceshipSimulation.ts";
export function moveAndSpawnThreats(
  state: CombatStepState,
  config: CombatConfig,
  secondsPerStep: number
): CombatStepState {
  const difficulty = getWaveDifficulty(config, state.waveNumber);
  let enemies = state.enemies.map((enemy) =>
    moveEnemy(enemy, state.spaceship, config, secondsPerStep)
  );
  let asteroids = state.asteroids.map((asteroid) => moveLinear(asteroid, secondsPerStep));
  let hostileProjectiles = state.hostileProjectiles.map((projectile) =>
    moveLinear(projectile, secondsPerStep)
  );
  let homingMissiles = state.homingMissiles.map((missile) =>
    moveMissile(missile, state.spaceship, secondsPerStep)
  );
  let nextSpawnSequence = state.nextSpawnSequence;
  let workingDynamicCount =
    enemies.length +
    asteroids.length +
    hostileProjectiles.length +
    homingMissiles.length +
    state.projectiles.length;

  // A weapon that held its fire keeps its charge, so it shoots on the first
  // tick the spaceship enters its range instead of waiting out a cooldown.
  const firedWeapons = new Set<string>();
  for (const enemy of enemies) {
    const weapons = archetypeOf(config, enemy.kind).weapons;
    const distanceToSpaceship = Math.hypot(
      state.spaceship.x - enemy.x,
      state.spaceship.y - enemy.y
    );
    weapons.forEach((weapon, weaponIndex) => {
      if ((enemy.weaponCooldownTicks[weaponIndex] ?? 0) > 0) return;
      if (distanceToSpaceship > weapon.engagementRange) return;
      firedWeapons.add(`${enemy.id}:${String(weaponIndex)}`);
      for (let shot = 0; shot < weapon.burstCount; shot += 1) {
        const aimOffset = burstAimOffset(weapon, shot);
        if (weapon.kind === "bullet") {
          if (
            !canAddEntity(
              config,
              "hostileProjectile",
              hostileProjectiles.length,
              workingDynamicCount
            )
          ) {
            break;
          }
          hostileProjectiles = [
            ...hostileProjectiles,
            createHostileBullet(
              enemy,
              state.spaceship,
              weapon,
              aimOffset,
              nextSpawnSequence,
              state.clock.tick
            )
          ];
        } else {
          if (!canAddEntity(config, "homingMissile", homingMissiles.length, workingDynamicCount)) {
            break;
          }
          homingMissiles = [
            ...homingMissiles,
            createMissile(
              enemy,
              state.spaceship,
              weapon,
              aimOffset,
              nextSpawnSequence,
              state.clock.tick
            )
          ];
        }
        nextSpawnSequence += 1;
        workingDynamicCount += 1;
      }
    });
  }
  enemies = enemies.map((enemy) => ({
    ...enemy,
    weaponCooldownTicks: archetypeOf(config, enemy.kind).weapons.map((weapon, weaponIndex) => {
      const remaining = enemy.weaponCooldownTicks[weaponIndex] ?? 0;
      if (remaining > 0) return remaining;
      if (!firedWeapons.has(`${enemy.id}:${String(weaponIndex)}`)) return remaining;
      return Math.max(1, Math.ceil(weapon.cooldownTicks / difficulty.tempoMultiplier));
    })
  }));

  let pendingSpawns = state.pendingSpawns;
  let spawnRngState = state.spawnRngState;
  let nextWaveSpawnTick = state.nextWaveSpawnTick;
  if (pendingSpawns.length > 0 && state.encounterTick >= nextWaveSpawnTick) {
    const pending = pendingSpawns[0];
    if (
      pending !== undefined &&
      canSpawnKind(config, pending.kind, enemies, asteroids, workingDynamicCount) &&
      !(waitsForClearedWave(config, pending.kind) && hasLiveWaveThreats(enemies, asteroids))
    ) {
      const result = spawnEntity(
        pending.kind,
        "wave",
        spawnRngState,
        nextSpawnSequence,
        state.clock.tick,
        state.waveNumber,
        config,
        pending.sectors,
        { hpMultiplier: pending.hpMultiplier, tempoMultiplier: pending.tempoMultiplier }
      );
      spawnRngState = result.rngState;
      nextSpawnSequence += 1;
      pendingSpawns = pendingSpawns.slice(1);
      nextWaveSpawnTick = state.encounterTick + pending.spawnIntervalTicks;
      if (result.enemy !== null) enemies = [...enemies, result.enemy];
      if (result.asteroid !== null) asteroids = [...asteroids, result.asteroid];
      workingDynamicCount += 1;
    }
  }

  let ambientAsteroidRngState = state.ambientAsteroidRngState;
  let ambientAsteroidSpawnDueTick = state.ambientAsteroidSpawnDueTick;
  if (
    ambientAsteroidSpawnDueTick !== null &&
    state.encounterTick + 1 >= ambientAsteroidSpawnDueTick &&
    canSpawnKind(config, "asteroid", enemies, asteroids, workingDynamicCount)
  ) {
    const result = spawnEntity(
      "asteroid",
      "ambient",
      ambientAsteroidRngState,
      nextSpawnSequence,
      state.clock.tick,
      state.waveNumber,
      config,
      [],
      { hpMultiplier: null, tempoMultiplier: null }
    );
    ambientAsteroidRngState = result.rngState;
    nextSpawnSequence += 1;
    if (result.asteroid !== null) asteroids = [...asteroids, result.asteroid];
    const schedule = scheduleAmbientAsteroid(
      ambientAsteroidRngState,
      state.encounterTick + 1,
      config
    );
    ambientAsteroidRngState = schedule.rngState;
    ambientAsteroidSpawnDueTick = schedule.dueTick;
  }

  return {
    ...state,
    enemies,
    asteroids,
    hostileProjectiles,
    homingMissiles,
    pendingSpawns,
    spawnRngState,
    nextWaveSpawnTick,
    ambientAsteroidRngState,
    ambientAsteroidSpawnDueTick,
    nextSpawnSequence
  };
}

export function moveEnemy(
  enemy: CombatEnemyState,
  spaceship: { readonly x: number; readonly y: number },
  config: CombatConfig,
  secondsPerStep: number
): CombatEnemyState {
  const deltaX = spaceship.x - enemy.x;
  const deltaY = spaceship.y - enemy.y;
  const distance = Math.hypot(deltaX, deltaY) || 1;
  const archetype = archetypeOf(config, enemy.kind);
  const preferred = archetype.preferredDistance;
  const speed = archetype.speedPerSecond;
  // Closing and circling blend by how far off the preferred range the ship is.
  // A hard switch at a threshold made the direction jump ninety degrees, and
  // since circling widens the range it pushed the ship straight back across the
  // line — a limit cycle that read as an enemy twitching on the spot.
  const radial = clamp((distance - preferred) / ENEMY_RANGE_BAND, -1, 1);
  // Backing away at the rim is a move the arena deletes whole: the outward
  // component is the entire vector, so the enemy used to stand still against
  // the wall for as long as the ship stayed inside its comfort ring. Fade the
  // retreat as the wall closes in and hand the freed speed to the circling
  // term, so a cornered enemy slides along the rim instead of pressing into it.
  const arena = arenaFromConfig(config);
  const legalRadius = Math.max(1, arena.radius - enemy.radius);
  const rimShare = clamp(
    (Math.hypot(enemy.x - arena.centerX, enemy.y - arena.centerY) / legalRadius - ENEMY_RIM_START) /
      (1 - ENEMY_RIM_START),
    0,
    1
  );
  const closing = radial < 0 ? radial * (1 - rimShare) : radial;
  const orbit = (ENEMY_ORBIT_SHARE + (1 - ENEMY_ORBIT_SHARE) * rimShare) * (1 - Math.abs(closing));
  const courseFor = (sign: number): ConstrainedMovingCircle => {
    const velocity = {
      x: ((deltaX / distance) * closing - (deltaY / distance) * orbit * sign) * speed,
      y: ((deltaY / distance) * closing + (deltaX / distance) * orbit * sign) * speed
    };
    return constrainMovingCircleToArena(
      {
        x: enemy.x + velocity.x * secondsPerStep,
        y: enemy.y + velocity.y * secondsPerStep,
        radius: enemy.radius,
        velocity
      },
      arena
    );
  };
  // The wall can eat only one of the two circling directions, because it takes
  // the outward component and the reversed course points the other way. So a
  // pinned enemy reverses once and is free, rather than being nudged forever.
  let orbitSign = enemy.orbitSign;
  let constrained = courseFor(orbitSign);
  const constrainedSpeed = Math.hypot(constrained.velocity.x, constrained.velocity.y);
  if (constrainedSpeed < speed * ENEMY_STALL_SPEED_FRACTION) {
    const reversed = courseFor(-orbitSign);
    if (Math.hypot(reversed.velocity.x, reversed.velocity.y) > constrainedSpeed) {
      orbitSign = -orbitSign;
      constrained = reversed;
    }
  }
  const stalled = constrained.velocity.x === 0 && constrained.velocity.y === 0;
  const traverse = advanceAngularTraverse(
    {
      angle: enemy.heading,
      // Stalled against the arena wall it holds its bearing and lets the spin
      // bleed off, rather than snapping to a course it is not travelling.
      targetAngle: stalled ? null : Math.atan2(constrained.velocity.y, constrained.velocity.x),
      angularVelocity: enemy.angularVelocity
    },
    {
      maxAngularSpeed: archetype.turnRatePerSecond,
      angularAcceleration: archetype.turnAccelerationPerSecondSquared,
      angularBraking: archetype.turnBrakingPerSecondSquared,
      secondsPerStep
    }
  );
  return {
    ...enemy,
    previousX: enemy.x,
    previousY: enemy.y,
    x: constrained.x,
    y: constrained.y,
    velocity: constrained.velocity,
    heading: traverse.angle,
    angularVelocity: traverse.angularVelocity,
    orbitSign,
    weaponCooldownTicks: enemy.weaponCooldownTicks.map((ticks) => Math.max(0, ticks - 1))
  };
}

export function moveLinear<T extends MovingEntity>(entity: T, secondsPerStep: number): T {
  return {
    ...entity,
    previousX: entity.x,
    previousY: entity.y,
    x: entity.x + entity.velocity.x * secondsPerStep,
    y: entity.y + entity.velocity.y * secondsPerStep
  };
}

export function moveMissile(
  missile: HomingMissileState,
  spaceship: { readonly x: number; readonly y: number },
  secondsPerStep: number
): HomingMissileState {
  const targetHeading = Math.atan2(spaceship.y - missile.y, spaceship.x - missile.x);
  const turn = clamp(
    shortestAngleDelta(missile.heading, targetHeading),
    -missile.turnRatePerSecond * secondsPerStep,
    missile.turnRatePerSecond * secondsPerStep
  );
  const heading = canonicalizeAngle(missile.heading + turn);
  const velocity = {
    x: Math.cos(heading) * missile.speedPerSecond,
    y: Math.sin(heading) * missile.speedPerSecond
  };
  return {
    ...missile,
    previousX: missile.x,
    previousY: missile.y,
    x: missile.x + velocity.x * secondsPerStep,
    y: missile.y + velocity.y * secondsPerStep,
    heading,
    velocity
  };
}
