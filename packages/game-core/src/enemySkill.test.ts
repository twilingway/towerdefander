import { describe, expect, it } from "vitest";

import { defaultSpaceshipSimulationConfig } from "./defaultSimulationConfig.ts";
import { aimPoint, resolveEnemySkill } from "./enemySkill.ts";
import { getEnemyArchetype } from "./combatValidation.ts";
import {
  advanceSpaceshipSimulation,
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState
} from "./spaceshipSimulation.ts";
import { type CombatEnemyState, type EnemySkillTuning } from "./combatTypes.ts";

const tuning: EnemySkillTuning = defaultSpaceshipSimulationConfig.enemySkill;

describe("resolveEnemySkill", () => {
  it("plays the archetype's own level when the difficulty is centred", () => {
    expect(resolveEnemySkill(tuning, "veteran")).toBe(tuning.profiles.veteran);
    expect(resolveEnemySkill({ ...tuning, offset: 0 }, "rookie")).toBe(tuning.profiles.rookie);
  });

  it("shifts every archetype by the same whole step", () => {
    expect(resolveEnemySkill({ ...tuning, offset: 1 }, "rookie")).toBe(tuning.profiles.veteran);
    expect(resolveEnemySkill({ ...tuning, offset: -1 }, "ace")).toBe(tuning.profiles.veteran);
  });

  it("saturates at both ends instead of falling off the list", () => {
    // The whole point of a shift over a replacement: past the end it clamps,
    // and an archetype already at the ceiling simply stays there.
    expect(resolveEnemySkill({ ...tuning, offset: 2 }, "veteran")).toBe(tuning.profiles.ace);
    expect(resolveEnemySkill({ ...tuning, offset: 2 }, "ace")).toBe(tuning.profiles.ace);
    expect(resolveEnemySkill({ ...tuning, offset: -2 }, "veteran")).toBe(tuning.profiles.rookie);
    expect(resolveEnemySkill({ ...tuning, offset: -2 }, "rookie")).toBe(tuning.profiles.rookie);
  });

  it("keeps the catalogue spread at every position of the control", () => {
    for (const offset of [-2, -1, 0, 1, 2]) {
      const shifted: EnemySkillTuning = { ...tuning, offset };
      const interceptor = resolveEnemySkill(shifted, "rookie");
      const boss = resolveEnemySkill(shifted, "ace");
      expect(boss.leadFactor).toBeGreaterThanOrEqual(interceptor.leadFactor);
    }
  });
});

/** Every archetype resolves to `ace`, which is where the new behaviour lives. */
function aceConfig(): SpaceshipSimulationConfig {
  return createSpaceshipSimulationConfig({
    enemySpawnIntervalTicks: 1_000_000,
    enemySkill: { ...defaultSpaceshipSimulationConfig.enemySkill, offset: 2 }
  });
}

function clusteredGunship(
  config: SpaceshipSimulationConfig,
  spawnSequence: number,
  x: number,
  y: number
): CombatEnemyState {
  return {
    id: `gunship-${String(spawnSequence)}`,
    spawnSequence,
    kind: "gunship",
    previousX: x,
    previousY: y,
    x,
    y,
    velocity: { x: 0, y: 0 },
    radius: getEnemyArchetype(config, "gunship").radius,
    spawnedTick: 0,
    heading: 0,
    angularVelocity: 0,
    orbitSign: 1,
    perception: { tick: -1, x: 0, y: 0, velocityX: 0, velocityY: 0 },
    aimRngState: 1,
    hp: 1_000_000,
    maxHp: 1_000_000,
    // Silent, so the wing is measured on where it goes and nothing else.
    weaponCooldownTicks: [1_000_000]
  };
}

function closestPair(enemies: readonly CombatEnemyState[]): number {
  let closest = Number.POSITIVE_INFINITY;
  for (const [index, left] of enemies.entries()) {
    for (const right of enemies.slice(index + 1)) {
      closest = Math.min(closest, Math.hypot(left.x - right.x, left.y - right.y));
    }
  }
  return closest;
}

describe("a wing that spreads instead of stacking", () => {
  const config = aceConfig();
  const centerX = config.worldWidth / 2;
  const centerY = config.worldHeight / 2;

  function stackedWing(): SpaceshipSimulationState {
    // All six on top of each other, which is exactly what one shared solution
    // used to produce: six hulls in one silhouette, firing like one enemy.
    return {
      ...createSpaceshipSimulationState(config, 61),
      pendingSpawns: [],
      spaceship: {
        x: centerX,
        y: centerY,
        previousX: centerX,
        previousY: centerY,
        velocity: { x: 0, y: 0 }
      },
      enemies: Array.from({ length: 6 }, (_unused, index) =>
        clusteredGunship(config, index + 1, centerX + 700 + index, centerY)
      )
    };
  }

  it("pushes the wing apart until the hulls stop overlapping", () => {
    let state = stackedWing();
    const before = closestPair(state.enemies);
    for (let step = 0; step < 240; step += 1) state = advanceSpaceshipSimulation(state, config);
    const hulls = 2 * getEnemyArchetype(config, "gunship").radius;
    expect(before).toBeLessThan(hulls);
    expect(closestPair(state.enemies)).toBeGreaterThan(hulls);
  });

  function tightestBearingGap(state: SpaceshipSimulationState): number {
    const bearings = state.enemies
      .map((enemy) => Math.atan2(enemy.y - centerY, enemy.x - centerX))
      .sort((left, right) => left - right);
    let tightest = Number.POSITIVE_INFINITY;
    for (const [index, bearing] of bearings.entries()) {
      const next = bearings[(index + 1) % bearings.length] ?? bearing;
      const gap = Math.abs(Math.atan2(Math.sin(next - bearing), Math.cos(next - bearing)));
      tightest = Math.min(tightest, gap);
    }
    return tightest;
  }

  it("puts the wing on different bearings around the ship", () => {
    // Measured against the same wing with the spread turned off, rather than
    // against a number: what matters is that the knob is what does the work.
    const massing = createSpaceshipSimulationConfig({
      enemySpawnIntervalTicks: 1_000_000,
      enemySkill: { ...defaultSpaceshipSimulationConfig.enemySkill, offset: -2 }
    });
    expect(massing.enemySkill.profiles.rookie.flankSpread).toBe(0);
    let spread = stackedWing();
    let massed = stackedWing();
    for (let step = 0; step < 240; step += 1) {
      spread = advanceSpaceshipSimulation(spread, config);
      massed = advanceSpaceshipSimulation(massed, massing);
    }
    expect(tightestBearingGap(spread)).toBeGreaterThan(tightestBearingGap(massed));
    expect(tightestBearingGap(spread)).toBeGreaterThan(Math.PI / 12);
  });
});

describe("aim point", () => {
  const enemy = clusteredGunship(defaultSpaceshipSimulationConfig, 1, 0, 0);
  const perception = { tick: 10, x: 600, y: 0, velocityX: 0, velocityY: 300 };

  it("fires where the ship is when the profile does not lead", () => {
    const rookie = defaultSpaceshipSimulationConfig.enemySkill.profiles.rookie;
    expect(rookie.leadFactor).toBe(0);
    expect(aimPoint(enemy, perception, rookie, 600, 10, 0.05)).toEqual({ x: 600, y: 0 });
  });

  it("leads a crossing ship by the flight time of the shot", () => {
    const ace = defaultSpaceshipSimulationConfig.enemySkill.profiles.ace;
    expect(ace.leadFactor).toBe(1);
    // 600 units at 600 units a second is one second of flight, and the ship
    // covers 300 units in it — the offset a steady sideways course used to win by.
    expect(aimPoint(enemy, perception, ace, 600, 10, 0.05)).toEqual({ x: 600, y: 300 });
  });
});

describe("seeded aim spread", () => {
  // The catalogue plays at rookie, the only built-in level with a spread worth
  // measuring: an ace fires down the exact bearing and its stream never moves.
  const config = createSpaceshipSimulationConfig({ enemySpawnIntervalTicks: 1_000_000 });

  function shotHeadings(seed: number): readonly number[] {
    const centerX = config.worldWidth / 2;
    const centerY = config.worldHeight / 2;
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, seed),
      pendingSpawns: [],
      spaceship: {
        x: centerX,
        y: centerY,
        previousX: centerX,
        previousY: centerY,
        velocity: { x: 0, y: 0 }
      },
      enemies: [
        {
          ...clusteredGunship(config, 3, centerX + 600, centerY),
          aimRngState: seed,
          weaponCooldownTicks: [1]
        }
      ]
    };
    // Collected as the shots appear: a bullet that reaches the ship is gone
    // from the state by the time the run ends.
    const headings = new Map<string, number>();
    for (let step = 0; step < 120; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
      for (const projectile of state.hostileProjectiles) {
        if (headings.has(projectile.id)) continue;
        headings.set(projectile.id, Math.atan2(projectile.velocity.y, projectile.velocity.x));
      }
    }
    return [...headings.values()];
  }

  it("has a spread to be deterministic about", () => {
    expect(config.enemySkill.profiles.rookie.aimJitterRadians).toBeGreaterThan(0);
  });

  it("replays the same spread for the same seed", () => {
    expect(shotHeadings(4242)).toEqual(shotHeadings(4242));
  });

  it("draws a different spread for a different seed", () => {
    const left = shotHeadings(4242);
    expect(left.length).toBeGreaterThan(0);
    expect(shotHeadings(9001)).not.toEqual(left);
  });
});
