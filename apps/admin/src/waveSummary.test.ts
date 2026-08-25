import {
  BUILTIN_ENEMY_KINDS,
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
  summariseWave
} from "./waveSummary.js";

function archetype(spawnCost: number, unlockWave = 1): EnemyArchetype {
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
        turnRatePerSecond: Math.PI / 2,
        burstCount: 1,
        burstSpreadRadians: 0
      }
    ],
    visual: { shape: "arrowhead", color: "#e65f4b", outline: "#ffd1b0", showHealthBar: false },
    label: "Test",
    spawnPolicy: "standard",
    spawnCost,
    unlockWave,
    scoreReward: 25,
    creditReward: 2
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
    missileInterceptScoreReward: 5
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
