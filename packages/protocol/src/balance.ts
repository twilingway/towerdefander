import { z } from "zod";

import {
  ENEMY_ARCHETYPE_ID_PATTERN,
  MAX_ENEMY_ARCHETYPES,
  MAX_ENEMY_ARCHETYPE_ID_LENGTH
} from "./enemyKinds.ts";
import { VISUAL_ASSET_IDS } from "./visualCatalog.ts";

export const BALANCE_FILE_VERSION = 28 as const;
/** File versions the store still knows how to migrate forward. */
export const LEGACY_BALANCE_FILE_VERSIONS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27
] as const;
export const MAX_ENEMY_WEAPONS = 4;
export const SPAWN_SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export const spawnSectorSchema = z.enum(SPAWN_SECTORS);
export type SpawnSector = z.infer<typeof spawnSectorSchema>;

export const FRIENDLY_WEAPON_KINDS = ["kinetic", "laser", "missile"] as const;
export const friendlyWeaponKindSchema = z.enum(FRIENDLY_WEAPON_KINDS);
export type FriendlyWeaponKind = z.infer<typeof friendlyWeaponKindSchema>;

export const ENEMY_WEAPON_KINDS = ["bullet", "missile"] as const;
export const enemyWeaponKindSchema = z.enum(ENEMY_WEAPON_KINDS);
export type EnemyWeaponKind = z.infer<typeof enemyWeaponKindSchema>;

export const ENEMY_SPAWN_POLICIES = ["standard", "boss"] as const;
export const enemySpawnPolicySchema = z.enum(ENEMY_SPAWN_POLICIES);
export type EnemySpawnPolicy = z.infer<typeof enemySpawnPolicySchema>;

export const ASTEROID_SPAWN_KIND = "asteroid" as const;

/**
 * World units the display frames at its narrowest; the height follows as 9/16
 * of it. The lower bound keeps the spaceship readable, the upper one is the
 * whole square world, past which there is nothing left to reveal.
 */
export const CAMERA_VIEW_WIDTH_MIN = 800;
export const CAMERA_VIEW_WIDTH_MAX = 4400;
export const CAMERA_VIEW_ASPECT = 9 / 16;
export const cameraViewWidthSchema = z
  .number()
  .min(CAMERA_VIEW_WIDTH_MIN)
  .max(CAMERA_VIEW_WIDTH_MAX);

/**
 * Half the side of the square world, and the only geometry knob: the world is
 * derived from it, so the circle cannot drift out of the square it is drawn in.
 */
export const ARENA_RADIUS_MIN = 1100;
export const ARENA_RADIUS_MAX = 8800;
export const arenaRadiusSchema = z.number().min(ARENA_RADIUS_MIN).max(ARENA_RADIUS_MAX);

/**
 * Parallax space background of the display. Presentation-only, like
 * `cameraViewWidth`: the simulation never reads it, the scene does. Ranges match
 * the reference demo so tuned values carry over as-is.
 */
export const NEBULA_PRESETS = ["blue", "gold", "purple", "green"] as const;
export const nebulaPresetSchema = z.enum(NEBULA_PRESETS);
export type NebulaPreset = z.infer<typeof nebulaPresetSchema>;

export const BACKGROUND_PARALLAX_STRENGTH_MAX = 1.6;
export const BACKGROUND_DRIFT_SPEED_MAX = 3;
export const backgroundTuningSchema = z
  .object({
    /** Multiplier of the camera-driven layer shift; zero keeps only the idle drift. */
    parallaxStrength: z.number().min(0).max(BACKGROUND_PARALLAX_STRENGTH_MAX),
    /** Idle drift speed in texture pixels per second at full strength. */
    driftSpeed: z.number().min(0).max(BACKGROUND_DRIFT_SPEED_MAX),
    /** Opacity of both nebula layers; stars and dust keep their own fixed alpha. */
    nebulaAlpha: z.number().min(0).max(1),
    nebulaPreset: nebulaPresetSchema
  })
  .strict();
export type BackgroundTuning = z.infer<typeof backgroundTuningSchema>;
export const enemyArchetypeIdSchema = z
  .string()
  .min(1)
  .max(MAX_ENEMY_ARCHETYPE_ID_LENGTH)
  .regex(ENEMY_ARCHETYPE_ID_PATTERN, "Archetype id must start with a lowercase letter.");
export type EnemyArchetypeId = z.infer<typeof enemyArchetypeIdSchema>;
/** A wave entry spawns either a catalogue archetype or the ambient hazard. */
export const spawnKindSchema = enemyArchetypeIdSchema;
export type SpawnKind = z.infer<typeof spawnKindSchema>;

/** A silhouette from the shared visual catalogue; the asset carries its own colours. */
export const visualAssetIdSchema = z.enum(VISUAL_ASSET_IDS);
export const MODEL_SCALE_MIN = 0.2;
export const MODEL_SCALE_MAX = 4;
const modelScaleSchema = z.number().min(MODEL_SCALE_MIN).max(MODEL_SCALE_MAX);
export const enemyVisualSchema = z
  .object({
    shape: visualAssetIdSchema,
    /** Drawn size relative to the hit radius; 1 means the model matches the hitbox. */
    modelScale: modelScaleSchema,
    showHealthBar: z.boolean()
  })
  .strict();
export type EnemyVisual = z.infer<typeof enemyVisualSchema>;

/** A projectile or hazard look; null keeps the display's own default primitive. */
export const entityVisualSchema = z
  .object({ shape: visualAssetIdSchema, modelScale: modelScaleSchema })
  .strict()
  .nullable();
export type EntityVisual = z.infer<typeof entityVisualSchema>;

/**
 * The gun on the hull. Two offsets, both in hull radii with positive x right
 * and positive y down, answering different questions.
 *
 * The mount is where on the ship the weapon is bolted, measured from the
 * centre. It belongs to the hull, so it turns with the hull and stays on the
 * wing it was put on. Zero keeps the weapon on the centreline, which is where
 * everything sat before this existed.
 *
 * The pivot then nudges the drawing about that mount. Catalogue assets are
 * drawn around their own origin, which is rarely the breech — the railgun's
 * sits well off it — so without this the gun swings around a point beside
 * itself. It belongs to the weapon, so it turns with the weapon.
 */
export const PIVOT_LIMIT = 2;
const pivotOffset = z.number().min(-PIVOT_LIMIT).max(PIVOT_LIMIT);
export const turretVisualSchema = z
  .object({
    shape: visualAssetIdSchema,
    modelScale: modelScaleSchema,
    mountX: pivotOffset,
    mountY: pivotOffset,
    pivotX: pivotOffset,
    pivotY: pivotOffset
  })
  .strict()
  .nullable();
export type TurretVisual = z.infer<typeof turretVisualSchema>;

const positiveFinite = z.number().positive();
const nonNegativeFinite = z.number().nonnegative();
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** Zero is legal for the shield timings: it restores the old instant toggle. */
const nonNegativeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const enemyWeaponTuningSchema = z
  .object({
    kind: enemyWeaponKindSchema,
    cooldownTicks: positiveInteger,
    damage: positiveFinite,
    shieldHitCost: positiveFinite,
    projectileRadius: positiveFinite,
    projectileSpeedPerSecond: positiveFinite,
    projectileLifetimeTicks: positiveInteger,
    /** World units to the spaceship at which this weapon opens fire. */
    engagementRange: positiveFinite,
    turnRatePerSecond: positiveFinite,
    burstCount: positiveInteger.max(16),
    burstSpreadRadians: nonNegativeFinite.max(Math.PI * 2),
    /** Look of the shots this barrel fires; null leaves them the default primitive. */
    visual: entityVisualSchema
  })
  .strict();
export type EnemyWeaponTuning = z.infer<typeof enemyWeaponTuningSchema>;

/**
 * How well an enemy plays, as opposed to what it is. One algorithm reads the
 * profile, so levels differ by numbers and never by branches — an operator can
 * put two of them side by side and compare.
 */
export const ENEMY_SKILL_LEVELS = ["rookie", "veteran", "ace"] as const;
export const enemySkillLevelSchema = z.enum(ENEMY_SKILL_LEVELS);
export type EnemySkillLevel = z.infer<typeof enemySkillLevelSchema>;

export const enemySkillProfileSchema = z
  .object({
    // --- Perception and aim ---
    /** Ticks between refreshes of the remembered ship position and velocity. */
    reactionTicks: z.number().int().min(0).max(40),
    /** Seeded spread on the barrel, in radians. */
    aimJitterRadians: z.number().min(0).max(0.6),
    /** 0 fires where the ship is, 1 where it is going to be. */
    leadFactor: z.number().min(0).max(1),

    // --- Manoeuvre ---
    /** Share of the speed budget spent circling rather than closing. */
    orbitShare: z.number().min(0).max(1),
    /** Width of the band over which closing blends into circling. */
    rangeBandUnits: z.number().min(20).max(1200),
    /** Weight of the push away from neighbours that crowd in too close. */
    separationWeight: z.number().min(0).max(1),
    /** How far the swarm spreads around the ship instead of massing on one side. */
    flankSpread: z.number().min(0).max(1),
    /** Ticks ahead an incoming friendly shot is dodged; 0 never dodges. */
    evadeHorizonTicks: z.number().int().min(0).max(40),

    // --- Discipline ---
    /** HP fraction below which the enemy backs off; 0 never retreats. */
    retreatHpFraction: z.number().min(0).max(1),
    /** Multiplier on the fighting distance while retreating. */
    retreatStandoffFactor: z.number().min(1).max(4)
  })
  .strict();
export type EnemySkillProfile = z.infer<typeof enemySkillProfileSchema>;

export const enemySkillTuningSchema = z
  .object({
    /**
     * Whole-step difficulty shift applied to every archetype at once, so the
     * spread the operator laid out across the catalogue survives it. A future
     * in-game control overrides this on the run's own config.
     */
    offset: z.number().int().min(-2).max(2),
    profiles: z
      .object({
        rookie: enemySkillProfileSchema,
        veteran: enemySkillProfileSchema,
        ace: enemySkillProfileSchema
      })
      .strict()
  })
  .strict();
export type EnemySkillTuning = z.infer<typeof enemySkillTuningSchema>;

export const enemyArchetypeSchema = z
  .object({
    hp: positiveFinite,
    radius: positiveFinite,
    speedPerSecond: positiveFinite,
    preferredDistance: positiveFinite,
    /**
     * How hard the hull is to turn. The ship carries angular momentum like the
     * player's does, so a heavy archetype keeps swinging past and a light one
     * snaps around; without these a course reversal happened inside one tick.
     */
    turnRatePerSecond: positiveFinite,
    turnAccelerationPerSecondSquared: positiveFinite,
    turnBrakingPerSecondSquared: positiveFinite,
    /** Which profile this archetype plays at, before the global offset. */
    combatSkill: enemySkillLevelSchema,
    weapons: z.array(enemyWeaponTuningSchema).min(1).max(MAX_ENEMY_WEAPONS).readonly(),
    visual: enemyVisualSchema,
    label: z.string().min(1).max(48),
    spawnPolicy: enemySpawnPolicySchema,
    spawnCost: positiveFinite,
    unlockWave: positiveInteger,
    scoreReward: nonNegativeFinite,
    creditReward: nonNegativeFinite,
    /**
     * Chance this archetype leaves salvage behind. Per archetype rather than
     * global because an interceptor arrives eight at a time and a boss once:
     * one probability cannot serve both.
     */
    lootChance: z.number().min(0).max(1)
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

/**
 * Skill levels of the visible-demo autopilot. Presentation-only, like
 * `cameraViewWidth`: the simulation never reads them, the demo harness does.
 */
export const AUTOPILOT_LEVELS = ["rookie", "veteran", "ace"] as const;
export const autopilotLevelSchema = z.enum(AUTOPILOT_LEVELS);
export type AutopilotLevel = z.infer<typeof autopilotLevelSchema>;

export const autopilotProfileSchema = z
  .object({
    // --- Accuracy and reaction ---
    /** Ticks a fresh target must persist before the bot commits to it. */
    reactionTicks: z.number().int().min(0).max(40),
    /** Ticks between target re-rankings; longer means a more sluggish pilot. */
    retargetIntervalTicks: z.number().int().min(1).max(60),
    /** Seeded aim noise in radians. */
    aimJitterRadians: z.number().min(0).max(0.6),
    /** 0 aims where the target is, 1 where it will be. */
    leadFactor: z.number().min(0).max(1),

    // --- Skill set ---
    orbit: z.boolean(),
    evadeMissiles: z.boolean(),
    dodgeBullets: z.boolean(),
    threatAwareShield: z.boolean(),
    /** World units the pilot keeps between the hull and its target. */
    standoffDistance: z.number().min(200).max(2000),
    /** How far ahead the pilot looks for a hit the shield will not cover. */
    evadeHorizonTicks: z.number().int().min(0).max(40),

    // --- Resource discipline ---
    /** Half-angle around the ship heading inside which the nose gun fires. */
    mgConeRadians: z.number().min(0.02).max(Math.PI),
    /** Half-angle around the turret bearing inside which the cannon fires. */
    cannonConeRadians: z.number().min(0.02).max(Math.PI),
    /** Fraction of heat capacity above which the nose gun holds fire. */
    mgHeatCeiling: z.number().min(0.1).max(1),
    /** Share of the cannon's heat the bot will spend before holding fire. */
    cannonHeatCeiling: z.number().min(0.1).max(1),
    /** Ticks before predicted contact at which the shield goes up. */
    shieldLeadTicks: z.number().int().min(0).max(40),
    /** Fraction of shield capacity below which the shield stays down. */
    shieldMinEnergy: z.number().min(0).max(0.9)
  })
  .strict();
export type AutopilotProfile = z.infer<typeof autopilotProfileSchema>;

/**
 * Feel of the keyboard helm. The lead angle alone sets the turn rate, because
 * the hull chases a target at `sqrt(2 * braking * delta)`; the counter angle is
 * how hard the release brakes against network lag; the nudge is the thrust a
 * turn in place rides on, since the core reads the course from the direction of
 * the pilot vector and ignores a strictly zero one. Presentation-only, like
 * `autopilot`: the simulation never reads this section.
 */
export const HELM_SCHEMES = ["tank", "absolute"] as const;
export const helmSchemeSchema = z.enum(HELM_SCHEMES);
export type HelmScheme = z.infer<typeof helmSchemeSchema>;

export const helmTuningSchema = z
  .object({
    /**
     * `tank` turns the hull with the turn keys and burns along the nose;
     * `absolute` sends the direction the keys point, the way a twin-stick
     * shooter does.
     */
    scheme: helmSchemeSchema,
    /** How far ahead of the nose the requested course sits while turning. */
    headingLeadRadians: z.number().min(0.05).max(1.5),
    /**
     * Multiplies the predicted stopping angle when a turn key comes up. 1 aims
     * exactly where the hull would coast to a halt; below 1 stops it short and
     * can rock it back, above 1 lets it drift a little further.
     */
    stopDampening: z.number().min(0.5).max(1.5),
    /** Share of full thrust a turn without the engine rides on. */
    rotateInPlaceThrottle: z.number().min(0.005).max(0.2)
  })
  .strict();
export type HelmTuning = z.infer<typeof helmTuningSchema>;

const autopilotLevelProfilesSchema = z
  .object({
    rookie: autopilotProfileSchema,
    veteran: autopilotProfileSchema,
    ace: autopilotProfileSchema
  })
  .strict();
export type AutopilotLevelProfiles = z.infer<typeof autopilotLevelProfilesSchema>;

/**
 * A set of level profiles per turret kind, because how the bot flies depends on
 * both and the two are not separable. Measured over three sweeps: eleven of the
 * sixteen fields want different values for a laser, a bullet and a missile -
 * including whether to orbit at all - while the level decides how well the same
 * flying is aimed and defended.
 */
export const autopilotTuningSchema = z
  .object({
    level: autopilotLevelSchema,
    profiles: z
      .object({
        kinetic: autopilotLevelProfilesSchema,
        laser: autopilotLevelProfilesSchema,
        missile: autopilotLevelProfilesSchema
      })
      .strict()
  })
  .strict();
export type AutopilotTuning = z.infer<typeof autopilotTuningSchema>;

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

    // --- Salvage: the only hull a crew wins back inside a run ---
    lootRepairAmount: positiveFinite,
    lootShieldAmount: positiveFinite,
    /** A boss always leaves this instead of rolling; the reward for a boss wave. */
    lootBossRepairAmount: positiveFinite,
    lootLifetimeTicks: positiveInteger,
    lootDropRadius: positiveFinite,
    /** Inside this distance salvage stops drifting and comes to the ship. */
    lootMagnetRadius: positiveFinite,
    lootMagnetAccelerationPerSecondSquared: positiveFinite,
    /** How fast the dead enemy's inherited motion bleeds off the drop. */
    lootDriftDampingPerSecond: nonNegativeFinite,
    /**
     * How long a cleared wave stays open while salvage is still on the field,
     * and the longer window a boss wave gets for its own repair.
     */
    lootWindowTicks: positiveInteger,
    lootBossWindowTicks: positiveInteger,
    /** Look of the ambient hazard; null keeps the display's own rock. */
    asteroidVisual: entityVisualSchema,
    missileInterceptScoreReward: nonNegativeFinite,
    /** The world size follows this; see `arenaRadiusSchema`. */
    arenaRadius: arenaRadiusSchema,
    cameraViewWidth: cameraViewWidthSchema,
    /** Parallax space background; the simulation never reads this section. */
    background: backgroundTuningSchema,
    /** Demo autopilot skill levels; the simulation never reads this section. */
    autopilot: autopilotTuningSchema,
    /** Enemy skill profiles. Unlike the autopilot, the simulation does read these. */
    enemySkill: enemySkillTuningSchema,
    /** Keyboard helm feel; the simulation never reads this section either. */
    helm: helmTuningSchema,

    // --- Player ship: hull and movement ---
    /** Look of the player hull; null keeps the display's own default silhouette. */
    spaceshipVisual: entityVisualSchema,
    spaceshipMaxHp: positiveFinite,
    spaceshipRadius: positiveFinite,
    spaceshipSpeedPerSecond: positiveFinite,
    spaceshipAccelerationPerSecondSquared: positiveFinite,
    spaceshipBrakingPerSecondSquared: positiveFinite,
    /** Share of the forward speed available in reverse; 1 makes it a second gear. */
    spaceshipReverseSpeedFactor: z.number().gt(0).max(1),
    headingMaxAngularSpeedPerSecond: positiveFinite,
    headingAngularAccelerationPerSecondSquared: positiveFinite,
    headingAngularBrakingPerSecondSquared: positiveFinite,

    // --- Player ship: gunner cannon ---
    friendlyProjectileDamage: positiveFinite,
    fireCooldownTicks: positiveInteger,
    projectileSpeedPerSecond: positiveFinite,
    projectileRadius: positiveFinite,
    projectileLifetimeMs: positiveInteger,
    turretMaxAngularSpeedPerSecond: positiveFinite,
    turretAngularAccelerationPerSecondSquared: positiveFinite,
    turretAngularBrakingPerSecondSquared: positiveFinite,

    /** Look of the cannon shot; null keeps the display's own primitive. */
    projectileVisual: entityVisualSchema,
    /** The gun itself, drawn over the hull and turning with the turret. */
    turretVisual: turretVisualSchema,
    /** The cannon runs hot too, so picking targets can beat firing at all of them. */
    cannonHeatCapacity: positiveFinite,
    cannonHeatPerShot: positiveFinite,
    cannonCoolingPerSecond: nonNegativeFinite,
    /** Heat it must cool below before it fires again; core caps it by capacity. */
    cannonRearmThreshold: nonNegativeFinite,

    // --- Player ship: nose machine gun ---
    mgDamage: positiveFinite,
    mgFireCooldownTicks: positiveInteger,
    mgProjectileSpeedPerSecond: positiveFinite,
    mgProjectileRadius: positiveFinite,
    /** Look of the nose gun's shot; null keeps the display's own primitive. */
    mgProjectileVisual: entityVisualSchema,
    mgHeatCapacity: positiveFinite,
    mgHeatPerShot: positiveFinite,
    mgCoolingPerSecond: nonNegativeFinite,
    /** Heat the gun must cool below before it fires again; core caps it by capacity. */
    mgRearmThreshold: nonNegativeFinite,
    /** How each barrel delivers damage; the numbers above are the same either way. */
    cannonWeaponKind: friendlyWeaponKindSchema,
    mgWeaponKind: friendlyWeaponKindSchema,
    /** Laser: how far the beam reaches, and how thick it is for a hit. */
    cannonLaserRange: positiveFinite,
    mgLaserRange: positiveFinite,
    laserBeamRadius: positiveFinite,
    /** Missile: how hard it turns, and the cone it picks a target from. */
    friendlyMissileTurnRatePerSecond: positiveFinite,
    friendlyMissileAcquireConeRadians: positiveFinite,

    // --- Player ship: shield ---
    shieldCapacity: positiveFinite,
    shieldDrainPerSecond: positiveFinite,
    shieldRechargePerSecond: positiveFinite,
    /**
     * Ticks the shield spends coming up, holding, and cooling. They are what
     * stop it being free to flick; zero on all three brings back the instant
     * toggle it had before.
     */
    shieldEngageTicks: nonNegativeInteger,
    shieldMinimumUpTicks: nonNegativeInteger,
    shieldCooldownTicks: nonNegativeInteger,
    /** Energy a drained shield wins back before it holds again. */
    shieldRearmEnergy: positiveFinite,
    shieldRadius: positiveFinite,
    shieldArcRadians: positiveFinite.max(Math.PI * 2),
    shieldMaxAngularSpeedPerSecond: positiveFinite,
    shieldAngularAccelerationPerSecondSquared: positiveFinite,
    shieldAngularBrakingPerSecondSquared: positiveFinite
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
