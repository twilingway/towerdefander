import {
  ENEMY_SKILL_LEVELS,
  type EnemySkillLevel,
  type EnemySkillProfile,
  type EnemySkillTuning
} from "./combatTypes.ts";

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
