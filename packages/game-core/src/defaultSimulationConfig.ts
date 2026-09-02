import {
  AUTHORED_DIRECTOR,
  AUTHORED_ENEMY_ARCHETYPES,
  AUTHORED_SHIP_STATS,
  AUTHORED_WAVES
} from "./authoredCampaign.ts";
import { DEFAULT_ENDLESS_TIER, DEFAULT_MODULE_TIERS } from "./moduleTree.ts";
import { type SpaceshipSimulationConfig } from "./spaceshipSimulation.ts";
/** The built-in balance the server starts from before a preset is loaded. */
export const defaultSpaceshipSimulationConfig: SpaceshipSimulationConfig = {
  fixedStepMs: 50,
  worldWidth: 4400,
  worldHeight: 4400,
  // The frame the campaign is balanced inside, and the same one the console
  // carries: every barrel is bounded by half its height, and the shell that
  // catalogue counts health in reaches 680.
  cameraViewWidth: 2500,
  background: { parallaxStrength: 1, driftSpeed: 1, nebulaAlpha: 0.72, nebulaPreset: "blue" },
  spaceshipVisual: null,
  arenaRadius: 2200,
  spaceshipAccelerationPerSecondSquared: 640,
  spaceshipBrakingPerSecondSquared: 800,
  spaceshipReverseSpeedFactor: 0.4,
  spaceshipRadius: 52,
  inputTimeoutTicks: 5,
  // Reach is speed times lifetime, and the honest ceiling for it is half the
  // frame's height - the short way out of the picture, and therefore the only
  // distance a crew is sure to see what it is shooting at on any glass. At 680
  // ms the shell carries 680 and the nose burst 612, both inside the 703 the
  // frame promises. It used to be a second and a half, which is a shell a
  // moving target simply leaves, and fire at what the display had not drawn.
  projectileLifetimeMs: 680,
  shieldDrainPerSecond: 20,
  shieldRechargePerSecond: 10,
  shieldEngageTicks: 10,
  shieldMinimumUpTicks: 40,
  shieldCooldownTicks: 20,
  shieldRearmEnergy: 25,
  turretMaxAngularSpeedPerSecond: (13 * Math.PI) / 30,
  turretAngularAccelerationPerSecondSquared: (13 * Math.PI) / 15,
  turretAngularBrakingPerSecondSquared: (13 * Math.PI) / 10,
  shieldMaxAngularSpeedPerSecond: (13 * Math.PI) / 24,
  shieldAngularAccelerationPerSecondSquared: (13 * Math.PI) / 12,
  shieldAngularBrakingPerSecondSquared: (13 * Math.PI) / 8,
  // Half a turn a second, started and stopped almost instantly: the hull has no
  // visible flywheel, so angular inertia reads as input lag rather than weight.
  headingMaxAngularSpeedPerSecond: Math.PI,
  headingAngularAccelerationPerSecondSquared: 50,
  headingAngularBrakingPerSecondSquared: 50,
  mgFireCooldownTicks: 2,
  mgProjectileSpeedPerSecond: 900,
  mgProjectileRadius: 5,
  projectileVisual: null,
  turretVisual: null,
  mgProjectileVisual: null,
  cannonHeatCapacity: 100,
  cannonHeatPerShot: 16,
  cannonCoolingPerSecond: 22,
  cannonRearmThreshold: 35,
  mgHeatCapacity: 100,
  mgHeatPerShot: 4,
  mgCoolingPerSecond: 30,
  mgRearmThreshold: 30,
  cannonWeaponKind: "kinetic",
  mgWeaponKind: "kinetic",
  // Shorter than the cannon's kinetic reach on purpose: never missing has to
  // cost something, and the something is having to be close. Both barrels keep
  // the ratio they had against the shell they replace, now that the shell
  // itself is bounded by the frame.
  cannonLaserRange: 440,
  mgLaserRange: 300,
  laserBeamRadius: 5,
  friendlyMissileTurnRatePerSecond: (4 * Math.PI) / 15,
  friendlyMissileAcquireConeRadians: Math.PI / 20,
  shieldRadius: 104,
  shieldArcRadians: Math.PI / 2,
  asteroidShieldHitCost: 20,
  asteroidDamage: 40,
  enemySpawnIntervalTicks: 12,
  ambientAsteroidIntervalMinTicks: 40,
  ambientAsteroidIntervalMaxTicks: 100,
  intermissionTicks: 600,
  // The campaign the console shows, not a second one: an empty table left the
  // director improvising every wave, and a server without a preset played a
  // different game from the one that was tuned.
  waveCampaign: { waves: AUTHORED_WAVES, director: AUTHORED_DIRECTOR },
  /**
   * Neutral against the enemy that predated the profiles: `rookie` carries the
   * old orbit share and range band, so a catalogue set to it plays the way it
   * always did. The levels above it are where the difficulty actually lives.
   */
  enemySkill: {
    offset: 0,
    profiles: {
      rookie: {
        reactionTicks: 10,
        aimJitterRadians: 0.1,
        leadFactor: 0,
        orbitShare: 0.35,
        rangeBandUnits: 120,
        separationWeight: 0,
        flankSpread: 0,
        evadeHorizonTicks: 0,
        retreatHpFraction: 0,
        retreatStandoffFactor: 1
      },
      veteran: {
        reactionTicks: 4,
        aimJitterRadians: 0.04,
        leadFactor: 0.6,
        orbitShare: 0.5,
        rangeBandUnits: 200,
        separationWeight: 0.4,
        flankSpread: 0.5,
        evadeHorizonTicks: 0,
        retreatHpFraction: 0.25,
        retreatStandoffFactor: 1.4
      },
      ace: {
        reactionTicks: 1,
        aimJitterRadians: 0,
        leadFactor: 1,
        orbitShare: 0.6,
        rangeBandUnits: 280,
        separationWeight: 0.7,
        flankSpread: 1,
        evadeHorizonTicks: 14,
        retreatHpFraction: 0.35,
        retreatStandoffFactor: 1.6
      }
    }
  },
  // Thirty archetypes with their distances, health and cadence as authored -
  // health counted in cannon hits of the gun below, which is the whole reason
  // these two have to travel together.
  enemyArchetypes: AUTHORED_ENEMY_ARCHETYPES,
  asteroidHp: 65,
  asteroidRadius: 34,
  asteroidSpeedPerSecond: 190,
  asteroidLifetimeTicks: 500,
  asteroidSpawnCost: 1,
  asteroidScoreReward: 10,
  asteroidCreditReward: 1,
  // Salvage: the only hull a crew wins back inside a run. Every number here is
  // a guess until a batch says otherwise; the chance per archetype is what
  // actually decides whether runs get longer.
  lootRepairShare: 0.06,
  lootShieldAmount: 30,
  lootBossRepairShare: 1,
  lootLifetimeTicks: 300,
  lootDropRadius: 18,
  lootMagnetRadius: 260,
  lootMagnetAccelerationPerSecondSquared: 900,
  lootDriftDampingPerSecond: 1.6,
  lootWindowTicks: 300,
  lootBossWindowTicks: 600,
  asteroidVisual: null,
  missileInterceptScoreReward: 5,
  worldPadding: 256,
  spatialCellSize: 256,
  caps: {
    enemyShips: 40,
    asteroids: 16,
    lootDrops: 12,
    hostileProjectiles: 96,
    homingMissiles: 12,
    friendlyProjectiles: 32,
    dynamicEntities: 208
  },
  moduleTiers: DEFAULT_MODULE_TIERS,
  endlessTier: DEFAULT_ENDLESS_TIER,
  // Last, so it wins: the gun the catalogue above was balanced against. Health
  // in that catalogue is written as "how many hits of this does it take", so a
  // default that fires anything else makes the whole table say the wrong thing
  // - which is exactly what it used to do, at 25 damage against a table
  // counted in 38s.
  ...AUTHORED_SHIP_STATS
};
