/**
 * Saved presets outlive the shape they were written in: every field added since
 * a file was saved is backfilled here, so an operator never loses a wave table
 * to a new setting.
 */

import {
  AUTOPILOT_LEVELS,
  type AutopilotLevelProfiles,
  ENEMY_SKILL_LEVELS,
  BALANCE_FILE_VERSION,
  FRIENDLY_WEAPON_KINDS,
  FALLBACK_VISUAL_ASSET_ID,
  LEGACY_BALANCE_FILE_VERSIONS,
  type BalanceTuning
} from "@spaceship-defender/protocol";

import { createDefaultTuning } from "./store.js";

type LegacyRecord = Record<string, unknown>;
function isRecord(value: unknown): value is LegacyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(source: LegacyRecord, key: string): LegacyRecord {
  const value = source[key];
  return isRecord(value) ? value : {};
}

function readArray(source: LegacyRecord, key: string): readonly unknown[] {
  const value = source[key];
  return Array.isArray(value) ? value : [];
}

function migrateEntry(entry: unknown): unknown {
  if (!isRecord(entry)) return entry;
  const sector = entry.sector;
  const migrated: LegacyRecord = {
    ...entry,
    sectors: entry.sectors ?? (typeof sector === "string" ? [sector] : []),
    // Version 30 played a wave as a queue, so every group started at zero and
    // waited its turn. Keeping that start preserves the wave as it was written.
    startDelayTicks: entry.startDelayTicks ?? 0,
    hpMultiplier: entry.hpMultiplier ?? null,
    tempoMultiplier: entry.tempoMultiplier ?? null
  };
  delete migrated.sector;
  return migrated;
}

function migrateWave(wave: unknown): unknown {
  if (!isRecord(wave)) return wave;
  return { ...wave, entries: readArray(wave, "entries").map(migrateEntry) };
}

/**
 * Version 7 named silhouettes from a fixed set of eight the display drew in code.
 * Version 8 replaced that set with the shared visual catalogue, so each old name
 * maps to the asset closest to the shape it used to draw; `dart` deliberately
 * goes to `ship-arrowhead` rather than `ship-dart`, which the player hull uses.
 */
const LEGACY_SHAPE_ASSETS: Readonly<Record<string, string>> = {
  arrowhead: "ship-spear",
  block: "ship-blockfrigate",
  diamond: "ship-diamond",
  dart: "ship-arrowhead",
  hexagon: "ship-hexcorvette",
  cross: "station-crossdock",
  ring: "station-ring",
  spike: "station-starrelay"
};

/** The gunship's agility: the middle of the built-in range, used as a fallback. */
const DEFAULT_ENEMY_TURN_RATE = (2 * Math.PI) / 3;
/**
 * The level whose knobs reproduce the enemy that predated the profiles, so a
 * catalogue written before this setting existed plays exactly as it did.
 */
const DEFAULT_ENEMY_COMBAT_SKILL = "rookie";
/** What an operator's own archetype inherits when salvage arrives. */
const DEFAULT_LOOT_CHANCE = 0.22;
/** Every salvage knob, so the migration cannot forget one silently. */
/** Every weapon-kind knob, so the migration cannot forget one silently. */
const WEAPON_KIND_FIELDS = [
  "cannonWeaponKind",
  "mgWeaponKind",
  "cannonLaserRange",
  "mgLaserRange",
  "laserBeamRadius",
  "friendlyMissileTurnRatePerSecond",
  "friendlyMissileAcquireConeRadians"
] as const satisfies readonly (keyof BalanceTuning)[];

const LOOT_FIELDS = [
  "lootRepairShare",
  "lootShieldAmount",
  "lootBossRepairShare",
  "lootLifetimeTicks",
  "lootDropRadius",
  "lootMagnetRadius",
  "lootMagnetAccelerationPerSecondSquared",
  "lootDriftDampingPerSecond",
  "lootWindowTicks",
  "lootBossWindowTicks"
] as const satisfies readonly (keyof BalanceTuning)[];

/** Simulation step in seconds; the balance file stores weapon lifetimes in ticks. */
const TICK_SECONDS = 0.05;
/** A shot at the very edge of its reach expires on arrival, so aim shorter. */
const MIGRATED_RANGE_SHARE = 0.7;

/**
 * Version 6 weapons had no range and opened fire from anywhere in the arena.
 * Give a migrated weapon most of its own projectile reach instead of a shared
 * default, so an operator preset keeps shooting from a distance its bullets
 * actually cover.
 */
function migrateWeapon(weapon: unknown): unknown {
  if (!isRecord(weapon)) return weapon;
  const reach =
    Number(weapon.projectileSpeedPerSecond) * Number(weapon.projectileLifetimeTicks) * TICK_SECONDS;
  return {
    ...weapon,
    engagementRange:
      weapon.engagementRange ??
      (Number.isFinite(reach) && reach > 0 ? Math.round(reach * MIGRATED_RANGE_SHARE) : 1200),
    // Version 7 had no look for shots; the display default is what they had.
    visual: weapon.visual ?? null
  };
}

/**
 * Carries a version 7 visual onto the catalogue: the silhouette becomes an asset
 * id, and the two colours go away because the asset paints itself.
 */
function migrateVisual(visual: LegacyRecord): LegacyRecord {
  const shape = typeof visual.shape === "string" ? visual.shape : "";
  const migrated: LegacyRecord = {
    ...visual,
    shape: LEGACY_SHAPE_ASSETS[shape] ?? (shape.length > 0 ? shape : FALLBACK_VISUAL_ASSET_ID),
    modelScale: visual.modelScale ?? 1
  };
  delete migrated.color;
  delete migrated.outline;
  return migrated;
}

function migrateArchetype(kind: string, archetype: unknown, defaults: BalanceTuning): unknown {
  if (!isRecord(archetype)) return archetype;
  const known = defaults.enemyArchetypes[kind];
  const singleWeapon = archetype.weapon;
  const visual = isRecord(archetype.visual) ? archetype.visual : undefined;
  const weapons =
    archetype.weapons ?? (singleWeapon === undefined ? known?.weapons : [singleWeapon]);
  const migrated: LegacyRecord = {
    ...archetype,
    // Version 10 and earlier turned an enemy hull instantly, so a document from
    // it has no agility at all. Built-in archetypes get their own numbers back;
    // an operator's own archetype inherits the gunship's, which is the middle
    // of the range and the value the console offers for a new entry.
    turnRatePerSecond:
      archetype.turnRatePerSecond ?? known?.turnRatePerSecond ?? DEFAULT_ENEMY_TURN_RATE,
    turnAccelerationPerSecondSquared:
      archetype.turnAccelerationPerSecondSquared ??
      known?.turnAccelerationPerSecondSquared ??
      DEFAULT_ENEMY_TURN_RATE * 2,
    turnBrakingPerSecondSquared:
      archetype.turnBrakingPerSecondSquared ??
      known?.turnBrakingPerSecondSquared ??
      DEFAULT_ENEMY_TURN_RATE * 3,
    combatSkill: archetype.combatSkill ?? known?.combatSkill ?? DEFAULT_ENEMY_COMBAT_SKILL,
    weapons: Array.isArray(weapons) ? weapons.map(migrateWeapon) : weapons,
    visual:
      visual === undefined
        ? (known?.visual ?? {
            shape: FALLBACK_VISUAL_ASSET_ID,
            modelScale: 1,
            showHealthBar: false
          })
        : migrateVisual(visual),
    label: archetype.label ?? known?.label ?? kind,
    // Version 24 and earlier had no salvage at all. A built-in archetype gets
    // its own drop chance back; an operator's own inherits the gunship's.
    lootChance: archetype.lootChance ?? known?.lootChance ?? DEFAULT_LOOT_CHANCE
  };
  delete migrated.weapon;
  return migrated;
}

/**
 * Version 8 kept the whole player ship in code, so a document from it has none
 * of these fields. Filling them from the built-in defaults is what keeps such a
 * preset playing with the exact numbers it played with before.
 */
const PLAYER_SHIP_FIELDS = [
  "spaceshipMaxHp",
  "spaceshipRadius",
  "spaceshipSpeedPerSecond",
  "spaceshipAccelerationPerSecondSquared",
  "spaceshipBrakingPerSecondSquared",
  "spaceshipReverseSpeedFactor",
  "headingMaxAngularSpeedPerSecond",
  "headingAngularAccelerationPerSecondSquared",
  "headingAngularBrakingPerSecondSquared",
  "friendlyProjectileDamage",
  "fireCooldownTicks",
  "projectileSpeedPerSecond",
  "projectileRadius",
  "projectileLifetimeMs",
  "turretMaxAngularSpeedPerSecond",
  "turretAngularAccelerationPerSecondSquared",
  "turretAngularBrakingPerSecondSquared",
  "projectileVisual",
  "turretVisual",
  "mgProjectileVisual",
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
  "shieldCapacity",
  "shieldDrainPerSecond",
  "shieldRechargePerSecond",
  "shieldEngageTicks",
  "shieldMinimumUpTicks",
  "shieldCooldownTicks",
  "shieldRearmEnergy",
  "shieldRadius",
  "shieldArcRadians",
  "shieldMaxAngularSpeedPerSecond",
  "shieldAngularAccelerationPerSecondSquared",
  "shieldAngularBrakingPerSecondSquared"
] as const satisfies readonly (keyof BalanceTuning)[];

/**
 * The gun gained a pivot after operators already had one chosen, and it lives
 * inside the visual rather than beside it, so the flat field list cannot fill
 * it. A missing pivot is no offset at all, which is what it drew with before.
 */
function migrateTurretVisual(saved: unknown): unknown {
  if (!isRecord(saved)) return saved ?? null;
  return { mountX: 0, mountY: 0, pivotX: 0, pivotY: 0, ...saved };
}

function migratePlayerShip(tuning: LegacyRecord, defaults: BalanceTuning): LegacyRecord {
  const migrated: LegacyRecord = { ...tuning, spaceshipVisual: tuning.spaceshipVisual ?? null };
  // Version 23 stated the re-arm mark as a share of the battery, which made an
  // upgrade to the battery lengthen the wait. A leftover key would fail the
  // strict schema and take the operator's waves with it.
  delete migrated.shieldRearmEnergyFraction;
  // Version 29 sized the boss repair in hit points; version 30 sizes it as a
  // share of the hull. Same story as the fraction above: a leftover key fails
  // the strict schema, and the whole preset — waves included — goes with it.
  delete migrated.lootBossRepairAmount;
  // Version 31 sized the ordinary repair in hit points too. Same trap: the
  // leftover key fails the strict schema and the waves go with it.
  delete migrated.lootRepairAmount;
  for (const field of PLAYER_SHIP_FIELDS) {
    migrated[field] = tuning[field] ?? defaults[field];
  }
  // After the flat pass, which would otherwise put the saved gun back exactly
  // as it was found — pivot and all — and undo the fill below.
  migrated.turretVisual = migrateTurretVisual(migrated.turretVisual);
  return migrated;
}

/**
 * Fills the autopilot section level by level rather than wholesale, so a
 * document that already carries one hand-tuned profile keeps it while the
 * others arrive from defaults.
 */
function migrateAutopilot(tuning: LegacyRecord, defaults: BalanceTuning): unknown {
  const autopilot = readRecord(tuning, "autopilot");
  const saved = readRecord(autopilot, "profiles");
  // Version 27 and earlier kept one set of level profiles for every turret;
  // version 28 keeps a set per kind. A document from before the split has its
  // one set copied into all three, which is exactly the bot it described.
  const flat = AUTOPILOT_LEVELS.some((level) => isRecord(saved[level]));
  return {
    level: autopilot.level ?? defaults.autopilot.level,
    profiles: Object.fromEntries(
      FRIENDLY_WEAPON_KINDS.map((kind) => [
        kind,
        migrateAutopilotLevels(
          flat ? saved : readRecord(saved, kind),
          defaults.autopilot.profiles[kind]
        )
      ])
    )
  };
}

/**
 * Field by field inside each level, never a saved level carried over whole: a
 * profile saved before a knob existed must gain it, not fail the strict schema
 * and take the operator's waves down with it.
 */
function migrateAutopilotLevels(saved: LegacyRecord, defaults: AutopilotLevelProfiles): unknown {
  return Object.fromEntries(
    AUTOPILOT_LEVELS.map((level) => {
      const profile = saved[level];
      return [level, isRecord(profile) ? { ...defaults[level], ...profile } : defaults[level]];
    })
  );
}

/**
 * Field by field inside each level, never a saved level carried over whole: a
 * profile written before a knob existed has to gain it, and carrying the level
 * over whole is exactly what once failed the strict schema and took an
 * operator's wave table down with it.
 */
function migrateEnemySkill(tuning: LegacyRecord, defaults: BalanceTuning): unknown {
  const enemySkill = readRecord(tuning, "enemySkill");
  const profiles = readRecord(enemySkill, "profiles");
  return {
    offset: enemySkill.offset ?? defaults.enemySkill.offset,
    profiles: Object.fromEntries(
      ENEMY_SKILL_LEVELS.map((level) => {
        const saved = profiles[level];
        return [
          level,
          isRecord(saved)
            ? { ...defaults.enemySkill.profiles[level], ...saved }
            : defaults.enemySkill.profiles[level]
        ];
      })
    )
  };
}

/**
 * Fills the helm section field by field and drops the retired counter angle: a
 * leftover key would fail the strict schema and take the operator's waves with
 * it, exactly the way one autopilot knob once did.
 */
function migrateHelm(tuning: LegacyRecord, defaults: BalanceTuning): unknown {
  const saved: LegacyRecord = { ...readRecord(tuning, "helm") };
  // Version 17 named this the counter angle; the release now aims at the
  // predicted resting point instead, so the old key has no home.
  delete saved.stopCounterRadians;
  return { ...defaults.helm, ...saved };
}

/**
 * Fills the background section field by field so a document saved before the
 * parallax existed gains defaults instead of failing the strict schema.
 */
function migrateBackground(tuning: LegacyRecord, defaults: BalanceTuning): unknown {
  return { ...defaults.background, ...readRecord(tuning, "background") };
}

/**
 * Salvage arrived in version 25 and its collection window in version 26. Merged
 * field by field off the defaults rather than carried over whole, which is what
 * once cost an operator their wave table.
 */
function migrateLoot(tuning: LegacyRecord, defaults: BalanceTuning): LegacyRecord {
  return {
    ...Object.fromEntries(LOOT_FIELDS.map((field) => [field, tuning[field] ?? defaults[field]])),
    lootRepairShare: migrateRepairShare(tuning, defaults)
  };
}

/**
 * Version 31 sized the ordinary repair in hit points, so one drop healed the
 * light hull for nearly twice what it healed the heavy one; version 32 states
 * it as a share of whatever hull is flying. The saved number is converted
 * against the hull it was tuned on rather than thrown away.
 */
function migrateRepairShare(tuning: LegacyRecord, defaults: BalanceTuning): number {
  const saved = tuning.lootRepairShare;
  if (typeof saved === "number") return saved;
  const amount = tuning.lootRepairAmount;
  const hull = tuning.spaceshipMaxHp;
  if (typeof amount !== "number" || typeof hull !== "number" || hull <= 0) {
    return defaults.lootRepairShare;
  }
  return Math.min(1, Math.max(0, amount / hull));
}

/**
 * Weapon kinds arrived in version 27. A preset written before them keeps both
 * barrels kinetic, which is what its numbers already described.
 */
function migrateWeaponKinds(tuning: LegacyRecord, defaults: BalanceTuning): LegacyRecord {
  return Object.fromEntries(
    WEAPON_KIND_FIELDS.map((field) => [field, tuning[field] ?? defaults[field]])
  );
}

/**
 * Hull archetypes arrived in version 29. A preset written before them gets the
 * repository's catalogue and its base hull; its flat player-ship block stays
 * untouched and keeps serving as the base every hull is a diff against.
 */
function migrateShipArchetypes(tuning: LegacyRecord, defaults: BalanceTuning): LegacyRecord {
  return {
    shipArchetypes: tuning.shipArchetypes ?? defaults.shipArchetypes,
    defaultShipArchetypeId: tuning.defaultShipArchetypeId ?? defaults.defaultShipArchetypeId
  };
}

function migratePreset(preset: unknown, defaults: BalanceTuning): unknown {
  if (!isRecord(preset)) return preset;
  const tuning = readRecord(preset, "tuning");
  const campaign = readRecord(tuning, "waveCampaign");
  return {
    ...preset,
    tuning: {
      ...migratePlayerShip(tuning, defaults),
      arenaRadius: tuning.arenaRadius ?? defaults.arenaRadius,
      cameraViewWidth: tuning.cameraViewWidth ?? defaults.cameraViewWidth,
      background: migrateBackground(tuning, defaults),
      autopilot: migrateAutopilot(tuning, defaults),
      enemySkill: migrateEnemySkill(tuning, defaults),
      // Field by field, like the background: a preset saved before a helm knob
      // existed must gain it, not fail the strict schema and take the
      // operator's waves down with it.
      helm: migrateHelm(tuning, defaults),
      asteroidVisual: tuning.asteroidVisual ?? null,
      // Field by field, like the helm: a preset saved before salvage existed
      // must gain every knob, not fail the strict schema and take the
      // operator's waves down with it.
      ...migrateLoot(tuning, defaults),
      ...migrateWeaponKinds(tuning, defaults),
      ...migrateShipArchetypes(tuning, defaults),
      enemyArchetypes: Object.fromEntries(
        Object.entries(readRecord(tuning, "enemyArchetypes")).map(([kind, archetype]) => [
          kind,
          migrateArchetype(kind, archetype, defaults)
        ])
      ),
      waveCampaign: {
        ...campaign,
        waves: readArray(campaign, "waves").map(migrateWave),
        // Field by field, like the helm and the salvage: a preset written
        // before the generator's knobs moved into the file must gain them
        // rather than fail the strict schema and take the waves with it.
        authoring: {
          ...defaults.waveCampaign.authoring,
          ...readRecord(campaign, "authoring")
        }
      }
    }
  };
}

/**
 * Version 1 stored one `sector` per wave entry and had no visuals, because the
 * enemy kinds were a fixed enum drawn by the display; version 5 still framed
 * the world with a literal in the display instead of `cameraViewWidth`, version
 * 6 let every weapon fire across the whole arena, and version 7 picked
 * silhouettes from eight shapes the display drew in code and tinted them with
 * two colours, and version 8 had no player ship in the preset at all.
 * Version 9 had no autopilot section, so the demo bot had a single hardcoded
 * skill. Carry
 * those documents forward instead of silently replacing an operator's balance
 * with defaults.
 */
export function migrateBalanceDocument(raw: unknown): unknown {
  const version = isRecord(raw) ? raw.version : undefined;
  const isLegacy = LEGACY_BALANCE_FILE_VERSIONS.some((candidate) => candidate === version);
  if (!isRecord(raw) || !isLegacy) return raw;
  const defaults = createDefaultTuning();
  return {
    ...raw,
    version: BALANCE_FILE_VERSION,
    presets: readArray(raw, "presets").map((preset) => migratePreset(preset, defaults))
  };
}

/**
 * Parsed through the schema rather than cast: the simulation treats an asset id
 * as an opaque string, so this is what proves the built-in archetypes name
 * silhouettes the catalogue actually carries.
 */
