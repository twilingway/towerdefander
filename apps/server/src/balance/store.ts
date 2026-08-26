import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  AUTOPILOT_LEVELS,
  BALANCE_FILE_VERSION,
  FALLBACK_VISUAL_ASSET_ID,
  LEGACY_BALANCE_FILE_VERSIONS,
  balancePresetsFileSchema,
  balanceTuningSchema,
  type AutopilotTuning,
  type BalancePreset,
  type BalancePresetsFile,
  type BalanceTuning
} from "@spaceship-defender/protocol";
import {
  createSpaceshipSimulationConfig,
  validateSpaceshipSimulationConfig,
  type SpaceshipSimulationConfig
} from "@spaceship-defender/game-core";

const DEFAULT_PRESET_ID = "default";

/**
 * Skill levels of the visible-demo autopilot. `rookie` reproduces the bot that
 * predated the levels — a wide-open cone, no lead, no evasion — so an operator
 * has a baseline to compare against; `ace` is the ceiling of what the policy
 * can do. Nothing here reaches the simulation.
 */
const DEFAULT_AUTOPILOT: AutopilotTuning = {
  level: "veteran",
  profiles: {
    rookie: {
      reactionTicks: 12,
      retargetIntervalTicks: 40,
      aimJitterRadians: 0.18,
      leadFactor: 0,
      orbit: false,
      evadeMissiles: false,
      dodgeBullets: false,
      threatAwareShield: false,
      standoffDistance: 900,
      evadeHorizonTicks: 0,
      mgConeRadians: Math.PI,
      cannonConeRadians: Math.PI,
      mgHeatCeiling: 1,
      cannonHeatCeiling: 1,
      shieldLeadTicks: 0,
      shieldMinEnergy: 0
    },
    veteran: {
      reactionTicks: 5,
      retargetIntervalTicks: 10,
      aimJitterRadians: 0.06,
      leadFactor: 0.65,
      orbit: true,
      evadeMissiles: true,
      dodgeBullets: false,
      threatAwareShield: true,
      standoffDistance: 620,
      evadeHorizonTicks: 12,
      mgConeRadians: 0.35,
      cannonConeRadians: 0.2,
      mgHeatCeiling: 0.75,
      cannonHeatCeiling: 0.8,
      shieldLeadTicks: 8,
      shieldMinEnergy: 0.15
    },
    ace: {
      reactionTicks: 1,
      retargetIntervalTicks: 2,
      aimJitterRadians: 0,
      leadFactor: 1,
      orbit: true,
      evadeMissiles: true,
      dodgeBullets: true,
      threatAwareShield: true,
      standoffDistance: 700,
      evadeHorizonTicks: 20,
      mgConeRadians: 0.12,
      cannonConeRadians: 0.06,
      mgHeatCeiling: 0.7,
      cannonHeatCeiling: 0.7,
      shieldLeadTicks: 14,
      shieldMinEnergy: 0.25
    }
  }
};

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

function migratePlayerShip(tuning: LegacyRecord, defaults: BalanceTuning): LegacyRecord {
  const migrated: LegacyRecord = { ...tuning, spaceshipVisual: tuning.spaceshipVisual ?? null };
  for (const field of PLAYER_SHIP_FIELDS) {
    migrated[field] = tuning[field] ?? defaults[field];
  }
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
      AUTOPILOT_LEVELS.map((level) => [
        level,
        profiles[level] ?? defaults.autopilot.profiles[level]
      ])
    )
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
      cameraViewWidth: tuning.cameraViewWidth ?? defaults.cameraViewWidth,
      autopilot: migrateAutopilot(tuning, defaults),
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
export function createDefaultTuning(): BalanceTuning {
  const config = createSpaceshipSimulationConfig();
  return balanceTuningSchema.parse({
    enemyArchetypes: config.enemyArchetypes,
    waveCampaign: config.waveCampaign,
    enemySpawnIntervalTicks: config.enemySpawnIntervalTicks,
    intermissionTicks: config.intermissionTicks,
    ambientAsteroidIntervalMinTicks: config.ambientAsteroidIntervalMinTicks,
    ambientAsteroidIntervalMaxTicks: config.ambientAsteroidIntervalMaxTicks,
    asteroidHp: config.asteroidHp,
    asteroidRadius: config.asteroidRadius,
    asteroidSpeedPerSecond: config.asteroidSpeedPerSecond,
    asteroidLifetimeTicks: config.asteroidLifetimeTicks,
    asteroidDamage: config.asteroidDamage,
    asteroidShieldHitCost: config.asteroidShieldHitCost,
    asteroidSpawnCost: config.asteroidSpawnCost,
    asteroidScoreReward: config.asteroidScoreReward,
    asteroidCreditReward: config.asteroidCreditReward,
    asteroidVisual: config.asteroidVisual,
    missileInterceptScoreReward: config.missileInterceptScoreReward,
    cameraViewWidth: config.cameraViewWidth,
    autopilot: DEFAULT_AUTOPILOT,
    spaceshipVisual: config.spaceshipVisual,
    spaceshipMaxHp: config.spaceshipMaxHp,
    spaceshipRadius: config.spaceshipRadius,
    spaceshipSpeedPerSecond: config.spaceshipSpeedPerSecond,
    spaceshipAccelerationPerSecondSquared: config.spaceshipAccelerationPerSecondSquared,
    spaceshipBrakingPerSecondSquared: config.spaceshipBrakingPerSecondSquared,
    headingMaxAngularSpeedPerSecond: config.headingMaxAngularSpeedPerSecond,
    headingAngularAccelerationPerSecondSquared: config.headingAngularAccelerationPerSecondSquared,
    headingAngularBrakingPerSecondSquared: config.headingAngularBrakingPerSecondSquared,
    friendlyProjectileDamage: config.friendlyProjectileDamage,
    fireCooldownTicks: config.fireCooldownTicks,
    projectileSpeedPerSecond: config.projectileSpeedPerSecond,
    projectileRadius: config.projectileRadius,
    projectileLifetimeMs: config.projectileLifetimeMs,
    turretMaxAngularSpeedPerSecond: config.turretMaxAngularSpeedPerSecond,
    turretAngularAccelerationPerSecondSquared: config.turretAngularAccelerationPerSecondSquared,
    turretAngularBrakingPerSecondSquared: config.turretAngularBrakingPerSecondSquared,
    mgDamage: config.mgDamage,
    mgFireCooldownTicks: config.mgFireCooldownTicks,
    mgProjectileSpeedPerSecond: config.mgProjectileSpeedPerSecond,
    mgProjectileRadius: config.mgProjectileRadius,
    cannonHeatCapacity: config.cannonHeatCapacity,
    cannonHeatPerShot: config.cannonHeatPerShot,
    cannonCoolingPerSecond: config.cannonCoolingPerSecond,
    cannonRearmThreshold: config.cannonRearmThreshold,
    mgHeatCapacity: config.mgHeatCapacity,
    mgHeatPerShot: config.mgHeatPerShot,
    mgCoolingPerSecond: config.mgCoolingPerSecond,
    mgRearmThreshold: config.mgRearmThreshold,
    shieldCapacity: config.shieldCapacity,
    shieldDrainPerSecond: config.shieldDrainPerSecond,
    shieldRechargePerSecond: config.shieldRechargePerSecond,
    shieldRadius: config.shieldRadius,
    shieldArcRadians: config.shieldArcRadians,
    shieldMaxAngularSpeedPerSecond: config.shieldMaxAngularSpeedPerSecond,
    shieldAngularAccelerationPerSecondSquared: config.shieldAngularAccelerationPerSecondSquared,
    shieldAngularBrakingPerSecondSquared: config.shieldAngularBrakingPerSecondSquared
  });
}

export function createDefaultPresetsFile(): BalancePresetsFile {
  return {
    version: BALANCE_FILE_VERSION,
    activePresetId: DEFAULT_PRESET_ID,
    presets: [{ id: DEFAULT_PRESET_ID, name: "Базовый баланс", tuning: createDefaultTuning() }]
  };
}

/** Throws a RangeError when the tuning cannot drive a simulation. */
export function assertTuningIsPlayable(tuning: BalanceTuning): void {
  validateSpaceshipSimulationConfig(toSimulationConfig(tuning));
}

export function toSimulationConfig(tuning: BalanceTuning): SpaceshipSimulationConfig {
  // The autopilot section drives the demo harness, never the simulation.
  const simulation: Partial<BalanceTuning> = { ...tuning };
  delete simulation.autopilot;
  return createSpaceshipSimulationConfig(simulation);
}

function findActivePreset(file: BalancePresetsFile): BalancePreset {
  // The schema guarantees the active id resolves, so this only guards hand-built values.
  const active = file.presets.find(({ id }) => id === file.activePresetId) ?? file.presets[0];
  if (active === undefined) {
    throw new Error("Balance document must contain at least one preset.");
  }
  return active;
}

export interface BalanceStoreOptions {
  readonly filePath: string;
  readonly logger?: Pick<Console, "warn">;
}

export class BalanceStore {
  private readonly filePath: string;
  private readonly logger: Pick<Console, "warn">;
  private file: BalancePresetsFile = createDefaultPresetsFile();

  constructor({ filePath, logger = console }: BalanceStoreOptions) {
    this.filePath = filePath;
    this.logger = logger;
  }

  /** Reads the preset file once; a missing or broken file leaves defaults in place. */
  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch {
      this.logger.warn(
        `Balance preset file ${this.filePath} is unavailable; using built-in defaults.`
      );
      return;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      this.logger.warn(
        `Balance preset file ${this.filePath} is not valid JSON; using built-in defaults.`
      );
      return;
    }

    const parsed = balancePresetsFileSchema.safeParse(migrateBalanceDocument(parsedJson));
    if (!parsed.success) {
      this.logger.warn(
        `Balance preset file ${this.filePath} failed validation; using built-in defaults.`
      );
      return;
    }

    try {
      for (const preset of parsed.data.presets) assertTuningIsPlayable(preset.tuning);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown reason";
      this.logger.warn(
        `Balance preset file ${this.filePath} cannot drive a simulation (${reason}); using built-in defaults.`
      );
      return;
    }

    this.file = parsed.data;
  }

  getState(): BalancePresetsFile {
    return this.file;
  }

  getActiveTuning(): BalanceTuning {
    return findActivePreset(this.file).tuning;
  }

  getActiveSimulationConfig(): SpaceshipSimulationConfig {
    return toSimulationConfig(this.getActiveTuning());
  }

  /** Validates, writes atomically and only then swaps the in-memory state. */
  async save(next: BalancePresetsFile): Promise<void> {
    const parsed = balancePresetsFileSchema.parse(next);
    for (const preset of parsed.presets) assertTuningIsPlayable(preset.tuning);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = join(
      dirname(this.filePath),
      `.${String(process.pid)}-${String(Date.now())}.balance.tmp`
    );
    await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
    this.file = parsed;
  }
}
