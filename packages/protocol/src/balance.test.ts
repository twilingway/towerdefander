import { describe, expect, it } from "vitest";

import {
  ENEMY_KINDS,
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
    weapon: {
      kind: "bullet",
      cooldownTicks: 30,
      damage: 10,
      shieldHitCost: 4,
      projectileRadius: 7,
      projectileSpeedPerSecond: 440,
      projectileLifetimeTicks: 180,
      turnRatePerSecond: Math.PI / 2,
      burstCount: 1,
      burstSpreadRadians: 0
    },
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
    enemyArchetypes: Object.fromEntries(
      ENEMY_KINDS.map((kind) => [kind, archetype()])
    ) as BalanceTuning["enemyArchetypes"],
    waveCampaign: {
      waves: [
        {
          entries: [{ kind: "gunship", count: 2, spawnIntervalTicks: 12, sector: "N" }],
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
    missileInterceptScoreReward: 5,
    ...overrides
  };
}

function presetsFile(value: BalanceTuning = tuning()) {
  return {
    version: 1,
    activePresetId: "default",
    presets: [{ id: "default", name: "Default", tuning: value }]
  };
}

describe("balance tuning schema", () => {
  it("accepts a complete tuning document", () => {
    expect(balanceTuningSchema.safeParse(tuning()).success).toBe(true);
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

  it("rejects a partial archetype table", () => {
    const partial = Object.fromEntries(
      ENEMY_KINDS.filter((kind) => kind !== "boss").map((kind) => [kind, archetype()])
    );
    expect(
      balanceTuningSchema.safeParse({
        ...tuning(),
        enemyArchetypes: partial
      }).success
    ).toBe(false);
  });

  it("rejects an unknown spawn kind in a wave entry", () => {
    const broken = {
      ...tuning(),
      waveCampaign: {
        ...tuning().waveCampaign,
        waves: [
          {
            entries: [{ kind: "dreadnought", count: 1, spawnIntervalTicks: 12, sector: null }],
            hpMultiplier: null,
            tempoMultiplier: null
          }
        ]
      }
    };
    expect(balanceTuningSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an unknown spawn sector", () => {
    const broken = {
      ...tuning(),
      waveCampaign: {
        ...tuning().waveCampaign,
        waves: [
          {
            entries: [{ kind: "gunship", count: 1, spawnIntervalTicks: 12, sector: "UP" }],
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
    expect(balancePresetsFileSchema.safeParse({ ...presetsFile(), version: 2 }).success).toBe(
      false
    );
  });

  it("rejects a preset id that is not kebab-case", () => {
    const file = presetsFile();
    expect(
      balancePresetsFileSchema.safeParse({
        activePresetId: "Not Kebab",
        version: 1,
        presets: [{ ...file.presets[0], id: "Not Kebab" }]
      }).success
    ).toBe(false);
  });
});
