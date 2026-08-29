import { type SpaceshipSimulationConfig } from "./spaceshipSimulation.ts";
/** The built-in balance the server starts from before a preset is loaded. */
export const defaultSpaceshipSimulationConfig: SpaceshipSimulationConfig = {
  fixedStepMs: 50,
  worldWidth: 4400,
  worldHeight: 4400,
  cameraViewWidth: 2200,
  background: { parallaxStrength: 1, driftSpeed: 1, nebulaAlpha: 0.72, nebulaPreset: "blue" },
  spaceshipVisual: null,
  arenaRadius: 2200,
  spaceshipSpeedPerSecond: 320,
  spaceshipAccelerationPerSecondSquared: 640,
  spaceshipBrakingPerSecondSquared: 800,
  spaceshipRadius: 52,
  inputTimeoutTicks: 5,
  projectileSpeedPerSecond: 720,
  projectileLifetimeMs: 1500,
  projectileRadius: 8,
  fireCooldownTicks: 5,
  shieldCapacity: 100,
  shieldDrainPerSecond: 20,
  shieldRechargePerSecond: 10,
  shieldEngageTicks: 20,
  shieldMinimumUpTicks: 40,
  shieldCooldownTicks: 20,
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
  mgDamage: 8,
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
  spaceshipMaxHp: 500,
  shieldRadius: 104,
  shieldArcRadians: Math.PI / 2,
  asteroidShieldHitCost: 20,
  asteroidDamage: 40,
  friendlyProjectileDamage: 25,
  enemySpawnIntervalTicks: 12,
  ambientAsteroidIntervalMinTicks: 40,
  ambientAsteroidIntervalMaxTicks: 100,
  intermissionTicks: 600,
  waveCampaign: {
    waves: [],
    director: {
      baseBudget: 5,
      budgetGrowth: 2,
      budgetCap: 120,
      hpGrowth: 0.12,
      hpMultiplierCap: 8,
      tempoGrowth: 0.05,
      tempoMultiplierCap: 3,
      bossWaveInterval: 5
    }
  },
  enemyArchetypes: {
    gunship: {
      hp: 50,
      radius: 28,
      speedPerSecond: 150,
      preferredDistance: 650,
      turnRatePerSecond: (2 * Math.PI) / 3,
      turnAccelerationPerSecondSquared: 2 * ((2 * Math.PI) / 3),
      turnBrakingPerSecondSquared: 3 * ((2 * Math.PI) / 3),
      weapons: [
        {
          kind: "bullet",
          cooldownTicks: 30,
          damage: 10,
          shieldHitCost: 4,
          projectileRadius: 7,
          projectileSpeedPerSecond: 440,
          projectileLifetimeTicks: 180,
          engagementRange: 1200,
          turnRatePerSecond: Math.PI / 2,
          burstCount: 1,
          burstSpreadRadians: 0,
          visual: null
        }
      ],
      visual: {
        shape: "ship-delta",
        modelScale: 1,
        showHealthBar: false
      },
      label: "Ганшип",
      spawnPolicy: "standard",
      spawnCost: 2,
      unlockWave: 1,
      scoreReward: 25,
      creditReward: 2
    },
    missileCarrier: {
      hp: 110,
      radius: 38,
      speedPerSecond: 95,
      preferredDistance: 900,
      turnRatePerSecond: Math.PI / 2,
      turnAccelerationPerSecondSquared: 2 * (Math.PI / 2),
      turnBrakingPerSecondSquared: 3 * (Math.PI / 2),
      weapons: [
        {
          kind: "missile",
          cooldownTicks: 70,
          damage: 30,
          shieldHitCost: 12,
          projectileRadius: 12,
          projectileSpeedPerSecond: 260,
          projectileLifetimeTicks: 240,
          engagementRange: 1700,
          turnRatePerSecond: Math.PI / 2,
          burstCount: 1,
          burstSpreadRadians: 0,
          visual: null
        }
      ],
      visual: {
        shape: "ship-broadwing",
        modelScale: 1,
        showHealthBar: false
      },
      label: "Ракетоносец",
      spawnPolicy: "standard",
      spawnCost: 4,
      unlockWave: 3,
      scoreReward: 25,
      creditReward: 4
    },
    sniper: {
      hp: 70,
      radius: 30,
      speedPerSecond: 70,
      preferredDistance: 1400,
      turnRatePerSecond: (2 * Math.PI) / 5,
      turnAccelerationPerSecondSquared: 2 * ((2 * Math.PI) / 5),
      turnBrakingPerSecondSquared: 3 * ((2 * Math.PI) / 5),
      weapons: [
        {
          kind: "bullet",
          cooldownTicks: 100,
          damage: 35,
          shieldHitCost: 10,
          projectileRadius: 9,
          projectileSpeedPerSecond: 900,
          projectileLifetimeTicks: 120,
          engagementRange: 3000,
          turnRatePerSecond: Math.PI / 2,
          burstCount: 1,
          burstSpreadRadians: 0,
          visual: null
        }
      ],
      visual: {
        shape: "ship-needle",
        modelScale: 1,
        showHealthBar: false
      },
      label: "Снайпер",
      spawnPolicy: "standard",
      spawnCost: 3,
      unlockWave: 5,
      scoreReward: 30,
      creditReward: 3
    },
    interceptor: {
      hp: 22,
      radius: 18,
      speedPerSecond: 260,
      preferredDistance: 320,
      turnRatePerSecond: (4 * Math.PI) / 3,
      turnAccelerationPerSecondSquared: 2 * ((4 * Math.PI) / 3),
      turnBrakingPerSecondSquared: 3 * ((4 * Math.PI) / 3),
      weapons: [
        {
          kind: "bullet",
          cooldownTicks: 12,
          damage: 4,
          shieldHitCost: 2,
          projectileRadius: 5,
          projectileSpeedPerSecond: 520,
          projectileLifetimeTicks: 90,
          engagementRange: 600,
          turnRatePerSecond: Math.PI / 2,
          burstCount: 1,
          burstSpreadRadians: 0,
          visual: null
        }
      ],
      visual: {
        shape: "ship-spear",
        modelScale: 1,
        showHealthBar: false
      },
      label: "Перехватчик",
      spawnPolicy: "standard",
      spawnCost: 1,
      unlockWave: 1,
      scoreReward: 12,
      creditReward: 1
    },
    boss: {
      hp: 900,
      radius: 90,
      speedPerSecond: 60,
      preferredDistance: 700,
      turnRatePerSecond: Math.PI / 4,
      turnAccelerationPerSecondSquared: 2 * (Math.PI / 4),
      turnBrakingPerSecondSquared: 3 * (Math.PI / 4),
      weapons: [
        {
          kind: "missile",
          cooldownTicks: 60,
          damage: 30,
          shieldHitCost: 12,
          projectileRadius: 14,
          projectileSpeedPerSecond: 240,
          projectileLifetimeTicks: 300,
          engagementRange: 1600,
          turnRatePerSecond: Math.PI / 2,
          burstCount: 3,
          burstSpreadRadians: Math.PI / 6,
          visual: null
        }
      ],
      visual: {
        shape: "boss-dreadnought",
        modelScale: 1,
        showHealthBar: true
      },
      label: "Босс",
      spawnPolicy: "boss",
      spawnCost: 20,
      unlockWave: 10,
      scoreReward: 250,
      creditReward: 30
    }
  },
  asteroidHp: 65,
  asteroidRadius: 34,
  asteroidSpeedPerSecond: 190,
  asteroidLifetimeTicks: 500,
  asteroidSpawnCost: 1,
  asteroidScoreReward: 10,
  asteroidCreditReward: 1,
  asteroidVisual: null,
  missileInterceptScoreReward: 5,
  worldPadding: 256,
  spatialCellSize: 256,
  caps: {
    enemyShips: 40,
    asteroids: 16,
    hostileProjectiles: 96,
    homingMissiles: 12,
    friendlyProjectiles: 32,
    dynamicEntities: 196
  }
};
