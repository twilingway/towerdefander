import {
  ENEMY_SKILL_LEVELS,
  type CombatEnemyState,
  type EnemyPerception,
  type EnemySkillLevel,
  type EnemySkillProfile,
  type EnemySkillTuning,
  type FriendlyProjectileLike
} from "./combatTypes.ts";
import { type Vector2 } from "./spaceshipSimulation.ts";

/**
 * Resolves the profile an archetype actually plays at: its own level, shifted
 * by the global difficulty offset and saturated at the ends of the list.
 *
 * A shift rather than a replacement, so the spread the operator laid out across
 * the catalogue survives every position of the difficulty control — a boss set
 * two levels above an interceptor stays two levels above it until both hit the
 * same end of the list.
 */
export function resolveEnemySkill(
  tuning: EnemySkillTuning,
  level: EnemySkillLevel
): EnemySkillProfile {
  const index = ENEMY_SKILL_LEVELS.indexOf(level);
  const shifted = Math.min(
    ENEMY_SKILL_LEVELS.length - 1,
    Math.max(0, index + Math.trunc(tuning.offset))
  );
  // The index is clamped into the list, so the fallback is unreachable; it is
  // here because an indexed read is typed as possibly missing.
  return tuning.profiles[ENEMY_SKILL_LEVELS[shifted] ?? level];
}

/** The ship as an enemy can observe it: where it is and where it just was. */
export interface ObservedSpaceship {
  readonly x: number;
  readonly y: number;
  readonly previousX: number;
  readonly previousY: number;
}

/**
 * Refreshes the remembered ship once every `reactionTicks`. A slow enemy keeps
 * steering and shooting at where the ship was, which is what makes a rookie
 * beatable by simply moving: the knob buys reaction time, not accuracy.
 */
export function perceiveSpaceship(
  perception: EnemyPerception,
  spaceship: ObservedSpaceship,
  profile: EnemySkillProfile,
  tick: number,
  secondsPerStep: number
): EnemyPerception {
  // A negative tick is the spawner saying the enemy has never looked, which
  // has to refresh whatever the window is — otherwise a slow archetype spends
  // its first half-second steering at its own spawn point.
  if (perception.tick >= 0 && tick - perception.tick < profile.reactionTicks) return perception;
  return {
    tick,
    x: spaceship.x,
    y: spaceship.y,
    velocityX: (spaceship.x - spaceship.previousX) / secondsPerStep,
    velocityY: (spaceship.y - spaceship.previousY) / secondsPerStep
  };
}

/**
 * Where the remembered ship is believed to be now. Between refreshes the enemy
 * carries the snapshot forward on its own velocity rather than freezing on it,
 * so a stale memory drifts instead of jumping when it is finally replaced.
 */
export function believedPosition(
  perception: EnemyPerception,
  tick: number,
  secondsPerStep: number
): Vector2 {
  if (perception.tick < 0) return { x: perception.x, y: perception.y };
  const elapsed = Math.max(0, tick - perception.tick) * secondsPerStep;
  return {
    x: perception.x + perception.velocityX * elapsed,
    y: perception.y + perception.velocityY * elapsed
  };
}

/**
 * Push away from neighbours crowded closer than the two hulls allow. Without it
 * a wing of one archetype converges on the same solution and stacks into a
 * single silhouette, which reads as one enemy and shoots like six.
 */
export function separationPush(
  enemy: CombatEnemyState,
  neighbours: readonly CombatEnemyState[]
): Vector2 {
  let pushX = 0;
  let pushY = 0;
  for (const other of neighbours) {
    if (other.id === enemy.id) continue;
    const deltaX = enemy.x - other.x;
    const deltaY = enemy.y - other.y;
    const gap = Math.hypot(deltaX, deltaY);
    const minimum = enemy.radius + other.radius;
    if (gap >= minimum || gap === 0) continue;
    const strength = (minimum - gap) / minimum;
    pushX += (deltaX / gap) * strength;
    pushY += (deltaY / gap) * strength;
  }
  const magnitude = Math.hypot(pushX, pushY);
  if (magnitude === 0) return { x: 0, y: 0 };
  // Normalised, so a crowd of six does not shove six times harder than a pair.
  return { x: pushX / magnitude, y: pushY / magnitude };
}

/** Consecutive spawns never share a sector, because the golden angle repeats slowly. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * The bearing around the ship this enemy is trying to hold. Derived from its
 * spawn sequence rather than negotiated between enemies, so it costs nothing
 * per tick and comes out identical on a replay of the same seed.
 */
export function assignedBearing(enemy: CombatEnemyState): number {
  return enemy.spawnSequence * GOLDEN_ANGLE;
}

/**
 * Which way round the ship to circle so the enemy converges on its own sector.
 * Returns the sign it already had when the profile does not spread, which is
 * what keeps a rookie wing piling onto one side the way it always did.
 */
export function flankOrbitSign(
  enemy: CombatEnemyState,
  believed: Vector2,
  profile: EnemySkillProfile
): number {
  if (profile.flankSpread <= 0) return enemy.orbitSign;
  const bearing = Math.atan2(enemy.y - believed.y, enemy.x - believed.x);
  const offset = assignedBearing(enemy) - bearing;
  const delta = Math.atan2(Math.sin(offset), Math.cos(offset));
  // Full spread commits to the short way round at any offset; a partial one
  // only bothers once the enemy is well away from the sector it was given.
  if (Math.abs(delta) < (1 - profile.flankSpread) * Math.PI) return enemy.orbitSign;
  return delta >= 0 ? 1 : -1;
}

/**
 * A sideways shove away from a friendly shot that would otherwise connect
 * inside the horizon. Sideways rather than backwards, because retreating along
 * the line of fire keeps the enemy in it.
 */
export function evasionPush(
  enemy: CombatEnemyState,
  projectiles: readonly FriendlyProjectileLike[],
  profile: EnemySkillProfile,
  secondsPerStep: number
): Vector2 {
  if (profile.evadeHorizonTicks <= 0) return { x: 0, y: 0 };
  const horizon = profile.evadeHorizonTicks * secondsPerStep;
  let pushX = 0;
  let pushY = 0;
  for (const projectile of projectiles) {
    const relativeX = projectile.x - enemy.x;
    const relativeY = projectile.y - enemy.y;
    const velocityX = projectile.velocity.x - enemy.velocity.x;
    const velocityY = projectile.velocity.y - enemy.velocity.y;
    const closingSquared = velocityX * velocityX + velocityY * velocityY;
    if (closingSquared === 0) continue;
    const contact = -(relativeX * velocityX + relativeY * velocityY) / closingSquared;
    if (contact <= 0 || contact > horizon) continue;
    const missX = relativeX + velocityX * contact;
    const missY = relativeY + velocityY * contact;
    if (Math.hypot(missX, missY) > enemy.radius + projectile.radius) continue;
    // Off the shot's own line, to the side the enemy already leans towards.
    const speed = Math.sqrt(closingSquared);
    const sign = relativeX * velocityY - relativeY * velocityX >= 0 ? 1 : -1;
    pushX += (-velocityY / speed) * sign;
    pushY += (velocityX / speed) * sign;
  }
  const magnitude = Math.hypot(pushX, pushY);
  if (magnitude === 0) return { x: 0, y: 0 };
  return { x: pushX / magnitude, y: pushY / magnitude };
}

/**
 * Where a barrel should point: the remembered ship carried forward by the
 * flight time of the shot, scaled by `leadFactor`.
 *
 * The heaviest knob in the set, because until it existed there was no lead at
 * all and a steady sideways course beat every enemy gun in the game.
 */
export function aimPoint(
  enemy: CombatEnemyState,
  perception: EnemyPerception,
  profile: EnemySkillProfile,
  projectileSpeedPerSecond: number,
  tick: number,
  secondsPerStep: number
): Vector2 {
  const believed = believedPosition(perception, tick, secondsPerStep);
  if (profile.leadFactor <= 0 || projectileSpeedPerSecond <= 0) return believed;
  const flight = Math.hypot(believed.x - enemy.x, believed.y - enemy.y) / projectileSpeedPerSecond;
  return {
    x: believed.x + perception.velocityX * flight * profile.leadFactor,
    y: believed.y + perception.velocityY * flight * profile.leadFactor
  };
}
