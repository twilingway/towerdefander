import { z } from "zod";

import { CREW_ROLES, crewRoleSchema } from "./crewRoles.ts";
import {
  ENEMY_ARCHETYPE_ID_PATTERN,
  MAX_ENEMY_ARCHETYPES,
  MAX_ENEMY_ARCHETYPE_ID_LENGTH
} from "./enemyKinds.ts";
import { FX_EVENT_EFFECT_IDS, FX_LOOP_EFFECT_IDS } from "./effectCatalogue.ts";
import { VISUAL_ASSET_IDS } from "./visualCatalog.ts";

export const BALANCE_FILE_VERSION = 45 as const;
/** File versions the store still knows how to migrate forward. */
export const LEGACY_BALANCE_FILE_VERSIONS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
  28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44
] as const;
export const MAX_ENEMY_WEAPONS = 4;
export const SPAWN_SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export const spawnSectorSchema = z.enum(SPAWN_SECTORS);
export type SpawnSector = z.infer<typeof spawnSectorSchema>;

export const FRIENDLY_WEAPON_KINDS = ["kinetic", "laser", "missile"] as const;
export const friendlyWeaponKindSchema = z.enum(FRIENDLY_WEAPON_KINDS);
export type FriendlyWeaponKind = z.infer<typeof friendlyWeaponKindSchema>;

export const ENEMY_WEAPON_KINDS = ["bullet", "missile", "laser"] as const;
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
export const fxEventEffectIdSchema = z.enum(FX_EVENT_EFFECT_IDS);
export const fxLoopEffectIdSchema = z.enum(FX_LOOP_EFFECT_IDS);

/**
 * What an archetype plays on each of its events. Every slot is optional, and an
 * empty one means "as it is now" rather than "nothing": a preset that names no
 * effect at all plays exactly as it did before the slots existed.
 */
export const enemyEventEffectsSchema = z
  .object({
    death: fxEventEffectIdSchema.optional(),
    hit: fxEventEffectIdSchema.optional(),
    shot: fxEventEffectIdSchema.optional()
  })
  .strict();
export type EnemyEventEffects = z.infer<typeof enemyEventEffectsSchema>;

/**
 * The crew's own two: the barrier its raised sector is drawn as, and the mark a
 * blocked shot leaves on it.
 *
 * Two lists rather than one, because the two slots are different kinds of
 * effect: the barrier is a loop and the mark is a one-shot. An empty slot means
 * "as it is now", so a hull nobody edited looks exactly as it did.
 */
export const shipEffectsSchema = z
  .object({
    shieldBand: fxLoopEffectIdSchema.optional(),
    shieldImpact: fxEventEffectIdSchema.optional()
  })
  .strict();
export type ShipEffects = z.infer<typeof shipEffectsSchema>;
export const MODEL_SCALE_MIN = 0.2;
export const MODEL_SCALE_MAX = 4;
const modelScaleSchema = z.number().min(MODEL_SCALE_MIN).max(MODEL_SCALE_MAX);
export const enemyVisualSchema = z
  .object({
    shape: visualAssetIdSchema,
    /** Drawn size relative to the hit radius; 1 means the model matches the hitbox. */
    modelScale: modelScaleSchema,
    showHealthBar: z.boolean(),
    /** Absent leaves the display's own rule; see `enemyEventEffectsSchema`. */
    effects: enemyEventEffectsSchema.optional()
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

const finite = z.number();
const positiveFinite = z.number().positive();
const nonNegativeFinite = z.number().nonnegative();
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** Zero is legal for the shield timings: it restores the old instant toggle. */
const nonNegativeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

function issue(context: z.RefinementCtx, path: PropertyKey[], message: string): void {
  context.addIssue({ code: "custom", path, message });
}

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
    reactionTicks: z.number().int().min(0).max(120),
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
    evadeHorizonTicks: z.number().int().min(0).max(120),

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
    /**
     * Ticks from the start of the wave to this group's first arrival. The wave
     * is a schedule: two groups with different starts arrive interleaved, and
     * the order they are written in decides nothing.
     */
    startDelayTicks: nonNegativeInteger.max(60_000),
    spawnIntervalTicks: positiveInteger.max(60_000),
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

/**
 * How the wave table is authored, as opposed to what it says. The server never
 * reads any of this: the generator does, and it lives here so an operator can
 * turn the campaign from the console instead of editing a script and waiting
 * for someone to run it.
 */
export const campaignAuthoringSchema = z
  .object({
    /** A wave may spend `base + growth * (n - 1)` on the ships it calls in. */
    budgetBase: positiveFinite,
    budgetGrowth: nonNegativeFinite,
    /**
     * The least of its own budget a boss wave still spends on the wave.
     *
     * A boss is paid for out of the wave's budget rather than added on top of
     * it - added on top, wave five cost 34 against a budget of 18.8 and wave
     * ten cost 52 against 29.8, and every measured run ended on a multiple of
     * five. But the early bosses cost most of their wave on their own, so
     * subtracting outright would leave an empty room with a boss in it; this
     * is the floor under the escort.
     */
    bossEscortShare: z.number().gt(0).max(1),
    /** Every n-th wave also drops rocks; they cost nothing and read as weather. */
    asteroidEveryWaves: positiveInteger,
    /** Enemy health is authored in cannon shots, so a hull change moves it all. */
    hpPerCannonShot: positiveFinite,
    hpScale: positiveFinite,
    /** Damage-a-second ceiling: `base + perSpawnCost * cost`, and a flat one for bosses. */
    damagePerSecondBase: nonNegativeFinite,
    damagePerSecondPerSpawnCost: nonNegativeFinite,
    bossDamagePerSecondCap: positiveFinite,
    /** Share of a beam's paper output that actually lands; it does not miss. */
    laserDamageShare: z.number().gt(0).max(1),
    /** How far the ship's own gun reaches, and what enemies may have against it. */
    shipReach: positiveFinite,
    maxEngagementShare: positiveFinite,
    maxStandoffShare: positiveFinite,
    /** Seconds between one group's arrival window and the next inside a wave. */
    groupStartStepSeconds: nonNegativeFinite,
    /** Seconds between two ships of one group, per family. */
    swarmIntervalSeconds: positiveFinite,
    lineIntervalSeconds: positiveFinite,
    heavyIntervalSeconds: positiveFinite,
    /**
     * Earliest the boss may appear. Only a floor: it waits for the field to be
     * cleared whatever this says.
     */
    bossFloorSeconds: nonNegativeFinite
  })
  .strict();
export type CampaignAuthoring = z.infer<typeof campaignAuthoringSchema>;

export const waveCampaignSchema = z
  .object({
    waves: z.array(waveDefinitionSchema).max(200).readonly(),
    director: directorTuningSchema,
    authoring: campaignAuthoringSchema
  })
  .strict();
export type WaveCampaign = z.infer<typeof waveCampaignSchema>;

/**
 * Skill levels of the bot, and no longer presentation-only.
 *
 * They used to be: one bot lived in the controller and played the demonstration
 * and the measured runs, while the room had a second, hard-coded one for a seat
 * nobody was in. There is one now, in the room, so these numbers reach a real
 * game - a crew of one has its sector flown by them, and an empty seat is flown
 * by them too. The simulation still never reads the section: the room does, and
 * hands the policy what it decides.
 */
export const AUTOPILOT_LEVELS = ["rookie", "veteran", "ace"] as const;
export const autopilotLevelSchema = z.enum(AUTOPILOT_LEVELS);
export type AutopilotLevel = z.infer<typeof autopilotLevelSchema>;

export const autopilotProfileSchema = z
  .object({
    // --- Accuracy and reaction ---
    /** Ticks a fresh target must persist before the bot commits to it. */
    reactionTicks: z.number().int().min(0).max(120),
    /** Ticks between target re-rankings; longer means a more sluggish pilot. */
    retargetIntervalTicks: z.number().int().min(1).max(180),
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
    /**
     * Where the pilot wants to stand, as a share of how far its own barrel
     * carries. The distance below is the floor under it: closer than that the
     * hull does not want to be, whatever the share works out to. Zero leaves
     * the floor in charge, which is how every profile behaved before the share
     * existed.
     */
    standoffShare: z.number().min(0).max(1.5),
    standoffDistance: z.number().min(200).max(2000),
    /** How far ahead the pilot looks for a hit the shield will not cover. */
    evadeHorizonTicks: z.number().int().min(0).max(120),

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
    shieldLeadTicks: z.number().int().min(0).max(120),
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
    rotateInPlaceThrottle: z.number().min(0.005).max(0.2),
    /*
     * Stick geometry, for the panels that have one. Shares of the stick radius
     * rather than pixels: the ring is sized by the viewport, so a pixel figure
     * would mean a different thing on every phone.
     */
    /** How far the drive stick travels before it asks for any movement at all. */
    driveDeadzoneShare: z.number().min(0).max(0.5),
    /** The same for the aim stick, which is pushed more gently and more often. */
    aimDeadzoneShare: z.number().min(0).max(0.5),
    /**
     * Share of the screen width whose left edge begins a drive. The stick keeps
     * its anchor at the drawn ring either way — what widens is the area a thumb
     * may land in to grab it, which is what makes a stick findable without
     * looking at it.
     */
    driveZoneShare: z.number().min(0.2).max(0.8),
    /**
     * How far ahead of the ship the aim stick projects its point, as a share of
     * the larger view dimension. It decides how much of the frame a full push
     * reaches, so it belongs with the frame and not with the arena.
     */
    aimProjectionShare: z.number().min(0.1).max(1),
    /**
     * Below this the stick is not steering, it is shaking. A thumb is never
     * still: two pixels of slip on the ring is a couple of degrees of commanded
     * heading, and the hull follows it faithfully — measured in the lab at 4.58
     * degrees of swing, with the gun riding the hull and trembling with it.
     */
    headingDeadbandRadians: z.number().min(0).max(0.35),
    /** Ease on what survives the dead band. Zero sends the raw bearing. */
    headingFilterSeconds: z.number().min(0).max(0.5),
    /**
     * How far off the gun must be before the cockpit asks for a full traverse.
     * The turret's answer to `headingLeadRadians`, and the same idea: the stick
     * names a direction, the rate is the distance to it.
     */
    turretLeadRadians: z.number().min(0.05).max(1.5)
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

// --- Ship archetypes: the hull a run is played on, and its module tree ---

/**
 * Fields a module may address. It mirrors `MODULE_TARGET_FIELDS` in
 * `game-core`, which owns the stat engine; a test in the server package, which
 * sees both, asserts the two lists are identical.
 *
 * Duplicated rather than imported because the two packages do not depend on
 * each other, and the duplication buys something: a target the operator
 * mistyped is refused at the path it sits on, in the console, instead of
 * quietly doing nothing for a whole run.
 */
export const MODULE_TARGET_FIELDS = [
  "spaceshipMaxHp",
  "spaceshipRadius",
  "spaceshipSpeedPerSecond",
  "spaceshipAccelerationPerSecondSquared",
  "spaceshipBrakingPerSecondSquared",
  "spaceshipReverseSpeedFactor",
  "headingMaxAngularSpeedPerSecond",
  "headingAngularAccelerationPerSecondSquared",
  "friendlyProjectileDamage",
  "fireCooldownTicks",
  "projectileSpeedPerSecond",
  "projectileRadius",
  "projectileLifetimeMs",
  "turretMaxAngularSpeedPerSecond",
  "turretAngularAccelerationPerSecondSquared",
  "turretAngularBrakingPerSecondSquared",
  "cannonHeatCapacity",
  "cannonHeatPerShot",
  "cannonCoolingPerSecond",
  "cannonRearmThreshold",
  "mgDamage",
  "mgFireCooldownTicks",
  "mgProjectileSpeedPerSecond",
  "mgProjectileRadius",
  "mgHeatCapacity",
  "mgHeatPerShot",
  "mgCoolingPerSecond",
  "mgRearmThreshold",
  "cannonLaserRange",
  "mgLaserRange",
  "laserBeamRadius",
  "friendlyMissileTurnRatePerSecond",
  "friendlyMissileAcquireConeRadians",
  "shieldCapacity",
  "shieldDrainPerSecond",
  "shieldRechargePerSecond",
  "shieldEngageTicks",
  "shieldMinimumUpTicks",
  "shieldCooldownTicks",
  "shieldRearmEnergy",
  "shieldArcRadians",
  "shieldMaxAngularSpeedPerSecond",
  "shieldAngularAccelerationPerSecondSquared",
  "shieldAngularBrakingPerSecondSquared"
] as const;
export const moduleTargetFieldSchema = z.enum(MODULE_TARGET_FIELDS);
export type ModuleTargetField = z.infer<typeof moduleTargetFieldSchema>;

/**
 * Every numeric field of the ship, including the two a module may not touch.
 *
 * A hull may: the two are excluded from modules because clients receive them
 * once per run and a mid-run change would leave the published value stale, and
 * a hull is resolved before the run starts. A bigger hull that could not carry
 * a bigger shield would be a hull with the shield drawn inside it.
 */
export const SHIP_STAT_FIELDS = [
  ...MODULE_TARGET_FIELDS,
  "shieldRadius",
  "headingAngularBrakingPerSecondSquared"
] as const;
export const shipStatFieldSchema = z.enum(SHIP_STAT_FIELDS);
export type ShipStatField = z.infer<typeof shipStatFieldSchema>;

/** Additions sum, percents sum with each other, multipliers multiply. */
export const SHIP_STAT_OPS = ["add", "percent", "multiply"] as const;
export const shipStatOpSchema = z.enum(SHIP_STAT_OPS);
export type ShipStatOp = z.infer<typeof shipStatOpSchema>;

export const shipStatEffectSchema = z
  .object({
    target: moduleTargetFieldSchema,
    op: shipStatOpSchema,
    /** Free-signed: a module is allowed to cost something to gain something. */
    value: z.number()
  })
  .strict();
export type ShipStatEffectTuning = z.infer<typeof shipStatEffectSchema>;

/**
 * What each target is called where a person reads it: on an intermission card
 * and in the console's module editor. The caption a crew sees is assembled from
 * these and the effect's own number, so the preset never states a number twice
 * and a label can never promise something the effect does not do.
 */
export const MODULE_TARGET_LABELS: Readonly<Record<ModuleTargetField, string>> = {
  spaceshipMaxHp: "Прочность корпуса",
  spaceshipRadius: "Радиус корпуса",
  spaceshipSpeedPerSecond: "Скорость",
  spaceshipAccelerationPerSecondSquared: "Ускорение",
  spaceshipBrakingPerSecondSquared: "Торможение",
  spaceshipReverseSpeedFactor: "Задний ход",
  headingMaxAngularSpeedPerSecond: "Скорость разворота",
  headingAngularAccelerationPerSecondSquared: "Отзывчивость разворота",
  friendlyProjectileDamage: "Урон пушки",
  fireCooldownTicks: "Перезарядка пушки",
  projectileSpeedPerSecond: "Скорость снаряда",
  projectileRadius: "Калибр снаряда",
  projectileLifetimeMs: "Дальность снаряда",
  turretMaxAngularSpeedPerSecond: "Скорость поворота башни",
  turretAngularAccelerationPerSecondSquared: "Отзывчивость башни",
  turretAngularBrakingPerSecondSquared: "Торможение башни",
  cannonHeatCapacity: "Запас нагрева пушки",
  cannonHeatPerShot: "Нагрев пушки за выстрел",
  cannonCoolingPerSecond: "Охлаждение пушки",
  cannonRearmThreshold: "Порог готовности пушки",
  mgDamage: "Урон носового ствола",
  mgFireCooldownTicks: "Перезарядка носового ствола",
  mgProjectileSpeedPerSecond: "Скорость носовой пули",
  mgProjectileRadius: "Калибр носовой пули",
  mgHeatCapacity: "Запас нагрева носа",
  mgHeatPerShot: "Нагрев носа за выстрел",
  mgCoolingPerSecond: "Охлаждение носа",
  mgRearmThreshold: "Порог готовности носа",
  cannonLaserRange: "Дальность луча пушки",
  mgLaserRange: "Дальность носового луча",
  laserBeamRadius: "Толщина луча",
  friendlyMissileTurnRatePerSecond: "Доворот ракеты",
  friendlyMissileAcquireConeRadians: "Конус захвата ракеты",
  shieldCapacity: "Ёмкость щита",
  shieldDrainPerSecond: "Расход щита",
  shieldRechargePerSecond: "Восстановление щита",
  shieldEngageTicks: "Подъём щита",
  shieldMinimumUpTicks: "Минимальная выдержка щита",
  shieldCooldownTicks: "Пауза щита",
  shieldRearmEnergy: "Энергия повторного подъёма",
  shieldArcRadians: "Сектор щита",
  shieldMaxAngularSpeedPerSecond: "Скорость поворота щита",
  shieldAngularAccelerationPerSecondSquared: "Отзывчивость щита",
  shieldAngularBrakingPerSecondSquared: "Торможение щита"
};

const TICK_SECONDS = 0.05;
/** Targets whose stored unit would read as noise on a card. */
const DEGREE_TARGETS: readonly ModuleTargetField[] = [
  "shieldArcRadians",
  "friendlyMissileAcquireConeRadians"
];
const TICK_TARGETS: readonly ModuleTargetField[] = [
  "fireCooldownTicks",
  "mgFireCooldownTicks",
  "shieldEngageTicks",
  "shieldMinimumUpTicks",
  "shieldCooldownTicks"
];

function signed(value: number, unit: string): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : "−"}${String(Math.abs(rounded))}${unit}`;
}

/** One effect as a person reads it. A share always reads as a percentage. */
export function formatShipStatEffect(effect: ShipStatEffectTuning): string {
  const name = MODULE_TARGET_LABELS[effect.target];
  if (effect.op === "percent") return `${name} ${signed(effect.value * 100, "%")}`;
  // A multiplier is a share of what was there: 0.9 is a tenth off.
  if (effect.op === "multiply") return `${name} ${signed((effect.value - 1) * 100, "%")}`;
  if (DEGREE_TARGETS.includes(effect.target))
    return `${name} ${signed((effect.value * 180) / Math.PI, "°")}`;
  if (TICK_TARGETS.includes(effect.target))
    return `${name} ${signed(effect.value * TICK_SECONDS, " с")}`;
  if (effect.target === "projectileLifetimeMs")
    return `${name} ${signed(effect.value / 1000, " с")}`;
  return `${name} ${signed(effect.value, "")}`;
}

/** What a module does, in one line, for the card and for the console preview. */
export function summariseModuleEffects(effects: readonly ShipStatEffectTuning[]): string {
  return effects.map(formatShipStatEffect).join(", ");
}

export const MAX_MODULE_EFFECTS = 4;
export const shipModuleIdSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(ENEMY_ARCHETYPE_ID_PATTERN, "Module id must start with a lowercase letter.");
export type ShipModuleId = z.infer<typeof shipModuleIdSchema>;

/**
 * One card of the tree. The operator names it and says what it does; the number
 * in the caption clients show is assembled from the effects, so the two cannot
 * drift apart on the second day of authoring.
 */
export const shipModuleSchema = z
  .object({
    id: shipModuleIdSchema,
    label: z.string().min(1).max(48),
    /** Whose card this is. Authoring metadata: any seat may vote for any card. */
    role: crewRoleSchema,
    effects: z.array(shipStatEffectSchema).min(1).max(MAX_MODULE_EFFECTS).readonly()
  })
  .strict();
export type ShipModule = z.infer<typeof shipModuleSchema>;

/**
 * The shape of the tree belongs to the code, not to the preset: the operator
 * decides what stands in a tier, never how many tiers there are or how wide
 * they get. Narrow early tiers make the first waves readable to a new crew;
 * the width arrives once the crew knows what the ship is short of.
 */
export const MODULE_TIER_WIDTHS = [1, 2, 2, 2, 2, 3, 3, 3, 4, 4] as const;
export const MODULE_TIER_COUNT = MODULE_TIER_WIDTHS.length;
export const MAX_MODULE_TIER_WIDTH = 4;
export const MODULES_PER_ARCHETYPE = MODULE_TIER_WIDTHS.reduce((sum, width) => sum + width, 0);

const shipModuleTierSchema = z.array(shipModuleSchema).min(1).max(MAX_MODULE_TIER_WIDTH).readonly();
export type ShipModuleTier = z.infer<typeof shipModuleTierSchema>;

/**
 * What a hull changes about the base ship. Sparse on purpose: an archetype
 * states its differences, so a base value edited in the flat block reaches
 * every hull that did not deliberately override it.
 */
export const shipArchetypeOverridesSchema = z
  .object({
    stats: z.partialRecord(shipStatFieldSchema, finite),
    cannonWeaponKind: friendlyWeaponKindSchema.nullable(),
    mgWeaponKind: friendlyWeaponKindSchema.nullable()
  })
  .strict();
export type ShipArchetypeOverrides = z.infer<typeof shipArchetypeOverridesSchema>;

export const MAX_SHIP_ARCHETYPES = 6;
export const shipArchetypeIdSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(ENEMY_ARCHETYPE_ID_PATTERN, "Ship id must start with a lowercase letter.");
export type ShipArchetypeId = z.infer<typeof shipArchetypeIdSchema>;

export const shipArchetypeSchema = z
  .object({
    label: z.string().min(1).max(48),
    description: z.string().min(1).max(240),
    /** Look of the hull; null keeps the display's own default silhouette. */
    visual: entityVisualSchema,
    /** Barrier and impact effects for this hull's shield; empty means as it is. */
    effects: shipEffectsSchema.optional(),
    /**
     * Informational until runs remember anything between themselves: shown
     * beside the hull so a locked ship does not appear out of nowhere later.
     */
    unlockedAtWave: positiveInteger,
    overrides: shipArchetypeOverridesSchema,
    tiers: z.array(shipModuleTierSchema).length(MODULE_TIER_COUNT).readonly(),
    /**
     * What a crew that bought the whole tree is offered from then on. Its
     * modules are repeatable, so they carry percentages and additions only.
     */
    endlessTier: shipModuleTierSchema
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    const tiers = [...value.tiers, value.endlessTier];
    tiers.forEach((tier, index) => {
      const width = MODULE_TIER_WIDTHS[index];
      if (width !== undefined && tier.length !== width) {
        issue(
          context,
          ["tiers", index],
          `Tier ${String(index + 1)} must hold exactly ${String(width)} modules.`
        );
      }
      const roles = new Set(tier.map(({ role }) => role));
      const requiredRoles = tier.length >= 3 ? CREW_ROLES.length : Math.min(2, tier.length);
      if (roles.size < requiredRoles) {
        issue(
          context,
          ["tiers", index],
          `A tier of ${String(tier.length)} must cover ${String(requiredRoles)} roles, not ${String(roles.size)}.`
        );
      }
      tier.forEach((module, moduleIndex) => {
        if (seen.has(module.id))
          issue(context, ["tiers", index, moduleIndex, "id"], "Module ids must be unique.");
        seen.add(module.id);
      });
    });
  });
export type ShipArchetype = z.infer<typeof shipArchetypeSchema>;

/**
 * What a display is told about the hulls before it joins a room.
 *
 * Deliberately narrow: a name, a look and the wave the hull is meant to open
 * at. No stats and no tree, because this is the only balance surface that
 * answers without a password, and picking a ship does not require knowing how
 * strong it is.
 */
export const publicShipSchema = z
  .object({
    id: shipArchetypeIdSchema,
    label: z.string().min(1).max(48),
    description: z.string().min(1).max(240),
    visual: entityVisualSchema,
    unlockedAtWave: positiveInteger,
    /**
     * The hull's tree, so a display can draw the whole path a crew is walking.
     * It is published here rather than on the wire because it never changes
     * inside a run: one fetch a page, not one field a tick.
     */
    tiers: z.array(z.array(shipModuleSchema).readonly()).readonly(),
    endlessTier: z.array(shipModuleSchema).readonly()
  })
  .strict();
export type PublicShip = z.infer<typeof publicShipSchema>;

export const publicShipCatalogueSchema = z
  .object({
    ships: z.array(publicShipSchema).min(1).max(MAX_SHIP_ARCHETYPES),
    defaultShipId: shipArchetypeIdSchema
  })
  .strict();
export type PublicShipCatalogue = z.infer<typeof publicShipCatalogueSchema>;

export const shipArchetypeTableSchema = z
  .record(shipArchetypeIdSchema, shipArchetypeSchema)
  .superRefine((value, context) => {
    const ids = Object.keys(value);
    if (ids.length === 0) {
      context.addIssue({ code: "custom", message: "Catalogue must hold at least one hull." });
    }
    if (ids.length > MAX_SHIP_ARCHETYPES) {
      context.addIssue({
        code: "custom",
        message: `Catalogue cannot hold more than ${String(MAX_SHIP_ARCHETYPES)} hulls.`
      });
    }
  });

/**
 * One spawn mark, in arena coordinates: the centre of the disc is the origin,
 * which is the frame the arena simulation itself is written in.
 *
 * The operator moves these, so they are data rather than a formula. The seed
 * still decides who stands where; this decides where the marks are.
 */
export const arenaSpawnMarkSchema = z.object({ x: z.number(), y: z.number() }).strict();
export type ArenaSpawnMark = z.infer<typeof arenaSpawnMarkSchema>;

export const ARENA_SPAWN_MARKS = 16;

export const ARENA_ZONE_GRID_MIN = 2;
export const ARENA_ZONE_GRID_MAX = 20;

export const arenaTuningSchema = z
  .object({
    /** Exactly one mark per seat: sixteen hulls, sixteen places to put them. */
    spawnMarks: z.array(arenaSpawnMarkSchema).length(ARENA_SPAWN_MARKS).readonly(),
    /**
     * The sheet the field closes in, as a grid over the arena square. The
     * rectangles are sized from the radius, so widening the arena widens them
     * rather than adding more of them - the number of closures a match takes is
     * what this decides.
     */
    zoneColumns: z.number().int().min(ARENA_ZONE_GRID_MIN).max(ARENA_ZONE_GRID_MAX),
    zoneRows: z.number().int().min(ARENA_ZONE_GRID_MIN).max(ARENA_ZONE_GRID_MAX),
    /**
     * How long a match may run before it is called.
     *
     * It has to be read against the sheet rather than on its own: the field
     * takes one closure per interval, so a match shorter than the sheet needs
     * simply ends with most of the ground still safe. The console does that
     * arithmetic beside the field.
     */
    matchTickLimit: positiveInteger,
    /**
     * What a match does to the ship the campaign is balanced around.
     *
     * Sixteen guns on one field is a density the campaign never has: at
     * campaign numbers a match was over in twenty seconds, before the field had
     * closed once. So the hull is multiplied and the shot is divided rather
     * than the arena forking its own ship - one ship, two fights, and the
     * difference between them stated as two numbers the operator can move.
     */
    hullScaling: positiveFinite,
    damageScaling: positiveFinite,
    /** How often the next batch of zones is picked and turns amber. */
    zoneIntervalTicks: positiveInteger,
    /**
     * Rectangles taken on each beat.
     *
     * One at a time is a squeeze nobody feels: a ten by ten sheet is
     * eighty-eight rectangles, and at one apiece a match ends with most of the
     * field still open. A handful at a time is what turns the sheet into a wall
     * that visibly moves inward.
     */
    zonesPerClosure: z
      .number()
      .int()
      .min(1)
      .max(ARENA_ZONE_GRID_MAX * ARENA_ZONE_GRID_MAX),
    /** How long amber lasts before that zone starts killing. */
    zoneWarningTicks: positiveInteger,
    /** The beat a closed zone bites on. */
    zoneDamageIntervalTicks: positiveInteger,
    /**
     * Beats a full hull survives in a closed zone.
     *
     * Stated as a count rather than as a share because that is the thing being
     * decided - "six bites and you are gone" - and the share the simulation
     * takes each beat is one over it, of the hull's maximum. A ship that
     * repairs between beats therefore lives longer, which is the point.
     */
    zoneBitesToKill: z.number().int().min(1).max(60)
  })
  .strict();
export type ArenaTuning = z.infer<typeof arenaTuningSchema>;

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
    /**
     * How near an enemy has to be for a crew with no shield operator to raise
     * the sector, in world units. Zero means "as far as that enemy can shoot
     * from", which is what the autopilot did before this was a setting - and is
     * still the sensible default, because a sniper's reach is exactly the
     * distance a crew wants to close under cover.
     */
    shieldAutopilotRaiseRange: nonNegativeFinite,
    asteroidSpawnCost: positiveInteger,
    asteroidScoreReward: nonNegativeFinite,
    asteroidCreditReward: nonNegativeFinite,

    // --- Salvage: the only hull a crew wins back inside a run ---
    lootRepairShare: z.number().min(0).max(1),
    lootShieldAmount: positiveFinite,
    /**
     * A boss always leaves a repair instead of rolling, sized as a share of the
     * hull it is repairing rather than as a flat number: the reward for a boss
     * wave has to mean the same thing on a 400-hp hull and on a 720-hp one, and
     * a hull grown by modules must not outgrow it. One is a full repair.
     */
    lootBossRepairShare: z.number().min(0).max(1),
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
    /** Bot skill levels; the room reads this section, the simulation does not. */
    autopilot: autopilotTuningSchema,
    /** Enemy skill profiles. Unlike the autopilot, the simulation does read these. */
    enemySkill: enemySkillTuningSchema,
    /** Keyboard helm feel; the simulation never reads this section either. */
    helm: helmTuningSchema,
    /** Where an arena match puts its sixteen hulls. Only the arena reads it. */
    arena: arenaTuningSchema,

    // --- Ship archetypes: which hull a run is played on ---
    /** Hulls a room may be created with, each with its own ten-tier tree. */
    shipArchetypes: shipArchetypeTableSchema,
    /** The hull a room gets when its creator names none. */
    defaultShipArchetypeId: shipArchetypeIdSchema,

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
    /**
     * Whether the hull carries the gun. Unlike `helm` beside it, the simulation
     * does read this one: it changes the trusted step, not what a client sends.
     */
    turretMountedOnHull: z.boolean(),

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
    if (!Object.hasOwn(value.shipArchetypes, value.defaultShipArchetypeId)) {
      issue(
        context,
        ["defaultShipArchetypeId"],
        "Default hull must be one of the catalogue hulls."
      );
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
