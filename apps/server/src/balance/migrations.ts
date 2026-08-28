/**
 * Saved presets outlive the shape they were written in: every field added since
 * a file was saved is backfilled here, so an operator never loses a wave table
 * to a new setting.
 */

import {
  AUTOPILOT_LEVELS,
  BALANCE_FILE_VERSION,
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
    weapons: Array.isArray(weapons) ? weapons.map(migrateWeapon) : weapons,
    visual:
      visual === undefined
        ? (known?.visual ?? {
            shape: FALLBACK_VISUAL_ASSET_ID,
            modelScale: 1,
            showHealthBar: false
          })
        : migrateVisual(visual),
    label: archetype.label ?? known?.label ?? kind
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
  const profiles = readRecord(autopilot, "profiles");
  return {
    level: autopilot.level ?? defaults.autopilot.level,
    profiles: Object.fromEntries(
      AUTOPILOT_LEVELS.map((level) => {
        const saved = profiles[level];
        // Merged field by field, never carried over whole: a profile saved
        // before a knob existed must gain it, not fail the strict schema.
        return [
          level,
          isRecord(saved)
            ? { ...defaults.autopilot.profiles[level], ...saved }
            : defaults.autopilot.profiles[level]
        ];
      })
    )
  };
}

/**
 * Fills the background section field by field so a document saved before the
 * parallax existed gains defaults instead of failing the strict schema.
 */
function migrateBackground(tuning: LegacyRecord, defaults: BalanceTuning): unknown {
  return { ...defaults.background, ...readRecord(tuning, "background") };
}

function migratePreset(preset: unknown, defaults: BalanceTuning): unknown {
  if (!isRecord(preset)) return preset;
  const tuning = readRecord(preset, "tuning");
  const campaign = readRecord(tuning, "waveCampaign");
  return {
    ...preset,
    tuning: {
      ...migratePlayerShip(tuning, defaults),
      cameraViewWidth: tuning.cameraViewWidth ?? defaults.cameraViewWidth,
      background: migrateBackground(tuning, defaults),
      autopilot: migrateAutopilot(tuning, defaults),
      // Field by field, like the background: a preset saved before a helm knob
      // existed must gain it, not fail the strict schema and take the
      // operator's waves down with it.
      helm: { ...defaults.helm, ...readRecord(tuning, "helm") },
      asteroidVisual: tuning.asteroidVisual ?? null,
      enemyArchetypes: Object.fromEntries(
        Object.entries(readRecord(tuning, "enemyArchetypes")).map(([kind, archetype]) => [
          kind,
          migrateArchetype(kind, archetype, defaults)
        ])
      ),
      waveCampaign: { ...campaign, waves: readArray(campaign, "waves").map(migrateWave) }
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
