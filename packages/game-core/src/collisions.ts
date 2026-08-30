import {
  type AsteroidState,
  type CombatConfig,
  type CombatEnemyState,
  type CombatStepState
} from "./combatTypes.ts";
import { arenaFromConfig } from "./combatMath.ts";
import {
  buildSpatialGrid,
  compareCollision,
  querySpatialGrid,
  relativeSweptCircleTime,
  type CollisionCandidate,
  type MovingEntity
} from "./spatialGrid.ts";
import { archetypeOf } from "./combatValidation.ts";
import { addRunStats } from "./runStats.ts";
import { rollLootDrop } from "./loot.ts";
import { isWithinCircularEnvelope } from "./arenaGeometry.ts";
import { shortestAngleDelta } from "./spaceshipSimulation.ts";
export function resolveFriendlyHits(state: CombatStepState, config: CombatConfig): CombatStepState {
  const targets: readonly (MovingEntity & {
    readonly kindForCollision: CollisionCandidate["targetKind"];
  })[] = [
    ...state.enemies.map((entity) => ({ ...entity, kindForCollision: "enemy" as const })),
    ...state.asteroids.map((entity) => ({ ...entity, kindForCollision: "asteroid" as const })),
    ...state.homingMissiles.map((entity) => ({ ...entity, kindForCollision: "missile" as const }))
  ];
  const grid = buildSpatialGrid(targets, config.spatialCellSize);
  const candidates: CollisionCandidate[] = [];
  for (const projectile of state.projectiles) {
    for (const target of querySpatialGrid(grid, projectile, config.spatialCellSize)) {
      const toi = relativeSweptCircleTime(projectile, target);
      if (toi !== null) {
        candidates.push({
          timeOfImpact: toi,
          sourceSequence: projectile.spawnSequence,
          targetSequence: target.spawnSequence,
          sourceId: projectile.id,
          targetId: target.id,
          targetKind: target.kindForCollision
        });
      }
    }
  }
  candidates.sort(compareCollision);
  const removedProjectiles = new Set<string>();
  const removedTargets = new Set<string>();
  const damage = new Map<string, number>();
  let score = state.score;
  let credits = state.credits;
  // Accumulated in locals and folded once at the end, the way score and credits
  // already are, so a busy tick pays one allocation instead of one per hit.
  let hitsByCannon = 0;
  let hitsByMachineGun = 0;
  let damageDealtByCannon = 0;
  let damageDealtByMachineGun = 0;
  let asteroidsDestroyed = 0;
  let creditsEarned = 0;
  // Salvage is rolled here because this is the only place an enemy dies, and
  // the roll has to see which archetype it was.
  const lootDrops = [...state.lootDrops];
  let lootRngState = state.lootRngState;
  let nextSpawnSequence = state.nextSpawnSequence;
  // Counted here rather than through `dynamicEntityCount`, which lives in
  // `combat.ts` and already imports this file.
  const dynamicBase =
    state.enemies.length +
    state.asteroids.length +
    state.lootDrops.length +
    state.hostileProjectiles.length +
    state.homingMissiles.length +
    state.projectiles.length;
  const lootRoom = () =>
    lootDrops.length < config.caps.lootDrops &&
    dynamicBase + (lootDrops.length - state.lootDrops.length) < config.caps.dynamicEntities;
  for (const candidate of candidates) {
    if (removedProjectiles.has(candidate.sourceId) || removedTargets.has(candidate.targetId))
      continue;
    const projectile = state.projectiles.find(({ id }) => id === candidate.sourceId);
    if (projectile === undefined) continue;
    removedProjectiles.add(candidate.sourceId);
    const fromCannon = projectile.source === "cannon";
    if (candidate.targetKind === "missile") {
      removedTargets.add(candidate.targetId);
      score += config.missileInterceptScoreReward;
      // An intercept is a hit even though a missile has no health to spend.
      if (fromCannon) hitsByCannon += 1;
      else hitsByMachineGun += 1;
      continue;
    }
    const existingDamage = damage.get(candidate.targetId) ?? 0;
    const target =
      candidate.targetKind === "enemy"
        ? state.enemies.find(({ id }) => id === candidate.targetId)
        : state.asteroids.find(({ id }) => id === candidate.targetId);
    // Overkill on the killing shot is not health that ever existed, so the
    // counter takes what was left rather than what the shot carried.
    const applied =
      target === undefined
        ? projectile.damage
        : Math.max(0, Math.min(projectile.damage, target.hp - existingDamage));
    if (fromCannon) {
      hitsByCannon += 1;
      damageDealtByCannon += applied;
    } else {
      hitsByMachineGun += 1;
      damageDealtByMachineGun += applied;
    }
    damage.set(candidate.targetId, existingDamage + projectile.damage);
    if (target !== undefined && existingDamage + projectile.damage >= target.hp) {
      removedTargets.add(candidate.targetId);
      if (candidate.targetKind === "enemy") {
        const enemy = target as CombatEnemyState;
        const archetype = archetypeOf(config, enemy.kind);
        score += archetype.scoreReward;
        credits += archetype.creditReward;
        creditsEarned += archetype.creditReward;
        if (lootRoom()) {
          const rolled = rollLootDrop(
            enemy,
            config,
            lootRngState,
            nextSpawnSequence,
            state.clock.tick
          );
          lootRngState = rolled.rngState;
          if (rolled.drop !== null) {
            lootDrops.push(rolled.drop);
            nextSpawnSequence += 1;
          }
        }
      } else {
        score += config.asteroidScoreReward;
        asteroidsDestroyed += 1;
        const asteroid = target as AsteroidState;
        if (asteroid.origin === "wave") {
          credits += config.asteroidCreditReward;
          creditsEarned += config.asteroidCreditReward;
        }
      }
    }
  }
  return {
    ...state,
    score,
    credits,
    lootDrops,
    lootRngState,
    nextSpawnSequence,
    runStats: addRunStats(state.runStats, {
      hitsByCannon,
      hitsByMachineGun,
      damageDealtByCannon,
      damageDealtByMachineGun,
      asteroidsDestroyed,
      creditsEarned
    }),
    projectiles: state.projectiles.filter(({ id }) => !removedProjectiles.has(id)),
    enemies: state.enemies
      .filter(({ id }) => !removedTargets.has(id))
      .map((enemy) => ({ ...enemy, hp: enemy.hp - (damage.get(enemy.id) ?? 0) })),
    asteroids: state.asteroids
      .filter(({ id }) => !removedTargets.has(id))
      .map((asteroid) => ({ ...asteroid, hp: asteroid.hp - (damage.get(asteroid.id) ?? 0) })),
    homingMissiles: state.homingMissiles.filter(({ id }) => !removedTargets.has(id))
  };
}

interface SpaceshipThreatCandidate {
  readonly timeOfImpact: number;
  readonly sourceSequence: number;
  readonly sourceId: string;
  readonly kind: "bullet" | "missile" | "asteroid";
  readonly shieldHitCost: number;
  readonly shieldHit: boolean;
}

export function resolveSpaceshipThreats(
  state: CombatStepState,
  config: CombatConfig
): CombatStepState {
  const threats: readonly (MovingEntity & {
    readonly threatKind: SpaceshipThreatCandidate["kind"];
    readonly damage: number;
    readonly shieldHitCost: number;
  })[] = [
    ...state.hostileProjectiles.map((entity) => ({ ...entity, threatKind: "bullet" as const })),
    ...state.homingMissiles.map((entity) => ({ ...entity, threatKind: "missile" as const })),
    ...state.asteroids.map((entity) => ({
      ...entity,
      threatKind: "asteroid" as const,
      shieldHitCost: config.asteroidShieldHitCost
    }))
  ];
  const spaceshipTarget: MovingEntity = {
    id: "spaceship",
    spawnSequence: 0,
    previousX: state.spaceship.previousX,
    previousY: state.spaceship.previousY,
    x: state.spaceship.x,
    y: state.spaceship.y,
    velocity: { x: 0, y: 0 },
    radius: state.spaceship.radius,
    spawnedTick: 0
  };
  const shieldTarget = { ...spaceshipTarget, radius: config.shieldRadius };
  const candidates: SpaceshipThreatCandidate[] = [];
  for (const threat of threats) {
    if (state.shieldActive) {
      const shieldToi = relativeSweptCircleTime(threat, shieldTarget);
      if (shieldToi !== null && isInsideShieldArc(threat, shieldToi, state, config)) {
        candidates.push({
          timeOfImpact: shieldToi,
          sourceSequence: threat.spawnSequence,
          sourceId: threat.id,
          kind: threat.threatKind,
          shieldHitCost: threat.shieldHitCost,
          shieldHit: true
        });
      }
    }
    const spaceshipToi = relativeSweptCircleTime(threat, spaceshipTarget);
    if (spaceshipToi !== null) {
      candidates.push({
        timeOfImpact: spaceshipToi,
        sourceSequence: threat.spawnSequence,
        sourceId: threat.id,
        kind: threat.threatKind,
        shieldHitCost: threat.shieldHitCost,
        shieldHit: false
      });
    }
  }
  candidates.sort(
    (a, b) =>
      a.timeOfImpact - b.timeOfImpact ||
      a.sourceSequence - b.sourceSequence ||
      Number(b.shieldHit) - Number(a.shieldHit)
  );
  const removed = new Set<string>();
  let shieldEnergy = state.shieldEnergy;
  let shieldActive = state.shieldActive;
  let shieldRearmRequired = state.shieldRearmRequired;
  let spaceshipHp = state.spaceshipHp;
  let score = state.score;
  let credits = state.credits;
  let damageTakenFromBullets = 0;
  let damageTakenFromMissiles = 0;
  let damageTakenFromAsteroids = 0;
  let shieldBlocks = 0;
  let shieldEnergySpentOnBlocks = 0;
  let shieldOverdrawnHits = 0;
  let asteroidsDestroyed = 0;
  let creditsEarned = 0;
  for (const candidate of candidates) {
    if (removed.has(candidate.sourceId)) continue;
    if (candidate.shieldHit && shieldActive) {
      const cost = candidate.shieldHitCost;
      if (shieldEnergy >= cost) {
        shieldEnergy -= cost;
        removed.add(candidate.sourceId);
        shieldBlocks += 1;
        shieldEnergySpentOnBlocks += cost;
        if (candidate.kind === "missile") score += config.missileInterceptScoreReward;
        if (candidate.kind === "asteroid") {
          score += config.asteroidScoreReward;
          asteroidsDestroyed += 1;
          const asteroid = state.asteroids.find(({ id }) => id === candidate.sourceId);
          if (asteroid?.origin === "wave") {
            credits += config.asteroidCreditReward;
            creditsEarned += config.asteroidCreditReward;
          }
        }
        if (shieldEnergy === 0) {
          shieldActive = false;
          shieldRearmRequired = true;
        }
      } else {
        // The sector was up but could not pay, so it drops and the same threat
        // lands its full hull damage on the next candidate for this id.
        shieldEnergy = 0;
        shieldActive = false;
        shieldRearmRequired = true;
        shieldOverdrawnHits += 1;
      }
      continue;
    }
    if (!candidate.shieldHit) {
      const threat = threats.find(({ id }) => id === candidate.sourceId);
      if (threat !== undefined) {
        const applied = Math.min(threat.damage, spaceshipHp);
        spaceshipHp = Math.max(0, spaceshipHp - threat.damage);
        if (candidate.kind === "bullet") damageTakenFromBullets += applied;
        else if (candidate.kind === "missile") damageTakenFromMissiles += applied;
        else damageTakenFromAsteroids += applied;
        removed.add(candidate.sourceId);
      }
    }
  }
  return {
    ...state,
    spaceshipHp,
    score,
    credits,
    runStats: addRunStats(state.runStats, {
      damageTakenFromBullets,
      damageTakenFromMissiles,
      damageTakenFromAsteroids,
      shieldBlocks,
      shieldEnergySpentOnBlocks,
      shieldOverdrawnHits,
      asteroidsDestroyed,
      creditsEarned
    }),
    shieldEnergy,
    shieldActive,
    shieldRearmRequired,
    hostileProjectiles: state.hostileProjectiles.filter(({ id }) => !removed.has(id)),
    homingMissiles: state.homingMissiles.filter(({ id }) => !removed.has(id)),
    asteroids: state.asteroids.filter(({ id }) => !removed.has(id))
  };
}

export function removeExpiredAndOutOfBounds(
  state: CombatStepState,
  config: CombatConfig
): CombatStepState {
  const arena = arenaFromConfig(config);
  const isInBounds = (entity: MovingEntity) =>
    isWithinCircularEnvelope(entity.x, entity.y, entity.radius, arena, config.worldPadding);
  return {
    ...state,
    asteroids: state.asteroids.filter(
      (entity) =>
        state.clock.tick - entity.spawnedTick < config.asteroidLifetimeTicks && isInBounds(entity)
    ),
    hostileProjectiles: state.hostileProjectiles.filter(
      (entity) => state.clock.tick - entity.spawnedTick < entity.lifetimeTicks && isInBounds(entity)
    ),
    homingMissiles: state.homingMissiles.filter(
      (entity) => state.clock.tick - entity.spawnedTick < entity.lifetimeTicks && isInBounds(entity)
    ),
    projectiles: state.projectiles.filter((entity) =>
      isWithinCircularEnvelope(entity.x, entity.y, entity.radius, arena, config.worldPadding)
    )
  };
}

export function isInsideShieldArc(
  threat: MovingEntity,
  timeOfImpact: number,
  state: CombatStepState,
  config: CombatConfig
): boolean {
  const threatX = threat.previousX + (threat.x - threat.previousX) * timeOfImpact;
  const threatY = threat.previousY + (threat.y - threat.previousY) * timeOfImpact;
  const spaceshipX =
    state.spaceship.previousX + (state.spaceship.x - state.spaceship.previousX) * timeOfImpact;
  const spaceshipY =
    state.spaceship.previousY + (state.spaceship.y - state.spaceship.previousY) * timeOfImpact;
  const bearing = Math.atan2(threatY - spaceshipY, threatX - spaceshipX);
  const arc = Math.min(
    Math.PI * 2,
    config.shieldArcRadians + state.roleModifiers.shield.arcWidthBonus
  );
  return Math.abs(shortestAngleDelta(state.shieldAngle, bearing)) <= arc / 2;
}
