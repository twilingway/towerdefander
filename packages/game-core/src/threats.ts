import {
  type CombatConfig,
  type CombatEnemyState,
  type CombatStepState,
  type FriendlyProjectileLike,
  type HomingMissileState
} from "./combatTypes.ts";
import {
  ENEMY_PRESS_SHARE,
  ENEMY_PRESS_TICKS,
  ENEMY_RIM_START,
  ENEMY_STALL_SPEED_FRACTION,
  UINT32_MAX
} from "./combatConstants.ts";
import {
  aimPoint,
  believedPosition,
  evasionPush,
  flankOrbitSign,
  perceiveSpaceship,
  resolveEnemySkill,
  separationPush,
  type ObservedSpaceship
} from "./enemySkill.ts";
import { nextUint32 } from "./rng.ts";
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
  // Neighbours are read at their pre-move positions for every enemy, so the
  // step does not depend on the order the wing happens to be stored in.
  const context: EnemyStepContext = {
    spaceship: state.spaceship,
    enemies: state.enemies,
    projectiles: state.projectiles,
    tick: state.clock.tick,
    secondsPerStep,
    stalemateTicks: state.stalemateTicks
  };
  let enemies = state.enemies.map((enemy) => moveEnemy(enemy, context, config));
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
  // Advanced only on a tick a barrel actually fires, so two runs of one seed
  // draw the same spread in the same order.
  const aimRngStates = new Map<string, number>();
  for (const enemy of enemies) {
    const archetype = archetypeOf(config, enemy.kind);
    const weapons = archetype.weapons;
    const profile = resolveEnemySkill(config.enemySkill, archetype.combatSkill);
    let aimRngState = enemy.aimRngState;
    const distanceToSpaceship = Math.hypot(
      state.spaceship.x - enemy.x,
      state.spaceship.y - enemy.y
    );
    weapons.forEach((weapon, weaponIndex) => {
      if ((enemy.weaponCooldownTicks[weaponIndex] ?? 0) > 0) return;
      // Range is a property of the barrel, so it is measured against the ship
      // itself; only where the shot is pointed comes from what the enemy believes.
      if (distanceToSpaceship > weapon.engagementRange) return;
      firedWeapons.add(`${enemy.id}:${String(weaponIndex)}`);
      const target = aimPoint(
        enemy,
        enemy.perception,
        profile,
        weapon.projectileSpeedPerSecond,
        state.clock.tick,
        secondsPerStep
      );
      for (let shot = 0; shot < weapon.burstCount; shot += 1) {
        const [nextAimState, random] = nextUint32(aimRngState);
        aimRngState = nextAimState;
        const jitter =
          profile.aimJitterRadians === 0
            ? 0
            : ((random / UINT32_MAX) * 2 - 1) * profile.aimJitterRadians;
        const aimOffset = burstAimOffset(weapon, shot) + jitter;
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
              target,
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
            createMissile(enemy, target, weapon, aimOffset, nextSpawnSequence, state.clock.tick)
          ];
        }
        nextSpawnSequence += 1;
        workingDynamicCount += 1;
      }
    });
    aimRngStates.set(enemy.id, aimRngState);
  }
  enemies = enemies.map((enemy) => ({
    ...enemy,
    aimRngState: aimRngStates.get(enemy.id) ?? enemy.aimRngState,
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

/** Everything an enemy is allowed to see when it decides on a course. */
export interface EnemyStepContext {
  readonly spaceship: ObservedSpaceship;
  readonly enemies: readonly CombatEnemyState[];
  readonly projectiles: readonly FriendlyProjectileLike[];
  readonly tick: number;
  readonly secondsPerStep: number;
  /** Ticks since either side last drew blood; see `ENEMY_PRESS_TICKS`. */
  readonly stalemateTicks: number;
}

export function moveEnemy(
  enemy: CombatEnemyState,
  context: EnemyStepContext,
  config: CombatConfig
): CombatEnemyState {
  const secondsPerStep = context.secondsPerStep;
  const archetype = archetypeOf(config, enemy.kind);
  const profile = resolveEnemySkill(config.enemySkill, archetype.combatSkill);
  const perception = perceiveSpaceship(
    enemy.perception,
    context.spaceship,
    profile,
    context.tick,
    secondsPerStep
  );
  // It steers at what it believes, not at the truth: that is the whole of the
  // difference a slow reaction makes.
  const believed = believedPosition(perception, context.tick, secondsPerStep);
  const deltaX = believed.x - enemy.x;
  const deltaY = believed.y - enemy.y;
  const distance = Math.hypot(deltaX, deltaY) || 1;
  // A hurt enemy fights from further out rather than dying in place.
  const retreating =
    profile.retreatHpFraction > 0 &&
    enemy.maxHp > 0 &&
    enemy.hp / enemy.maxHp < profile.retreatHpFraction;
  // A fight where nobody lands a hit is the one shape that never resolves on
  // its own, so the stand-off is given up as the silence drags on.
  const press = Math.min(1, context.stalemateTicks / ENEMY_PRESS_TICKS);
  const preferred =
    archetype.preferredDistance *
    (retreating ? profile.retreatStandoffFactor : 1) *
    (1 - press * ENEMY_PRESS_SHARE);
  const speed = archetype.speedPerSecond;
  // Closing and circling blend by how far off the preferred range the ship is.
  // A hard switch at a threshold made the direction jump ninety degrees, and
  // since circling widens the range it pushed the ship straight back across the
  // line — a limit cycle that read as an enemy twitching on the spot.
  const radial = clamp((distance - preferred) / profile.rangeBandUnits, -1, 1);
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
  const orbit =
    (profile.orbitShare + (1 - profile.orbitShare) * rimShare) * (1 - Math.abs(closing));
  const separation = separationPush(enemy, context.enemies);
  const evasion = evasionPush(enemy, context.projectiles, profile, secondsPerStep);
  const courseFor = (sign: number): ConstrainedMovingCircle => {
    const steerX = (deltaX / distance) * closing - (deltaY / distance) * orbit * sign;
    const steerY = (deltaY / distance) * closing + (deltaX / distance) * orbit * sign;
    let x = (steerX + separation.x * profile.separationWeight + evasion.x) * speed;
    let y = (steerY + separation.y * profile.separationWeight + evasion.y) * speed;
    // The pushes are added to the course, not on top of the speed limit: an
    // enemy dodging a shot must not outrun the archetype it belongs to.
    const magnitude = Math.hypot(x, y);
    if (magnitude > speed) {
      x = (x / magnitude) * speed;
      y = (y / magnitude) * speed;
    }
    const velocity = { x, y };
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
  // The sector it was given decides the side; the wall below may still veto it.
  let orbitSign = flankOrbitSign(enemy, believed, profile);
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
    perception,
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
