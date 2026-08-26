// Kept in its own module so balance schemas can read it without importing the
// protocol barrel, which would leave these constants in the temporal dead zone.

/** Archetypes shipped with the game; the balance catalogue may hold more. */
export const BUILTIN_ENEMY_KINDS = [
  "gunship",
  "missileCarrier",
  "sniper",
  "interceptor",
  "boss"
] as const;
export type BuiltinEnemyKind = (typeof BUILTIN_ENEMY_KINDS)[number];

/**
 * An enemy kind is a catalogue id, not a fixed enum: operators create their own
 * archetypes from the balance console. Existing ids are camelCase, so the
 * pattern accepts camelCase and kebab-case alike.
 */
export const ENEMY_ARCHETYPE_ID_PATTERN = /^[a-z][a-zA-Z0-9-]*$/;
export const MAX_ENEMY_ARCHETYPE_ID_LENGTH = 48;
export const MAX_ENEMY_ARCHETYPES = 32;
