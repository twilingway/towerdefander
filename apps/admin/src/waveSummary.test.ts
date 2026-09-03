import {
  BUILTIN_ENEMY_KINDS,
  CREW_ROLES,
  MODULE_TIER_WIDTHS,
  type AutopilotProfile,
  type BalanceTuning,
  type EnemyArchetype,
  type EnemySkillProfile,
  type ShipArchetype
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
    combatSkill: "rookie",
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
    creditReward: 2,
    lootChance: 0.2
  };
}

function enemySkillProfile(): EnemySkillProfile {
  return {
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
    standoffShare: 0.7,
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

function autopilotLevels() {
  return { rookie: autopilotProfile(), veteran: autopilotProfile(), ace: autopilotProfile() };
}

/** A hull of the exact shape the schema demands; the numbers do not matter here. */
function shipArchetype(): ShipArchetype {
  const card = (id: string, slot: number) => ({
    id,
    label: `Module ${id}`,
    role: CREW_ROLES[slot % CREW_ROLES.length] ?? ("pilot" as const),
    effects: [{ target: "spaceshipMaxHp" as const, op: "add" as const, value: 5 }]
  });
  return {
    label: "Hull",
    description: "Test hull",
    visual: null,
    unlockedAtWave: 1,
    overrides: { stats: {}, cannonWeaponKind: null, mgWeaponKind: null },
    tiers: MODULE_TIER_WIDTHS.map((width, tier) =>
      Array.from({ length: width }, (_unused, slot) =>
        card(`t${String(tier)}m${String(slot)}`, slot)
      )
    ),
    endlessTier: [card("endless", 0)]
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
              startDelayTicks: 0,
              spawnIntervalTicks: 20,
              sectors: ["N"],
              hpMultiplier: null,
              tempoMultiplier: null
            },
            {
              kind: "asteroid",
              count: 2,
              startDelayTicks: 30,
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
      },
      authoring: {
        budgetBase: 5,
        budgetGrowth: 1.5,
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
        groupStartStepSeconds: 7,
        swarmIntervalSeconds: 3,
        lineIntervalSeconds: 7,
        heavyIntervalSeconds: 11,
        bossFloorSeconds: 30
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
    projectileVisual: null,
    turretVisual: null,
    mgProjectileVisual: null,
    asteroidVisual: null,
    spaceshipVisual: null,
    shipArchetypes: { guardian: shipArchetype() },
    defaultShipArchetypeId: "guardian",
    spaceshipMaxHp: 500,
    spaceshipRadius: 52,
    spaceshipSpeedPerSecond: 320,
    spaceshipAccelerationPerSecondSquared: 640,
    spaceshipBrakingPerSecondSquared: 800,
    spaceshipReverseSpeedFactor: 0.4,
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
    cannonWeaponKind: "kinetic",
    mgWeaponKind: "kinetic",
    cannonLaserRange: 900,
    mgLaserRange: 620,
    laserBeamRadius: 5,
    friendlyMissileTurnRatePerSecond: Math.PI / 2,
    friendlyMissileAcquireConeRadians: Math.PI / 6,
    shieldCapacity: 100,
    shieldDrainPerSecond: 20,
    shieldRechargePerSecond: 10,
    shieldEngageTicks: 20,
    shieldMinimumUpTicks: 40,
    shieldCooldownTicks: 20,
    shieldRearmEnergy: 25,
    shieldRadius: 104,
    shieldArcRadians: Math.PI / 2,
    shieldMaxAngularSpeedPerSecond: 1.7,
    shieldAngularAccelerationPerSecondSquared: 3.4,
    shieldAngularBrakingPerSecondSquared: 5.1,
    missileInterceptScoreReward: 5,
    arenaRadius: 2200,
    cameraViewWidth: 1600,
    background: { parallaxStrength: 1, driftSpeed: 1, nebulaAlpha: 0.72, nebulaPreset: "blue" },
    helm: {
      scheme: "tank",
      headingLeadRadians: 0.5,
      stopDampening: 1,
      rotateInPlaceThrottle: 0.02
    },
    enemySkill: {
      offset: 0,
      profiles: {
        rookie: enemySkillProfile(),
        veteran: enemySkillProfile(),
        ace: enemySkillProfile()
      }
    },
    autopilot: {
      level: "veteran",
      profiles: {
        kinetic: autopilotLevels(),
        laser: autopilotLevels(),
        missile: autopilotLevels()
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
    // The wave lasts as long as its last arrival, not as the sum of both waits:
    // the first group ends at tick 40, the second starts at 30 and ends at 40.
    expect(summary.spawnSeconds).toBeCloseTo(40 * 0.05);
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
