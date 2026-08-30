import { describe, expect, it } from "vitest";

import {
  AUTOPILOT_LEVELS,
  BACKGROUND_DRIFT_SPEED_MAX,
  BACKGROUND_PARALLAX_STRENGTH_MAX,
  BALANCE_FILE_VERSION,
  BUILTIN_ENEMY_KINDS,
  ARENA_RADIUS_MAX,
  ARENA_RADIUS_MIN,
  CAMERA_VIEW_WIDTH_MAX,
  CAMERA_VIEW_WIDTH_MIN,
  autopilotProfileSchema,
  balancePresetsFileSchema,
  balanceTuningSchema,
  type AutopilotLevel,
  type AutopilotProfile,
  type AutopilotTuning,
  type BalanceTuning,
  type EnemyArchetype,
  type EnemySkillProfile
} from "./index.js";

function autopilotProfile(overrides: Partial<AutopilotProfile> = {}): AutopilotProfile {
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
    shieldMinEnergy: 0.15,
    ...overrides
  };
}

function autopilotTuning(level: AutopilotLevel = "veteran"): AutopilotTuning {
  return {
    level,
    profiles: {
      rookie: autopilotProfile(),
      veteran: autopilotProfile(),
      ace: autopilotProfile()
    }
  };
}

function enemySkillProfile(overrides: Partial<EnemySkillProfile> = {}): EnemySkillProfile {
  return {
    reactionTicks: 4,
    aimJitterRadians: 0.04,
    leadFactor: 0.6,
    orbitShare: 0.5,
    rangeBandUnits: 200,
    separationWeight: 0.4,
    flankSpread: 0.5,
    evadeHorizonTicks: 0,
    retreatHpFraction: 0.25,
    retreatStandoffFactor: 1.4,
    ...overrides
  };
}

function archetype(overrides: Partial<EnemyArchetype> = {}): EnemyArchetype {
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
    label: "Test archetype",
    spawnPolicy: "standard",
    spawnCost: 2,
    unlockWave: 1,
    scoreReward: 25,
    creditReward: 2,
    ...overrides
  };
}

function tuning(overrides: Partial<BalanceTuning> = {}): BalanceTuning {
  return {
    enemyArchetypes: Object.fromEntries(BUILTIN_ENEMY_KINDS.map((kind) => [kind, archetype()])),
    waveCampaign: {
      waves: [
        {
          entries: [
            {
              kind: "gunship",
              count: 2,
              spawnIntervalTicks: 12,
              sectors: ["N"],
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
        budgetCap: 120,
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
    missileInterceptScoreReward: 5,
    spaceshipVisual: null,
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
    shieldCapacity: 100,
    shieldDrainPerSecond: 20,
    shieldRechargePerSecond: 10,
    shieldEngageTicks: 20,
    shieldMinimumUpTicks: 40,
    shieldCooldownTicks: 20,
    shieldRearmEnergyFraction: 0.25,
    shieldRadius: 104,
    shieldArcRadians: Math.PI / 2,
    shieldMaxAngularSpeedPerSecond: 1.7,
    shieldAngularAccelerationPerSecondSquared: 3.4,
    shieldAngularBrakingPerSecondSquared: 5.1,
    arenaRadius: 2200,
    cameraViewWidth: 1600,
    background: {
      parallaxStrength: 1,
      driftSpeed: 1,
      nebulaAlpha: 0.72,
      nebulaPreset: "blue"
    },
    helm: {
      scheme: "tank",
      headingLeadRadians: 0.5,
      stopDampening: 1,
      rotateInPlaceThrottle: 0.02
    },
    autopilot: {
      level: "veteran",
      profiles: {
        rookie: autopilotProfile(),
        veteran: autopilotProfile(),
        ace: autopilotProfile()
      }
    },
    enemySkill: {
      offset: 0,
      profiles: {
        rookie: enemySkillProfile(),
        veteran: enemySkillProfile(),
        ace: enemySkillProfile()
      }
    },
    ...overrides
  };
}

function presetsFile(value: BalanceTuning = tuning()) {
  return {
    version: BALANCE_FILE_VERSION,
    activePresetId: "default",
    presets: [{ id: "default", name: "Default", tuning: value }]
  };
}

describe("balance tuning schema", () => {
  it("accepts a complete tuning document", () => {
    expect(balanceTuningSchema.safeParse(tuning()).success).toBe(true);
  });

  it("keeps the camera frame between the readable and the whole-world bounds", () => {
    expect(balanceTuningSchema.safeParse(tuning({ cameraViewWidth: 2400 })).success).toBe(true);
    expect(
      balanceTuningSchema.safeParse({ ...tuning(), cameraViewWidth: CAMERA_VIEW_WIDTH_MIN - 1 })
        .success
    ).toBe(false);
    expect(
      balanceTuningSchema.safeParse({ ...tuning(), cameraViewWidth: CAMERA_VIEW_WIDTH_MAX + 1 })
        .success
    ).toBe(false);
  });

  it("keeps the arena radius inside its playable bounds", () => {
    expect(balanceTuningSchema.safeParse(tuning({ arenaRadius: 4400 })).success).toBe(true);
    expect(
      balanceTuningSchema.safeParse({ ...tuning(), arenaRadius: ARENA_RADIUS_MIN - 1 }).success
    ).toBe(false);
    expect(
      balanceTuningSchema.safeParse({ ...tuning(), arenaRadius: ARENA_RADIUS_MAX + 1 }).success
    ).toBe(false);
  });

  it("keeps the background parallax inside its demo-tuned bounds", () => {
    const background = (overrides: Partial<BalanceTuning["background"]>) =>
      balanceTuningSchema.safeParse({
        ...tuning(),
        background: { ...tuning().background, ...overrides }
      }).success;

    expect(background({})).toBe(true);
    expect(background({ parallaxStrength: BACKGROUND_PARALLAX_STRENGTH_MAX })).toBe(true);
    expect(background({ parallaxStrength: BACKGROUND_PARALLAX_STRENGTH_MAX + 0.1 })).toBe(false);
    expect(background({ parallaxStrength: -0.1 })).toBe(false);
    expect(background({ driftSpeed: BACKGROUND_DRIFT_SPEED_MAX })).toBe(true);
    expect(background({ driftSpeed: BACKGROUND_DRIFT_SPEED_MAX + 0.1 })).toBe(false);
    expect(background({ nebulaAlpha: 0 })).toBe(true);
    expect(background({ nebulaAlpha: 1.1 })).toBe(false);
    expect(background({ nebulaPreset: "gold" })).toBe(true);
    expect(
      balanceTuningSchema.safeParse({
        ...tuning(),
        background: { ...tuning().background, nebulaPreset: "magenta" }
      }).success
    ).toBe(false);
  });

  it("rejects a non-positive archetype hp", () => {
    const broken = tuning({
      enemyArchetypes: { ...tuning().enemyArchetypes, gunship: archetype({ hp: 0 }) }
    });
    expect(balanceTuningSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an unlock wave below one", () => {
    const broken = tuning({
      enemyArchetypes: { ...tuning().enemyArchetypes, sniper: archetype({ unlockWave: 0 }) }
    });
    expect(balanceTuningSchema.safeParse(broken).success).toBe(false);
  });

  it("accepts a catalogue with an operator-made archetype", () => {
    const extended = tuning();
    expect(
      balanceTuningSchema.safeParse({
        ...extended,
        enemyArchetypes: { ...extended.enemyArchetypes, eliteSniper: archetype() }
      }).success
    ).toBe(true);
  });

  it("rejects an empty catalogue", () => {
    expect(balanceTuningSchema.safeParse({ ...tuning(), enemyArchetypes: {} }).success).toBe(false);
  });

  it("rejects an archetype id that is not an identifier", () => {
    const extended = tuning();
    for (const badId of ["Elite Sniper", "9lives", "-dash", "asteroid"]) {
      expect(
        balanceTuningSchema.safeParse({
          ...extended,
          enemyArchetypes: { ...extended.enemyArchetypes, [badId]: archetype() }
        }).success
      ).toBe(false);
    }
  });

  it("rejects a visual the display cannot draw", () => {
    const extended = tuning();
    expect(
      balanceTuningSchema.safeParse({
        ...extended,
        enemyArchetypes: {
          ...extended.enemyArchetypes,
          gunship: { ...archetype(), visual: { ...archetype().visual, shape: "blob" } }
        }
      }).success
    ).toBe(false);
    expect(
      balanceTuningSchema.safeParse({
        ...extended,
        enemyArchetypes: {
          ...extended.enemyArchetypes,
          gunship: { ...archetype(), visual: { ...archetype().visual, color: "red" } }
        }
      }).success
    ).toBe(false);
  });

  it("accepts any catalogue id as a wave entry kind and rejects malformed ones", () => {
    const build = (kind: string) => ({
      ...tuning(),
      waveCampaign: {
        ...tuning().waveCampaign,
        waves: [
          {
            entries: [
              {
                kind,
                count: 1,
                spawnIntervalTicks: 12,
                sectors: [],
                hpMultiplier: null,
                tempoMultiplier: null
              }
            ],
            hpMultiplier: null,
            tempoMultiplier: null
          }
        ]
      }
    });
    // Cross-checking the id against the catalogue is the simulation validator's job.
    expect(balanceTuningSchema.safeParse(build("eliteSniper")).success).toBe(true);
    expect(balanceTuningSchema.safeParse(build("Elite Sniper")).success).toBe(false);
  });

  it("rejects an unknown spawn sector", () => {
    const broken = {
      ...tuning(),
      waveCampaign: {
        ...tuning().waveCampaign,
        waves: [
          {
            entries: [
              {
                kind: "gunship",
                count: 1,
                spawnIntervalTicks: 12,
                sectors: ["UP"],
                hpMultiplier: null,
                tempoMultiplier: null
              }
            ],
            hpMultiplier: null,
            tempoMultiplier: null
          }
        ]
      }
    };
    expect(balanceTuningSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an empty wave and a wave without entries", () => {
    const broken = {
      ...tuning(),
      waveCampaign: {
        ...tuning().waveCampaign,
        waves: [{ entries: [], hpMultiplier: null, tempoMultiplier: null }]
      }
    };
    expect(balanceTuningSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects entity caps because they belong to the protocol, not the preset", () => {
    expect(
      balanceTuningSchema.safeParse({
        ...tuning(),
        caps: { enemyShips: 400 }
      }).success
    ).toBe(false);
  });

  it("rejects an inverted ambient asteroid interval", () => {
    expect(
      balanceTuningSchema.safeParse(
        tuning({ ambientAsteroidIntervalMinTicks: 101, ambientAsteroidIntervalMaxTicks: 100 })
      ).success
    ).toBe(false);
  });
});

describe("balance presets file schema", () => {
  it("accepts a file whose active preset exists", () => {
    expect(balancePresetsFileSchema.safeParse(presetsFile()).success).toBe(true);
  });

  it("rejects an active preset id that matches no preset", () => {
    expect(
      balancePresetsFileSchema.safeParse({ ...presetsFile(), activePresetId: "missing" }).success
    ).toBe(false);
  });

  it("rejects duplicate preset ids", () => {
    const file = presetsFile();
    expect(
      balancePresetsFileSchema.safeParse({
        ...file,
        presets: [...file.presets, ...file.presets]
      }).success
    ).toBe(false);
  });

  it("rejects an unsupported file version", () => {
    expect(
      balancePresetsFileSchema.safeParse({ ...presetsFile(), version: BALANCE_FILE_VERSION + 1 })
        .success
    ).toBe(false);
    expect(
      balancePresetsFileSchema.safeParse({ ...presetsFile(), version: BALANCE_FILE_VERSION - 1 })
        .success
    ).toBe(false);
  });

  it("rejects a preset id that is not kebab-case", () => {
    const file = presetsFile();
    expect(
      balancePresetsFileSchema.safeParse({
        activePresetId: "Not Kebab",
        version: BALANCE_FILE_VERSION,
        presets: [{ ...file.presets[0], id: "Not Kebab" }]
      }).success
    ).toBe(false);
  });
});

describe("autopilot tuning schema", () => {
  it("accepts the three built-in levels", () => {
    for (const level of AUTOPILOT_LEVELS) {
      expect(
        balanceTuningSchema.safeParse(tuning({ autopilot: autopilotTuning(level) })).success
      ).toBe(true);
    }
  });

  it("rejects a level outside the catalogue", () => {
    const broken = { ...tuning().autopilot, level: "legend" };
    expect(balanceTuningSchema.safeParse({ ...tuning(), autopilot: broken }).success).toBe(false);
  });

  it("requires a profile for every level", () => {
    const { rookie, veteran } = tuning().autopilot.profiles;
    expect(
      balanceTuningSchema.safeParse({
        ...tuning(),
        autopilot: { level: "veteran", profiles: { rookie, veteran } }
      }).success
    ).toBe(false);
  });

  it("rejects an unknown profile key", () => {
    const profile = { ...autopilotProfile(), recklessness: 1 };
    expect(
      balanceTuningSchema.safeParse({
        ...tuning(),
        autopilot: {
          ...tuning().autopilot,
          profiles: { ...tuning().autopilot.profiles, ace: profile }
        }
      }).success
    ).toBe(false);
  });

  it("keeps the lead factor a fraction", () => {
    for (const leadFactor of [0, 0.5, 1]) {
      expect(autopilotProfileSchema.safeParse(autopilotProfile({ leadFactor })).success).toBe(true);
    }
    for (const leadFactor of [-0.01, 1.01]) {
      expect(autopilotProfileSchema.safeParse(autopilotProfile({ leadFactor })).success).toBe(
        false
      );
    }
  });

  it("keeps firing cones inside half a turn", () => {
    expect(
      autopilotProfileSchema.safeParse(autopilotProfile({ mgConeRadians: Math.PI })).success
    ).toBe(true);
    expect(
      autopilotProfileSchema.safeParse(autopilotProfile({ mgConeRadians: Math.PI + 0.01 })).success
    ).toBe(false);
    expect(
      autopilotProfileSchema.safeParse(autopilotProfile({ cannonConeRadians: 0 })).success
    ).toBe(false);
  });

  it("keeps tick counts whole", () => {
    for (const key of [
      "reactionTicks",
      "retargetIntervalTicks",
      "shieldLeadTicks",
      "evadeHorizonTicks"
    ] as const) {
      expect(autopilotProfileSchema.safeParse(autopilotProfile({ [key]: 3.5 })).success).toBe(
        false
      );
    }
    expect(
      autopilotProfileSchema.safeParse(autopilotProfile({ retargetIntervalTicks: 0 })).success
    ).toBe(false);
  });

  it("keeps the heat ceiling and the energy floor fractions", () => {
    expect(autopilotProfileSchema.safeParse(autopilotProfile({ mgHeatCeiling: 1 })).success).toBe(
      true
    );
    expect(
      autopilotProfileSchema.safeParse(autopilotProfile({ mgHeatCeiling: 1.01 })).success
    ).toBe(false);
    expect(
      autopilotProfileSchema.safeParse(autopilotProfile({ shieldMinEnergy: 0.95 })).success
    ).toBe(false);
  });

  it("keeps the stand-off distance inside the arena", () => {
    expect(
      autopilotProfileSchema.safeParse(autopilotProfile({ standoffDistance: 199 })).success
    ).toBe(false);
    expect(
      autopilotProfileSchema.safeParse(autopilotProfile({ standoffDistance: 2001 })).success
    ).toBe(false);
  });
});
