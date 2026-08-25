import { ENEMY_KINDS, type BalanceTuning, type EnemyArchetype } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import { directorBudgetAt, spawnCostOf, summariseCampaign, summariseWave } from "./waveSummary.js";

function archetype(spawnCost: number, unlockWave = 1): EnemyArchetype {
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
    spawnCost,
    unlockWave,
    scoreReward: 25,
    creditReward: 2
  };
}

function tuning(): BalanceTuning {
  return {
    enemyArchetypes: Object.fromEntries(
      ENEMY_KINDS.map((kind) => [
        kind,
        archetype(kind === "boss" ? 20 : 2, kind === "boss" ? 10 : 1)
      ])
    ) as BalanceTuning["enemyArchetypes"],
    waveCampaign: {
      waves: [
        {
          entries: [
            { kind: "gunship", count: 3, spawnIntervalTicks: 20, sector: "N" },
            { kind: "asteroid", count: 2, spawnIntervalTicks: 10, sector: null }
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
