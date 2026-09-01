import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  BALANCE_FILE_VERSION,
  balancePresetsFileSchema,
  balanceTuningSchema,
  type AutopilotLevel,
  type AutopilotLevelProfiles,
  type AutopilotProfile,
  type AutopilotTuning,
  type HelmTuning,
  type BalancePreset,
  type BalancePresetsFile,
  type BalanceTuning,
  type ShipArchetype
} from "@spaceship-defender/protocol";
import {
  createSpaceshipSimulationConfig,
  validateSpaceshipSimulationConfig,
  type SpaceshipSimulationConfig
} from "@spaceship-defender/game-core";

import { DEFAULT_SHIP_ARCHETYPES, DEFAULT_SHIP_ARCHETYPE_ID } from "./shipCatalogue.js";

const DEFAULT_PRESET_ID = "default";

/**
 * Skill levels of the visible-demo autopilot. `rookie` reproduces the bot that
 * predated the levels — a wide-open cone, no lead, no evasion — so an operator
 * has a baseline to compare against; `ace` is the ceiling of what the policy
 * can do. Nothing here reaches the simulation.
 */
/**
 * Ships the helm the keyboard was tuned to in the browser: about 2.3 rad/s of
 * spin, roughly 0.16 rad of coast after the key comes up, and a nudge small
 * enough that turning in place drifts a handful of units per second.
 */
const DEFAULT_HELM: HelmTuning = {
  scheme: "tank",
  // Wide enough that the request stays ahead of the nose across a network
  // round trip — a lead shorter than the angle the hull covers between updates
  // lands behind it and brakes the spin. The coast is short anyway, because the
  // release aims at the predicted stopping point.
  headingLeadRadians: 0.45,
  stopDampening: 1,
  rotateInPlaceThrottle: 0.02
};

/**
 * How the demo bot flies, per turret kind and per level.
 *
 * Both dimensions are real and they are not separable: a sweep of every field,
 * a hundred runs per value, verified on further seed blocks, moved eleven of
 * the sixteen fields when the turret changed — including whether to orbit at
 * all. The level decides how well that flying is aimed and defended.
 *
 * The laser set is the measured baseline; the other two kinds are written as
 * the deltas measured against it, so the reason for every number stays visible.
 * The rookie keeps the bot that predated the profiles in every kind: no orbit,
 * no evasion, wide spray, slow hands.
 */
const LASER_PROFILES: AutopilotLevelProfiles = {
  rookie: {
    reactionTicks: 12,
    retargetIntervalTicks: 40,
    aimJitterRadians: 0.18,
    leadFactor: 0,
    orbit: false,
    evadeMissiles: false,
    dodgeBullets: false,
    threatAwareShield: false,
    // Choosing the distance is part of the craft, so the beginner does not:
    // it wanders inside its own reach, where more of the field can answer it.
    standoffShare: 0.6,
    standoffDistance: 700,
    evadeHorizonTicks: 0,
    mgConeRadians: Math.PI,
    cannonConeRadians: Math.PI,
    mgHeatCeiling: 1,
    cannonHeatCeiling: 1,
    shieldLeadTicks: 0,
    shieldMinEnergy: 0
  },
  veteran: {
    reactionTicks: 20,
    retargetIntervalTicks: 30,
    aimJitterRadians: 0.06,
    leadFactor: 0.65,
    orbit: true,
    evadeMissiles: true,
    dodgeBullets: false,
    threatAwareShield: true,
    standoffShare: 0.85,
    standoffDistance: 400,
    evadeHorizonTicks: 12,
    mgConeRadians: 0.35,
    cannonConeRadians: 0.2,
    mgHeatCeiling: 0.75,
    cannonHeatCeiling: 0.8,
    shieldLeadTicks: 20,
    shieldMinEnergy: 0.15
  },
  ace: {
    reactionTicks: 20,
    retargetIntervalTicks: 30,
    aimJitterRadians: 0,
    leadFactor: 1,
    orbit: true,
    evadeMissiles: true,
    dodgeBullets: true,
    threatAwareShield: true,
    standoffShare: 0.85,
    standoffDistance: 400,
    evadeHorizonTicks: 12,
    mgConeRadians: 0.5,
    cannonConeRadians: 0.06,
    mgHeatCeiling: 0.95,
    cannonHeatCeiling: 0.95,
    shieldLeadTicks: 20,
    shieldMinEnergy: 0.15
  }
};

/** What a kind changes, applied to the levels that fly well enough to notice. */
type ProfileDelta = Partial<Record<AutopilotLevel, Partial<AutopilotProfile>>>;

/**
 * A bullet has flight time, so the pilot stops circling and closes in, leads
 * less than fully, and sprays a wider nose cone while keeping it cooler.
 */
const KINETIC_DELTA: ProfileDelta = {
  veteran: {
    reactionTicks: 10,
    leadFactor: 0.6,
    orbit: false,
    standoffShare: 0.5,
    mgConeRadians: 0.25,
    mgHeatCeiling: 0.6
  },
  ace: {
    reactionTicks: 10,
    leadFactor: 0.6,
    orbit: false,
    standoffShare: 0.5,
    mgConeRadians: 0.25,
    mgHeatCeiling: 0.6
  }
};

/**
 * A missile chases on its own, so the pilot stands further off, stops orbiting,
 * stops breaking from incoming missiles at all — its own shot is already away —
 * and spends less of the barrel's heat.
 */
const MISSILE_DELTA: ProfileDelta = {
  veteran: {
    leadFactor: 0.6,
    orbit: false,
    evadeMissiles: false,
    standoffShare: 0.75,
    standoffDistance: 600,
    evadeHorizonTicks: 0,
    cannonConeRadians: 0.12,
    cannonHeatCeiling: 0.8,
    shieldLeadTicks: 10
  },
  ace: {
    leadFactor: 0.6,
    orbit: false,
    evadeMissiles: false,
    standoffShare: 0.75,
    standoffDistance: 600,
    evadeHorizonTicks: 0,
    cannonConeRadians: 0.12,
    cannonHeatCeiling: 0.8,
    shieldLeadTicks: 10
  }
};

function withDelta(base: AutopilotLevelProfiles, delta: ProfileDelta): AutopilotLevelProfiles {
  return {
    rookie: { ...base.rookie, ...delta.rookie },
    veteran: { ...base.veteran, ...delta.veteran },
    ace: { ...base.ace, ...delta.ace }
  };
}

const DEFAULT_AUTOPILOT: AutopilotTuning = {
  level: "veteran",
  profiles: {
    laser: LASER_PROFILES,
    kinetic: withDelta(LASER_PROFILES, KINETIC_DELTA),
    missile: withDelta(LASER_PROFILES, MISSILE_DELTA)
  }
};

import { migrateBalanceDocument } from "./migrations.js";

export { migrateBalanceDocument };

/**
 * What the campaign generator was built with. Numbers an operator can now turn
 * from the console; the script reads them back rather than carrying its own.
 */
export const DEFAULT_CAMPAIGN_AUTHORING = {
  budgetBase: 10,
  budgetGrowth: 2.2,
  asteroidEveryWaves: 3,
  hpPerCannonShot: 25,
  hpScale: 0.75,
  damagePerSecondBase: 2,
  damagePerSecondPerSpawnCost: 2.2,
  bossDamagePerSecondCap: 26,
  laserDamageShare: 0.75,
  shipReach: 1080,
  maxEngagementShare: 1.6,
  maxStandoffShare: 1.3,
  groupStartStepSeconds: 34,
  swarmIntervalSeconds: 7,
  lineIntervalSeconds: 14,
  heavyIntervalSeconds: 22,
  bossFloorSeconds: 30
} as const;

export function createDefaultTuning(): BalanceTuning {
  const config = createSpaceshipSimulationConfig();
  return balanceTuningSchema.parse({
    enemyArchetypes: config.enemyArchetypes,
    // The authoring block is the generator's, not the simulation's: the core
    // knows nothing about it, so the defaults are stated here beside the rest
    // of the balance file.
    waveCampaign: { ...config.waveCampaign, authoring: DEFAULT_CAMPAIGN_AUTHORING },
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
    lootRepairShare: config.lootRepairShare,
    lootShieldAmount: config.lootShieldAmount,
    lootBossRepairShare: config.lootBossRepairShare,
    lootLifetimeTicks: config.lootLifetimeTicks,
    lootDropRadius: config.lootDropRadius,
    lootMagnetRadius: config.lootMagnetRadius,
    lootMagnetAccelerationPerSecondSquared: config.lootMagnetAccelerationPerSecondSquared,
    lootDriftDampingPerSecond: config.lootDriftDampingPerSecond,
    cannonWeaponKind: config.cannonWeaponKind,
    mgWeaponKind: config.mgWeaponKind,
    cannonLaserRange: config.cannonLaserRange,
    mgLaserRange: config.mgLaserRange,
    laserBeamRadius: config.laserBeamRadius,
    friendlyMissileTurnRatePerSecond: config.friendlyMissileTurnRatePerSecond,
    friendlyMissileAcquireConeRadians: config.friendlyMissileAcquireConeRadians,
    lootWindowTicks: config.lootWindowTicks,
    lootBossWindowTicks: config.lootBossWindowTicks,
    asteroidVisual: config.asteroidVisual,
    missileInterceptScoreReward: config.missileInterceptScoreReward,
    arenaRadius: config.arenaRadius,
    cameraViewWidth: config.cameraViewWidth,
    background: config.background,
    autopilot: DEFAULT_AUTOPILOT,
    enemySkill: config.enemySkill,
    helm: DEFAULT_HELM,
    shipArchetypes: DEFAULT_SHIP_ARCHETYPES,
    defaultShipArchetypeId: DEFAULT_SHIP_ARCHETYPE_ID,
    spaceshipVisual: config.spaceshipVisual,
    spaceshipMaxHp: config.spaceshipMaxHp,
    spaceshipRadius: config.spaceshipRadius,
    spaceshipSpeedPerSecond: config.spaceshipSpeedPerSecond,
    spaceshipAccelerationPerSecondSquared: config.spaceshipAccelerationPerSecondSquared,
    spaceshipBrakingPerSecondSquared: config.spaceshipBrakingPerSecondSquared,
    spaceshipReverseSpeedFactor: config.spaceshipReverseSpeedFactor,
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
    projectileVisual: config.projectileVisual,
    turretVisual: config.turretVisual,
    mgProjectileVisual: config.mgProjectileVisual,
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
    shieldEngageTicks: config.shieldEngageTicks,
    shieldMinimumUpTicks: config.shieldMinimumUpTicks,
    shieldCooldownTicks: config.shieldCooldownTicks,
    shieldRearmEnergy: config.shieldRearmEnergy,
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
  for (const hullId of Object.keys(tuning.shipArchetypes)) {
    validateSpaceshipSimulationConfig(toSimulationConfig(tuning, hullId));
  }
}

/**
 * The preset plus one chosen hull, as the simulation sees it.
 *
 * This is where a hull stops being a catalogue entry: its sparse diff lands on
 * the flat ship block and its tree becomes the tiers the offer is built from,
 * so the simulation is handed a ship and never learns that a choice was made.
 */
export function toSimulationConfig(
  tuning: BalanceTuning,
  shipArchetypeId?: string
): SpaceshipSimulationConfig {
  // The autopilot section drives the demo harness and the helm section drives
  // the controller's keyboard; neither reaches the simulation.
  const simulation: Partial<BalanceTuning> = { ...tuning };
  delete simulation.autopilot;
  delete simulation.helm;
  delete simulation.shipArchetypes;
  delete simulation.defaultShipArchetypeId;
  const hull = resolveShipArchetype(tuning, shipArchetypeId);
  // The world follows the arena radius inside the factory, so every caller that
  // builds a config from a preset gets the same geometry.
  return createSpaceshipSimulationConfig({
    ...simulation,
    ...hull.overrides.stats,
    ...(hull.overrides.cannonWeaponKind === null
      ? {}
      : { cannonWeaponKind: hull.overrides.cannonWeaponKind }),
    ...(hull.overrides.mgWeaponKind === null ? {} : { mgWeaponKind: hull.overrides.mgWeaponKind }),
    moduleTiers: hull.tiers,
    endlessTier: hull.endlessTier
  });
}

/** The named hull, or the preset's own default when the name is not a hull. */
export function resolveShipArchetype(
  tuning: BalanceTuning,
  shipArchetypeId?: string
): ShipArchetype {
  const chosen = shipArchetypeId === undefined ? undefined : tuning.shipArchetypes[shipArchetypeId];
  const fallback = tuning.shipArchetypes[tuning.defaultShipArchetypeId];
  const hull = chosen ?? fallback;
  if (hull === undefined) throw new RangeError("Preset has no hull to play on");
  return hull;
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
      const where = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("; ");
      this.logger.warn(
        `Balance preset file ${this.filePath} failed validation (${where}); using built-in defaults.`
      );
      await this.preserveUnusableFile(raw);
      return;
    }

    try {
      for (const preset of parsed.data.presets) assertTuningIsPlayable(preset.tuning);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown reason";
      this.logger.warn(
        `Balance preset file ${this.filePath} cannot drive a simulation (${reason}); using built-in defaults.`
      );
      await this.preserveUnusableFile(raw);
      return;
    }

    this.file = parsed.data;
  }

  /**
   * Keeps a copy of a preset the server could not use. Falling back to defaults
   * puts an empty campaign in front of the operator, and the next save from the
   * console writes that over hand-built waves — so the original has to survive
   * somewhere before that can happen.
   */
  private async preserveUnusableFile(raw: string): Promise<void> {
    const rescued = `${this.filePath}.unusable`;
    try {
      await writeFile(rescued, raw, "utf8");
      this.logger.warn(`Previous balance preset kept at ${rescued}.`);
    } catch {
      this.logger.warn(`Could not keep a copy of the unusable preset at ${rescued}.`);
    }
  }

  getState(): BalancePresetsFile {
    return this.file;
  }

  getActiveTuning(): BalanceTuning {
    return findActivePreset(this.file).tuning;
  }

  getActiveSimulationConfig(shipArchetypeId?: string): SpaceshipSimulationConfig {
    return toSimulationConfig(this.getActiveTuning(), shipArchetypeId);
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
