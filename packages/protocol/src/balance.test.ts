import { describe, expect, it } from "vitest";

import {
  BUILTIN_ENEMY_KINDS,
  CAMERA_VIEW_WIDTH_MAX,
  CAMERA_VIEW_WIDTH_MIN,
  balancePresetsFileSchema,
  balanceTuningSchema,
  type BalanceTuning,
  type EnemyArchetype
} from "./index.js";

function archetype(overrides: Partial<EnemyArchetype> = {}): EnemyArchetype {
  return {
    hp: 50,
    radius: 28,
    speedPerSecond: 150,
    preferredDistance: 650,
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
    asteroidVisual: null,
    missileInterceptScoreReward: 5,
    cameraViewWidth: 1600,
    ...overrides
  };
}

function presetsFile(value: BalanceTuning = tuning()) {
  return {
    version: 8,
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
    expect(balancePresetsFileSchema.safeParse({ ...presetsFile(), version: 9 }).success).toBe(
      false
    );
    expect(balancePresetsFileSchema.safeParse({ ...presetsFile(), version: 7 }).success).toBe(
      false
    );
  });

  it("rejects a preset id that is not kebab-case", () => {
    const file = presetsFile();
    expect(
      balancePresetsFileSchema.safeParse({
        activePresetId: "Not Kebab",
        version: 8,
        presets: [{ ...file.presets[0], id: "Not Kebab" }]
      }).success
    ).toBe(false);
  });
});
