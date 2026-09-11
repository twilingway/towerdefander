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

import { SIMULATION_TICK_RATE } from "@spaceship-defender/game-core";

import { createDefaultTuning } from "./store.js";

type LegacyRecord = Record<string, unknown>;
function isRecord(value: unknown): value is LegacyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(source: LegacyRecord, key: string): LegacyRecord {
  const value = source[key];
  return isRecord(value) ? value : {};
}

/** A number from a legacy record, or undefined when it is anything else. */
function readNumber(source: LegacyRecord, key: string): number | undefined {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

/**
 * Simulation step in seconds; the balance file stores weapon lifetimes in ticks.
 *
 * The current step, not the one the file was written at: durations are rescaled
 * to the current rate before any of this runs, so by the time a weapon reaches
 * here its lifetime is already counted in today's ticks.
 */
const TICK_SECONDS = 1 / SIMULATION_TICK_RATE;
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
      // A beam states its reach outright and its speed and lifetime sit at the
      // floor, so the arithmetic here rounds to nothing for it - and a range of
      // zero is a barrel the schema refuses to load at all.
      (Number.isFinite(reach) && reach > 0
        ? Math.max(1, Math.round(reach * MIGRATED_RANGE_SHARE))
        : 1200),
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
  "turretMountedOnHull",
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
function migrateHelm(tuning: LegacyRecord, defaults: BalanceTuning): LegacyRecord {
  const saved: LegacyRecord = { ...readRecord(tuning, "helm") };
  // Version 17 named this the counter angle; the release now aims at the
  // predicted resting point instead, so the old key has no home.
  delete saved.stopCounterRadians;
  return {
    ...defaults.helm,
    ...saved,
    /*
     * Taken back rather than kept, like the drive fields above: the arcade
     * profile has no thumb gate and no heading filter, and those two are what
     * decide whether the nose answers the finger on the frame it moved.
     */
    headingDeadbandRadians: defaults.helm.headingDeadbandRadians,
    headingFilterSeconds: defaults.helm.headingFilterSeconds
  };
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

/**
 * The drive numbers an operator did not own, once.
 *
 * Normally a migration adds knobs and leaves tuned ones alone. This one took
 * seven back, because the helm was changed on purpose and from the outside: the
 * reference prototype's arcade profile replaced a hull that accelerated in a
 * second and turned with inertia, and a preset that kept the old numbers would
 * quietly keep the old feel while every other copy of the game had the new one.
 *
 * It is a one-time takeover and has to stay one. Left unconditional it fired
 * again on every later version bump, so an operator who tuned the helm after
 * the arcade landed lost it to the built-ins the next time any unrelated field
 * was added - which is exactly what "the ship flies differently now and I
 * changed nothing" is.
 *
 * The hull only. The turret is not on this list: the prototype points its
 * barrel instantly, and taking that as well would delete the gunner's traverse
 * along with everything built on it.
 */
/**
 * The version the arcade drive landed on. A preset written at or after it has
 * already been through the takeover once, so its helm is the operator's again
 * and no later migration may touch it.
 */
const FIRST_ARCADE_HELM_VERSION = 38;

const ARCADE_HELM_FIELDS = [
  "spaceshipSpeedPerSecond",
  "spaceshipAccelerationPerSecondSquared",
  "spaceshipBrakingPerSecondSquared",
  "spaceshipReverseSpeedFactor",
  "headingMaxAngularSpeedPerSecond",
  "headingAngularAccelerationPerSecondSquared",
  "headingAngularBrakingPerSecondSquared"
] as const satisfies readonly (keyof BalanceTuning)[];

function migratePreset(preset: unknown, defaults: BalanceTuning, takeArcadeHelm: boolean): unknown {
  if (!isRecord(preset)) return preset;
  const tuning = readRecord(preset, "tuning");
  const campaign = readRecord(tuning, "waveCampaign");
  const arcade = takeArcadeHelm
    ? (Object.fromEntries(ARCADE_HELM_FIELDS.map((field) => [field, defaults[field]])) as Pick<
        BalanceTuning,
        (typeof ARCADE_HELM_FIELDS)[number]
      >)
    : {};
  return {
    ...preset,
    tuning: {
      ...migratePlayerShip(tuning, defaults),
      ...arcade,
      arenaRadius: tuning.arenaRadius ?? defaults.arenaRadius,
      // Zero, from the defaults, means "the enemy's own weapon reach" - so a
      // preset written before this knob existed keeps behaving exactly as it
      // did rather than gaining a distance nobody chose.
      shieldAutopilotRaiseRange:
        tuning.shieldAutopilotRaiseRange ?? defaults.shieldAutopilotRaiseRange,
      cameraViewWidth: tuning.cameraViewWidth ?? defaults.cameraViewWidth,
      background: migrateBackground(tuning, defaults),
      autopilot: migrateAutopilot(tuning, defaults),
      enemySkill: migrateEnemySkill(tuning, defaults),
      // Field by field, like the background: a preset saved before a helm knob
      // existed must gain it, not fail the strict schema and take the
      // operator's waves down with it.
      helm: migrateHelm(tuning, defaults),
      // A preset written before the arena existed gains the spiral the code
      // used to compute, so nothing about an older file changes how it plays.
      arena: migrateArena(tuning, defaults),
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
/**
 * Every duration counted in ticks, rescaled for a new simulation rate.
 *
 * A preset written against twenty steps a second says "reload in three ticks",
 * and at sixty that is a sixth of a second instead of half of one - the same
 * file, three times the fire rate, across every weapon, wave delay and shield
 * timing at once. Reading the name rather than a list of paths is deliberate:
 * the fields live at half a dozen depths and new ones arrive with every
 * feature, and a list is what gets forgotten.
 */
function scaleTickFields(value: unknown, factor: number): unknown {
  if (Array.isArray(value)) return value.map((item) => scaleTickFields(item, factor));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key.endsWith("Ticks") && typeof item === "number" && Number.isFinite(item)) {
        return [key, Math.round(item * factor)];
      }
      return [key, scaleTickFields(item, factor)];
    })
  );
}

/**
 * Steps a second before the rate moved, and after it. Everything a preset
 * counts in ticks is multiplied by their ratio, once, on the way forward.
 */
const TICK_RATE_BEFORE_60_HZ = 20;

/**
 * The first file version written at sixty steps a second.
 *
 * The rescale has to be gated on this rather than on "is this file legacy",
 * which is what it used to ask. Every legacy version happened to predate the
 * rate when the rescale was written, so the two questions had the same answer -
 * and then the current version moved on, the versions written at 60 Hz started
 * arriving as legacy, and their tick fields were tripled a second time. It
 * surfaced the moment the committed seed became one version old: every autopilot
 * interval in it blew its schema ceiling and the whole file was refused.
 */
const FIRST_60_HZ_BALANCE_VERSION = 37;

export function migrateBalanceDocument(raw: unknown): unknown {
  const version = isRecord(raw) ? raw.version : undefined;
  const isLegacy = LEGACY_BALANCE_FILE_VERSIONS.some((candidate) => candidate === version);
  if (!isRecord(raw) || !isLegacy) return raw;
  const defaults = createDefaultTuning();
  const tickScale =
    typeof version === "number" && version >= FIRST_60_HZ_BALANCE_VERSION
      ? 1
      : SIMULATION_TICK_RATE / TICK_RATE_BEFORE_60_HZ;
  // Only a file older than the arcade drive has its helm taken; see
  // `ARCADE_HELM_FIELDS`.
  const takeArcadeHelm = !(typeof version === "number" && version >= FIRST_ARCADE_HELM_VERSION);
  return {
    ...raw,
    version: BALANCE_FILE_VERSION,
    // Rescaled before the defaults are folded in, not after: the defaults are
    // already written at the new rate, and scaling them a second time would
    // triple every knob the operator never touched.
    presets: readArray(raw, "presets").map((preset) =>
      migratePreset(scaleTickFields(preset, tickScale), defaults, takeArcadeHelm)
    )
  };
}

/**
 * The arena's spawn marks, or the defaults when a preset has none.
 *
 * All or nothing rather than field by field: a partial set of marks is not a
 * layout, and the schema wants exactly sixteen of them.
 */
function migrateArena(tuning: LegacyRecord, defaults: BalanceTuning): BalanceTuning["arena"] {
  const arena = tuning.arena;
  if (!isRecord(arena)) return defaults.arena;
  const marks = arena.spawnMarks;
  if (!Array.isArray(marks) || marks.length !== defaults.arena.spawnMarks.length) {
    return defaults.arena;
  }
  return {
    spawnMarks: marks as BalanceTuning["arena"]["spawnMarks"],
    // A preset written before the grid was editable keeps the layout it played
    // on, which is the default sheet.
    zoneColumns: readNumber(arena, "zoneColumns") ?? defaults.arena.zoneColumns,
    zoneRows: readNumber(arena, "zoneRows") ?? defaults.arena.zoneRows,
    // A preset written before the match clock was a setting keeps the length it
    // was played at, which is the default.
    matchTickLimit: readNumber(arena, "matchTickLimit") ?? defaults.arena.matchTickLimit,
    zoneIntervalTicks: readNumber(arena, "zoneIntervalTicks") ?? defaults.arena.zoneIntervalTicks,
    zoneWarningTicks: readNumber(arena, "zoneWarningTicks") ?? defaults.arena.zoneWarningTicks,
    zoneDamageIntervalTicks:
      readNumber(arena, "zoneDamageIntervalTicks") ?? defaults.arena.zoneDamageIntervalTicks,
    zoneBitesToKill: readNumber(arena, "zoneBitesToKill") ?? defaults.arena.zoneBitesToKill
  };
}

/**
 * Parsed through the schema rather than cast: the simulation treats an asset id
 * as an opaque string, so this is what proves the built-in archetypes name
 * silhouettes the catalogue actually carries.
 */
