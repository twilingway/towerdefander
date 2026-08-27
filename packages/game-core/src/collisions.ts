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
  for (const candidate of candidates) {
    if (removedProjectiles.has(candidate.sourceId) || removedTargets.has(candidate.targetId))
      continue;
    const projectile = state.projectiles.find(({ id }) => id === candidate.sourceId);
    if (projectile === undefined) continue;
    removedProjectiles.add(candidate.sourceId);
    if (candidate.targetKind === "missile") {
      removedTargets.add(candidate.targetId);
      score += config.missileInterceptScoreReward;
      continue;
    }
    const existingDamage = damage.get(candidate.targetId) ?? 0;
    damage.set(candidate.targetId, existingDamage + projectile.damage);
    const target =
      candidate.targetKind === "enemy"
        ? state.enemies.find(({ id }) => id === candidate.targetId)
        : state.asteroids.find(({ id }) => id === candidate.targetId);
    if (target !== undefined && existingDamage + projectile.damage >= target.hp) {
      removedTargets.add(candidate.targetId);
      if (candidate.targetKind === "enemy") {
        const enemy = target as CombatEnemyState;
        const archetype = archetypeOf(config, enemy.kind);
        score += archetype.scoreReward;
        credits += archetype.creditReward;
      } else {
        score += config.asteroidScoreReward;
        const asteroid = target as AsteroidState;
        if (asteroid.origin === "wave") credits += config.asteroidCreditReward;
      }
    }
  }
  return {
    ...state,
    score,
    credits,
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
  for (const candidate of candidates) {
    if (removed.has(candidate.sourceId)) continue;
    if (candidate.shieldHit && shieldActive) {
      const cost = candidate.shieldHitCost;
      if (shieldEnergy >= cost) {
        shieldEnergy -= cost;
        removed.add(candidate.sourceId);
        if (candidate.kind === "missile") score += config.missileInterceptScoreReward;
        if (candidate.kind === "asteroid") {
          score += config.asteroidScoreReward;
          const asteroid = state.asteroids.find(({ id }) => id === candidate.sourceId);
          if (asteroid?.origin === "wave") credits += config.asteroidCreditReward;
        }
        if (shieldEnergy === 0) {
          shieldActive = false;
          shieldRearmRequired = true;
        }
      } else {
        shieldEnergy = 0;
        shieldActive = false;
        shieldRearmRequired = true;
      }
      continue;
    }
    if (!candidate.shieldHit) {
      const threat = threats.find(({ id }) => id === candidate.sourceId);
      if (threat !== undefined) {
        spaceshipHp = Math.max(0, spaceshipHp - threat.damage);
        removed.add(candidate.sourceId);
      }
    }
  }
  return {
    ...state,
    spaceshipHp,
    score,
    credits,
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
