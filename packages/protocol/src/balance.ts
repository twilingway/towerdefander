import { z } from "zod";

import {
  ENEMY_ARCHETYPE_ID_PATTERN,
  ENEMY_SHAPES,
  MAX_ENEMY_ARCHETYPES,
  MAX_ENEMY_ARCHETYPE_ID_LENGTH
} from "./enemyKinds.ts";

export const BALANCE_FILE_VERSION = 5 as const;
/** File versions the store still knows how to migrate forward. */
export const LEGACY_BALANCE_FILE_VERSIONS = [1, 2, 3, 4] as const;
export const MAX_ENEMY_WEAPONS = 4;
export const SPAWN_SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export const spawnSectorSchema = z.enum(SPAWN_SECTORS);
export type SpawnSector = z.infer<typeof spawnSectorSchema>;

export const ENEMY_WEAPON_KINDS = ["bullet", "missile"] as const;
export const enemyWeaponKindSchema = z.enum(ENEMY_WEAPON_KINDS);
export type EnemyWeaponKind = z.infer<typeof enemyWeaponKindSchema>;

export const ENEMY_SPAWN_POLICIES = ["standard", "boss"] as const;
export const enemySpawnPolicySchema = z.enum(ENEMY_SPAWN_POLICIES);
export type EnemySpawnPolicy = z.infer<typeof enemySpawnPolicySchema>;

export const ASTEROID_SPAWN_KIND = "asteroid" as const;
export const enemyArchetypeIdSchema = z
  .string()
  .min(1)
  .max(MAX_ENEMY_ARCHETYPE_ID_LENGTH)
  .regex(ENEMY_ARCHETYPE_ID_PATTERN, "Archetype id must start with a lowercase letter.");
export type EnemyArchetypeId = z.infer<typeof enemyArchetypeIdSchema>;
/** A wave entry spawns either a catalogue archetype or the ambient hazard. */
export const spawnKindSchema = enemyArchetypeIdSchema;
export type SpawnKind = z.infer<typeof spawnKindSchema>;

export const enemyShapeSchema = z.enum(ENEMY_SHAPES);
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a #rrggbb value.");
export const enemyVisualSchema = z
  .object({
    shape: enemyShapeSchema,
    color: hexColorSchema,
    outline: hexColorSchema,
    /** Drawn size relative to the hit radius; 1 means the model matches the hitbox. */
    modelScale: z.number().min(0.2).max(4),
    showHealthBar: z.boolean()
  })
  .strict();
export type EnemyVisual = z.infer<typeof enemyVisualSchema>;

const positiveFinite = z.number().positive();
const nonNegativeFinite = z.number().nonnegative();
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const enemyWeaponTuningSchema = z
  .object({
    kind: enemyWeaponKindSchema,
    cooldownTicks: positiveInteger,
    damage: positiveFinite,
    shieldHitCost: positiveFinite,
    projectileRadius: positiveFinite,
    projectileSpeedPerSecond: positiveFinite,
    projectileLifetimeTicks: positiveInteger,
    turnRatePerSecond: positiveFinite,
    burstCount: positiveInteger.max(16),
    burstSpreadRadians: nonNegativeFinite.max(Math.PI * 2)
  })
  .strict();
export type EnemyWeaponTuning = z.infer<typeof enemyWeaponTuningSchema>;

export const enemyArchetypeSchema = z
  .object({
    hp: positiveFinite,
    radius: positiveFinite,
    speedPerSecond: positiveFinite,
    preferredDistance: positiveFinite,
    weapons: z.array(enemyWeaponTuningSchema).min(1).max(MAX_ENEMY_WEAPONS).readonly(),
    visual: enemyVisualSchema,
    label: z.string().min(1).max(48),
    spawnPolicy: enemySpawnPolicySchema,
    spawnCost: positiveFinite,
    unlockWave: positiveInteger,
    scoreReward: nonNegativeFinite,
    creditReward: nonNegativeFinite
  })
  .strict();
export type EnemyArchetype = z.infer<typeof enemyArchetypeSchema>;

export const enemyArchetypeTableSchema = z
  .record(enemyArchetypeIdSchema, enemyArchetypeSchema)
  .superRefine((value, context) => {
    const ids = Object.keys(value);
    if (ids.length === 0) {
      context.addIssue({ code: "custom", message: "Catalogue must hold at least one archetype." });
    }
    if (ids.length > MAX_ENEMY_ARCHETYPES) {
      context.addIssue({
        code: "custom",
        message: `Catalogue cannot hold more than ${String(MAX_ENEMY_ARCHETYPES)} archetypes.`
      });
    }
    if (ids.includes(ASTEROID_SPAWN_KIND)) {
      context.addIssue({
        code: "custom",
        message: `"${ASTEROID_SPAWN_KIND}" is the ambient hazard and cannot be an archetype id.`
      });
    }
  });

export const waveSpawnEntrySchema = z
  .object({
    kind: spawnKindSchema,
    count: positiveInteger.max(200),
    spawnIntervalTicks: positiveInteger.max(20_000),
    // Empty means the whole circumference; several sectors are picked between per spawn.
    sectors: z.array(spawnSectorSchema).max(SPAWN_SECTORS.length).readonly(),
    /** Overrides the wave and director multipliers for this group only. */
    hpMultiplier: positiveFinite.nullable(),
    tempoMultiplier: positiveFinite.nullable()
  })
  .strict();
export type WaveSpawnEntry = z.infer<typeof waveSpawnEntrySchema>;

export const waveDefinitionSchema = z
  .object({
    entries: z.array(waveSpawnEntrySchema).min(1).max(64).readonly(),
    hpMultiplier: positiveFinite.nullable(),
    tempoMultiplier: positiveFinite.nullable()
  })
  .strict();
export type WaveDefinition = z.infer<typeof waveDefinitionSchema>;

export const directorTuningSchema = z
  .object({
    baseBudget: positiveInteger,
    budgetGrowth: positiveInteger,
    budgetCap: positiveInteger,
    hpGrowth: positiveFinite,
    hpMultiplierCap: positiveFinite,
    tempoGrowth: positiveFinite,
    tempoMultiplierCap: positiveFinite,
    bossWaveInterval: positiveInteger.nullable()
  })
  .strict();
export type DirectorTuning = z.infer<typeof directorTuningSchema>;

export const waveCampaignSchema = z
  .object({
    waves: z.array(waveDefinitionSchema).max(200).readonly(),
    director: directorTuningSchema
  })
  .strict();
export type WaveCampaign = z.infer<typeof waveCampaignSchema>;

export const balanceTuningSchema = z
  .object({
    enemyArchetypes: enemyArchetypeTableSchema,
    waveCampaign: waveCampaignSchema,
    enemySpawnIntervalTicks: positiveInteger,
    intermissionTicks: positiveInteger,
    ambientAsteroidIntervalMinTicks: positiveInteger,
    ambientAsteroidIntervalMaxTicks: positiveInteger,
    asteroidHp: positiveFinite,
    asteroidRadius: positiveFinite,
    asteroidSpeedPerSecond: positiveFinite,
    asteroidLifetimeTicks: positiveInteger,
    asteroidDamage: positiveFinite,
    asteroidShieldHitCost: positiveFinite,
    asteroidSpawnCost: positiveInteger,
    asteroidScoreReward: nonNegativeFinite,
    asteroidCreditReward: nonNegativeFinite,
    missileInterceptScoreReward: nonNegativeFinite
  })
  .strict()
  .superRefine((value, context) => {
    if (value.ambientAsteroidIntervalMinTicks > value.ambientAsteroidIntervalMaxTicks) {
      context.addIssue({
        code: "custom",
        path: ["ambientAsteroidIntervalMinTicks"],
        message: "Ambient asteroid minimum interval cannot exceed the maximum."
      });
    }
  });
export type BalanceTuning = z.infer<typeof balanceTuningSchema>;

export const balancePresetIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Preset id must be kebab-case.");

export const balancePresetSchema = z
  .object({
    id: balancePresetIdSchema,
    name: z.string().min(1).max(80),
    tuning: balanceTuningSchema
  })
  .strict();
export type BalancePreset = z.infer<typeof balancePresetSchema>;

export const balancePresetsFileSchema = z
  .object({
    version: z.literal(BALANCE_FILE_VERSION),
    activePresetId: balancePresetIdSchema,
    presets: z.array(balancePresetSchema).min(1).max(50)
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.presets.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["presets"],
        message: "Preset ids must be unique."
      });
    }
    if (!ids.includes(value.activePresetId)) {
      context.addIssue({
        code: "custom",
        path: ["activePresetId"],
        message: "Active preset id must match one of the presets."
      });
    }
  });
export type BalancePresetsFile = z.infer<typeof balancePresetsFileSchema>;

export const balanceStateResponseSchema = z
  .object({
    activePresetId: balancePresetIdSchema,
    presets: z.array(balancePresetSchema).min(1)
  })
  .strict();
export type BalanceStateResponse = z.infer<typeof balanceStateResponseSchema>;

export const balanceValidationResponseSchema = z
  .object({
    valid: z.boolean(),
    message: z.string().nullable()
  })
  .strict();
export type BalanceValidationResponse = z.infer<typeof balanceValidationResponseSchema>;
