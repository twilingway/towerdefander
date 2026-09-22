import {
  ARENA_SPAWN_MARKS,
  BALANCE_FILE_VERSION,
  balanceTuningSchema,
  type AutopilotLevel,
  type AutopilotLevelProfiles,
  type AutopilotProfile,
  type AutopilotTuning,
  type HelmTuning,
  type BalancePresetsFile,
  type BalanceTuning
} from "@spaceship-defender/protocol";
import {
  ARENA_DAMAGE_SCALING,
  ARENA_HULL_SCALING,
  ARENA_MATCH_TICK_LIMIT,
  ARENA_LOOT_CARGO_INTERVAL_TICKS,
  ARENA_LOOT_FIRST_SPAWN_TICKS,
  ARENA_LOOT_INTERVAL_TICKS,
  ARENA_SCAN_COOLDOWN_TICKS,
  ARENA_SHIELD_HIT_COST_SHARE,
  ARENA_SHIELD_RAISE_RANGE,
  ARENA_SCAN_RADIUS_CELLS,
  ARENA_SCAN_REVEAL_TICKS,
  ARENA_ZONE_COLUMNS,
  ARENA_ZONES_PER_CLOSURE,
  ARENA_ZONE_DAMAGE_INTERVAL_TICKS,
  ARENA_ZONE_DAMAGE_SHARE,
  ARENA_ZONE_INTERVAL_TICKS,
  ARENA_ZONE_ROWS,
  ARENA_ZONE_WARNING_TICKS,
  arenaSpawnMarks,
  createSpaceshipSimulationConfig
} from "@spaceship-defender/game-core";

import { DEFAULT_SHIP_ARCHETYPES, DEFAULT_SHIP_ARCHETYPE_ID } from "./shipCatalogue.ts";

export const DEFAULT_PRESET_ID = "default";

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
  rotateInPlaceThrottle: 0.02,
  /*
   * STEEL VOID's own dead zones, and they belong in the defaults rather than in
   * a preset: only the solo cockpit reads them, the cockpit is the thing being
   * ported, and it has no earlier behaviour to preserve. The coop panels draw
   * their own sticks and never look at these, so a zero here bought nothing and
   * cost the cockpit the tremble guard it was ported for.
   */
  driveDeadzoneShare: 0.12,
  aimDeadzoneShare: 0.1,
  /** The coop panels draw their own zones; only the cockpit reads this. */
  driveZoneShare: 0.42,
  /** Only the cockpit projects an aim point; the coop panels ignore it. */
  aimProjectionShare: 0.58,
  /*
   * Both off, because the arcade profile has neither.
   *
   * Three degrees of dead band and sixty milliseconds of filter came from the
   * prototype's tank profile, where a forty-tonne hull is supposed to ignore
   * thumb noise. Its arcade profile sets both to zero and the difference is the
   * whole feel: the nose answers the finger on the frame the finger moved.
   */
  headingDeadbandRadians: 0,
  headingFilterSeconds: 0,
  turretLeadRadians: 0.45
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
    reactionTicks: 36,
    retargetIntervalTicks: 120,
    aimJitterRadians: 0.18,
    leadFactor: 0,
    orbit: false,
    evadeMissiles: false,
    dodgeBullets: false,
    threatAwareShield: false,
    // Choosing the distance is part of the craft, so the beginner does not:
    // it wanders inside its own reach, where more of the field can answer it.
    standoffShare: 0.6,
    standoffDistance: 250,
    evadeHorizonTicks: 0,
    mgConeRadians: Math.PI,
    cannonConeRadians: Math.PI,
    mgHeatCeiling: 1,
    cannonHeatCeiling: 1,
    shieldLeadTicks: 0,
    shieldMinEnergy: 0
  },
  veteran: {
    reactionTicks: 60,
    retargetIntervalTicks: 90,
    aimJitterRadians: 0.06,
    leadFactor: 0.65,
    orbit: true,
    evadeMissiles: true,
    dodgeBullets: false,
    threatAwareShield: true,
    standoffShare: 0.85,
    standoffDistance: 400,
    evadeHorizonTicks: 36,
    mgConeRadians: 0.35,
    cannonConeRadians: 0.2,
    mgHeatCeiling: 0.75,
    cannonHeatCeiling: 0.8,
    shieldLeadTicks: 60,
    shieldMinEnergy: 0.15
  },
  ace: {
    reactionTicks: 60,
    retargetIntervalTicks: 90,
    aimJitterRadians: 0,
    leadFactor: 1,
    orbit: true,
    evadeMissiles: true,
    dodgeBullets: true,
    threatAwareShield: true,
    standoffShare: 0.85,
    standoffDistance: 400,
    evadeHorizonTicks: 36,
    mgConeRadians: 0.5,
    cannonConeRadians: 0.06,
    mgHeatCeiling: 0.95,
    cannonHeatCeiling: 0.95,
    shieldLeadTicks: 60,
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
    reactionTicks: 30,
    leadFactor: 0.6,
    orbit: false,
    standoffShare: 0.5,
    mgConeRadians: 0.25,
    mgHeatCeiling: 0.6
  },
  ace: {
    reactionTicks: 30,
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
    standoffDistance: 450,
    evadeHorizonTicks: 0,
    cannonConeRadians: 0.12,
    cannonHeatCeiling: 0.8,
    shieldLeadTicks: 30
  },
  ace: {
    leadFactor: 0.6,
    orbit: false,
    evadeMissiles: false,
    standoffShare: 0.75,
    standoffDistance: 450,
    evadeHorizonTicks: 0,
    cannonConeRadians: 0.12,
    cannonHeatCeiling: 0.8,
    shieldLeadTicks: 30
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

/**
 * What the campaign generator was built with. Numbers an operator can now turn
 * from the console; the script reads them back rather than carrying its own.
 */
export const DEFAULT_CAMPAIGN_AUTHORING = {
  budgetBase: 14,
  budgetGrowth: 2,
  bossEscortShare: 0.5,
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
  groupStartStepSeconds: 18,
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
    shieldAutopilotRaiseRange: config.shieldAutopilotRaiseRange,
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
    // The spiral the arena used to compute, written down: the operator can now
    // drag a mark, and a preset that never touches this plays as it always did.
    arena: {
      spawnMarks: arenaSpawnMarks(ARENA_SPAWN_MARKS, config.arenaRadius - 160).map(
        (mark: { readonly x: number; readonly y: number }) => ({
          x: Math.round(mark.x),
          y: Math.round(mark.y)
        })
      ),
      zoneColumns: ARENA_ZONE_COLUMNS,
      zoneRows: ARENA_ZONE_ROWS,
      matchTickLimit: ARENA_MATCH_TICK_LIMIT,
      fieldRadius: config.arenaRadius,
      cameraViewWidth: config.cameraViewWidth,
      hullScaling: ARENA_HULL_SCALING,
      shieldHitCostShare: ARENA_SHIELD_HIT_COST_SHARE,
      shieldAutopilotRaiseRange: ARENA_SHIELD_RAISE_RANGE,
      damageScaling: ARENA_DAMAGE_SCALING,
      scanRadiusCells: ARENA_SCAN_RADIUS_CELLS,
      scanCooldownTicks: ARENA_SCAN_COOLDOWN_TICKS,
      scanRevealTicks: ARENA_SCAN_REVEAL_TICKS,
      lootFirstSpawnTicks: ARENA_LOOT_FIRST_SPAWN_TICKS,
      lootIntervalTicks: ARENA_LOOT_INTERVAL_TICKS,
      lootCargoIntervalTicks: ARENA_LOOT_CARGO_INTERVAL_TICKS,
      zoneIntervalTicks: ARENA_ZONE_INTERVAL_TICKS,
      zonesPerClosure: ARENA_ZONES_PER_CLOSURE,
      zoneWarningTicks: ARENA_ZONE_WARNING_TICKS,
      zoneDamageIntervalTicks: ARENA_ZONE_DAMAGE_INTERVAL_TICKS,
      zoneBitesToKill: Math.round(1 / ARENA_ZONE_DAMAGE_SHARE)
    },
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
    turretMountedOnHull: config.turretMountedOnHull,
    mgDamage: config.mgDamage,
    mgFireCooldownTicks: config.mgFireCooldownTicks,
    mgProjectileSpeedPerSecond: config.mgProjectileSpeedPerSecond,
    mgProjectileRadius: config.mgProjectileRadius,
    projectileVisual: config.projectileVisual,
    turretVisual: config.turretVisual,
    machineGunVisual: config.machineGunVisual,
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
