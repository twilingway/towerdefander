import {
  BUILTIN_ENEMY_KINDS,
  type AutopilotProfile,
  type BalanceTuning,
  type EnemyArchetype
} from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import {
  directorBudgetAt,
  secondsToTicks,
  ticksToSeconds,
  entryStats,
  spawnCostOf,
  summariseCampaign,
  summariseWave,
  weaponReach
} from "./waveSummary.js";

function archetype(spawnCost: number, unlockWave = 1): EnemyArchetype {
  return {
    hp: 50,
    radius: 28,
    speedPerSecond: 150,
    preferredDistance: 650,
    turnRatePerSecond: (2 * Math.PI) / 3,
    turnAccelerationPerSecondSquared: (4 * Math.PI) / 3,
    turnBrakingPerSecondSquared: 2 * Math.PI,
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
      shape: "ship-spear",
      modelScale: 1,
      showHealthBar: false
    },
    label: "Test",
    spawnPolicy: "standard",
    spawnCost,
    unlockWave,
    scoreReward: 25,
    creditReward: 2
  };
}

function autopilotProfile(): AutopilotProfile {
  return {
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
  };
}

function tuning(): BalanceTuning {
  return {
    enemyArchetypes: Object.fromEntries(
      BUILTIN_ENEMY_KINDS.map((kind) => [
        kind,
        archetype(kind === "boss" ? 20 : 2, kind === "boss" ? 10 : 1)
      ])
    ),
    waveCampaign: {
      waves: [
        {
          entries: [
            {
              kind: "gunship",
              count: 3,
              spawnIntervalTicks: 20,
              sectors: ["N"],
              hpMultiplier: null,
              tempoMultiplier: null
            },
            {
              kind: "asteroid",
              count: 2,
              spawnIntervalTicks: 10,
              sectors: [],
              hpMultiplier: null,
              tempoMultiplier: null
            }
          ],
          hpMultiplier: null,
          tempoMultiplier: null
        }
      ],
      director: {
        baseBudget: 5,
        budgetGrowth: 2,
        budgetCap: 11,
        hpGrowth: 0.12,
        hpMultiplierCap: 8,
        tempoGrowth: 0.05,
        tempoMultiplierCap: 3,
        bossWaveInterval: 5
      }
    },
    enemySpawnIntervalTicks: 12,
    intermissionTicks: 600,
    ambientAsteroidIntervalMinTicks: 40,
    ambientAsteroidIntervalMaxTicks: 100,
    asteroidHp: 65,
    asteroidRadius: 34,
    asteroidSpeedPerSecond: 190,
    asteroidLifetimeTicks: 500,
    asteroidDamage: 40,
    asteroidShieldHitCost: 20,
    asteroidSpawnCost: 1,
    asteroidScoreReward: 10,
    asteroidCreditReward: 1,
    projectileVisual: null,
    turretVisual: null,
    mgProjectileVisual: null,
    asteroidVisual: null,
    spaceshipVisual: null,
    spaceshipMaxHp: 500,
    spaceshipRadius: 52,
    spaceshipSpeedPerSecond: 320,
    spaceshipAccelerationPerSecondSquared: 640,
    spaceshipBrakingPerSecondSquared: 800,
    headingMaxAngularSpeedPerSecond: 2.72,
    headingAngularAccelerationPerSecondSquared: 5.44,
    headingAngularBrakingPerSecondSquared: 8.16,
    friendlyProjectileDamage: 25,
    fireCooldownTicks: 5,
    projectileSpeedPerSecond: 720,
    projectileRadius: 8,
    projectileLifetimeMs: 1500,
    turretMaxAngularSpeedPerSecond: 1.36,
    turretAngularAccelerationPerSecondSquared: 2.72,
    turretAngularBrakingPerSecondSquared: 4.08,
    mgDamage: 8,
    mgFireCooldownTicks: 2,
    mgProjectileSpeedPerSecond: 900,
    mgProjectileRadius: 5,
    cannonHeatCapacity: 100,
    cannonHeatPerShot: 16,
    cannonCoolingPerSecond: 22,
    cannonRearmThreshold: 35,
    mgHeatCapacity: 100,
    mgHeatPerShot: 4,
    mgCoolingPerSecond: 30,
    mgRearmThreshold: 30,
    shieldCapacity: 100,
    shieldDrainPerSecond: 20,
    shieldRechargePerSecond: 10,
    shieldRadius: 104,
    shieldArcRadians: Math.PI / 2,
    shieldMaxAngularSpeedPerSecond: 1.7,
    shieldAngularAccelerationPerSecondSquared: 3.4,
    shieldAngularBrakingPerSecondSquared: 5.1,
    missileInterceptScoreReward: 5,
    cameraViewWidth: 1600,
    background: { parallaxStrength: 1, driftSpeed: 1, nebulaAlpha: 0.72, nebulaPreset: "blue" },
    autopilot: {
      level: "veteran",
      profiles: {
        rookie: autopilotProfile(),
        veteran: autopilotProfile(),
        ace: autopilotProfile()
      }
    }
  };
}

describe("spawn cost lookup", () => {
  it("reads the archetype cost for enemy kinds and the hazard cost for asteroids", () => {
    const value = tuning();
    expect(spawnCostOf(value, "gunship")).toBe(2);
    expect(spawnCostOf(value, "boss")).toBe(20);
    expect(spawnCostOf(value, "asteroid")).toBe(1);
  });
});

describe("director budget", () => {
  it("grows per wave and stops at the cap", () => {
    const value = tuning();
    expect(directorBudgetAt(value, 1)).toBe(5);
    expect(directorBudgetAt(value, 3)).toBe(9);
    expect(directorBudgetAt(value, 50)).toBe(11);
  });
});

describe("wave summary", () => {
  it("counts threats, cost and spawn time", () => {
    const value = tuning();
    const wave = value.waveCampaign.waves[0];
    if (wave === undefined) throw new Error("fixture must contain a wave");
    const summary = summariseWave(value, wave, 1);
    expect(summary.threatCount).toBe(5);
    expect(summary.spawnCost).toBe(3 * 2 + 2 * 1);
    expect(summary.spawnSeconds).toBeCloseTo((3 * 20 + 2 * 10) * 0.05);
  });

  it("flags a wave that costs more than the director budget of the same number", () => {
    const value = tuning();
    const wave = value.waveCampaign.waves[0];
    if (wave === undefined) throw new Error("fixture must contain a wave");
    // Cost is 8: over the wave-1 budget of 5, within the wave-3 budget of 9.
    expect(summariseWave(value, wave, 1).overBudget).toBe(true);
    expect(summariseWave(value, wave, 3).overBudget).toBe(false);
  });

  it("projects the hp a group will actually spawn with", () => {
    const value = tuning();
    const wave = value.waveCampaign.waves[0];
    const entry = wave?.entries[0];
    if (entry === undefined) throw new Error("fixture must contain an entry");
    // Wave 3 under the default curve: 1 + 0.12 * 2 = 1.24.
    const onWaveThree = entryStats(value, entry, 3);
    expect(onWaveThree.hpMultiplier).toBeCloseTo(1.24);
    expect(onWaveThree.hp).toBeCloseTo(50 * 1.24);
    // A per-group override wins over the wave curve.
    const overridden = entryStats(value, { ...entry, hpMultiplier: 5 }, 3);
    expect(overridden.hp).toBeCloseTo(250);
    expect(overridden.tempoMultiplier).toBeCloseTo(onWaveThree.tempoMultiplier);
  });

  it("shortens the reload as the tempo multiplier grows", () => {
    const value = tuning();
    const entry = value.waveCampaign.waves[0]?.entries[0];
    if (entry === undefined) throw new Error("fixture must contain an entry");
    const slow = entryStats(value, { ...entry, tempoMultiplier: 1 }, 1);
    const fast = entryStats(value, { ...entry, tempoMultiplier: 3 }, 1);
    expect(slow.cooldownTicks).toBe(30);
    expect(fast.cooldownTicks).toBe(10);
  });

  it("numbers campaign waves from one", () => {
    const value = tuning();
    const campaign = {
      ...value,
      waveCampaign: {
        ...value.waveCampaign,
        waves: [...value.waveCampaign.waves, ...value.waveCampaign.waves]
      }
    };
    expect(summariseCampaign(campaign).map(({ waveNumber }) => waveNumber)).toEqual([1, 2]);
  });
});

describe("tick and second conversion", () => {
  it("round-trips the values operators actually type", () => {
    for (const ticks of [1, 12, 30, 180, 600]) {
      expect(secondsToTicks(ticksToSeconds(ticks))).toBe(ticks);
    }
    expect(ticksToSeconds(12)).toBe(0.6);
    expect(secondsToTicks(0.6)).toBe(12);
  });

  it("keeps a tiny value at one tick instead of zero", () => {
    expect(secondsToTicks(0.01)).toBe(1);
    expect(secondsToTicks(0)).toBe(1);
  });

  it("snaps a value between ticks to the nearest step", () => {
    expect(secondsToTicks(0.62)).toBe(12);
    expect(secondsToTicks(0.68)).toBe(14);
  });
});

describe("weapon reach", () => {
  it("turns projectile speed and lifetime into world units", () => {
    const weapon = archetype(2).weapons[0];
    if (weapon === undefined) throw new Error("fixture must carry a weapon");
    // 440 units per second for 180 ticks of 50 ms.
    expect(weaponReach(weapon)).toBe(3960);
    expect(
      weaponReach({ ...weapon, projectileSpeedPerSecond: 900, projectileLifetimeTicks: 120 })
    ).toBe(5400);
  });
});
