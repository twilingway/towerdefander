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
  fixedStepMs: 1000 / 60,
  worldWidth: 4400,
  worldHeight: 4400,
  // The frame the campaign is balanced inside, and the same one the console
  // carries: every barrel is bounded by half its height, and the shell that
  // catalogue counts health in reaches 680.
  cameraViewWidth: 2500,
  background: { parallaxStrength: 1, driftSpeed: 1, nebulaAlpha: 0.72, nebulaPreset: "blue" },
  spaceshipVisual: null,
  arenaRadius: 2200,
  /*
   * The reference prototype's arcade profile, in our terms.
   *
   * It divides a top speed by three numbers to get its accelerations
   * (`shared/tuning.ts`: 0.564, 0.327, 0.413), so at 620 units a second they
   * come out near eleven hundred, nineteen hundred and fifteen hundred. What
   * makes it read as arcade is not the speed but the shape: full thrust in half
   * a second, a stop in less, and a reverse that is more than half of forward
   * rather than a crawl.
   */
  spaceshipAccelerationPerSecondSquared: 1100,
  spaceshipBrakingPerSecondSquared: 1500,
  spaceshipReverseSpeedFactor: 0.58,
  spaceshipRadius: 52,
  inputTimeoutTicks: 15,
  // Reach is speed times lifetime, and the honest ceiling for it is half the
  // frame's height - the short way out of the picture, and therefore the only
  // distance a crew is sure to see what it is shooting at on any glass. At 680
  // ms the shell carries 680 and the nose burst 612, both inside the 703 the
  // frame promises. It used to be a second and a half, which is a shell a
  // moving target simply leaves, and fire at what the display had not drawn.
  projectileLifetimeMs: 680,
  shieldDrainPerSecond: 20,
  shieldRechargePerSecond: 10,
  shieldEngageTicks: 30,
  shieldMinimumUpTicks: 120,
  shieldCooldownTicks: 60,
  shieldRearmEnergy: 25,
  turretMaxAngularSpeedPerSecond: (13 * Math.PI) / 30,
  turretAngularAccelerationPerSecondSquared: (13 * Math.PI) / 15,
  turretAngularBrakingPerSecondSquared: (13 * Math.PI) / 10,
  /*
   * Left where it was, deliberately.
   *
   * The arcade profile this drive comes from points its barrel instantly and
   * carries it on the hull, and taking that too would delete the gunner's whole
   * craft - traverse, braking, the tap, the overshoot a close target invites.
   * Thirteen tests said so before a single one was rewritten. The hull flies
   * like the prototype; the gun is still ours.
   */
  turretMountedOnHull: false,
  shieldMaxAngularSpeedPerSecond: (13 * Math.PI) / 24,
  shieldAngularAccelerationPerSecondSquared: (13 * Math.PI) / 12,
  shieldAngularBrakingPerSecondSquared: (13 * Math.PI) / 8,
  /*
   * Two hundred and forty degrees a second, and no angular inertia at all.
   *
   * The prototype's arcade profile turns at a hundred degrees a second on the
   * keys and multiplies that by 2.4 for the stick; the cockpit is the stick, so
   * that is the number the hull gets. `yawAccel` there is literally infinite -
   * the heading is rate-limited and nothing else - and four hundred is our
   * finite spelling of it: at sixty hertz the cap is reached in the first step.
   */
  headingMaxAngularSpeedPerSecond: (4 * Math.PI) / 3,
  headingAngularAccelerationPerSecondSquared: 400,
  headingAngularBrakingPerSecondSquared: 400,
  mgFireCooldownTicks: 6,
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
  enemySpawnIntervalTicks: 36,
  ambientAsteroidIntervalMinTicks: 120,
  ambientAsteroidIntervalMaxTicks: 300,
  intermissionTicks: 1800,
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
        reactionTicks: 30,
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
        reactionTicks: 12,
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
        reactionTicks: 3,
        aimJitterRadians: 0,
        leadFactor: 1,
        orbitShare: 0.6,
        rangeBandUnits: 280,
        separationWeight: 0.7,
        flankSpread: 1,
        evadeHorizonTicks: 42,
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
  asteroidLifetimeTicks: 1500,
  asteroidSpawnCost: 1,
  asteroidScoreReward: 10,
  asteroidCreditReward: 1,
  // Salvage: the only hull a crew wins back inside a run. Every number here is
  // a guess until a batch says otherwise; the chance per archetype is what
  // actually decides whether runs get longer.
  lootRepairShare: 0.06,
  lootShieldAmount: 30,
  lootBossRepairShare: 1,
  lootLifetimeTicks: 900,
  lootDropRadius: 18,
  lootMagnetRadius: 260,
  lootMagnetAccelerationPerSecondSquared: 900,
  lootDriftDampingPerSecond: 1.6,
  lootWindowTicks: 900,
  lootBossWindowTicks: 1800,
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
