import { describe, expect, it } from "vitest";

import {
  advanceSpaceshipSimulation,
  applyGunnerInput,
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState,
  getEnemyArchetype,
  type CombatEnemyState,
  type ProjectileState,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState
} from "./index.ts";

/** Nothing spawns on its own, so every shot in a test has exactly one cause. */
function quietConfig(overrides: Partial<SpaceshipSimulationConfig> = {}) {
  return createSpaceshipSimulationConfig({
    enemySpawnIntervalTicks: 100_000,
    ambientAsteroidIntervalMinTicks: 100_000,
    ambientAsteroidIntervalMaxTicks: 100_000,
    ...overrides
  });
}

/** A target that will not shoot back, will not move, and will not die. */
function sittingDuck(
  state: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig,
  id: string,
  offsetX: number,
  offsetY = 0
): CombatEnemyState {
  const archetype = getEnemyArchetype(config, "gunship");
  const x = state.spaceship.x + offsetX;
  const y = state.spaceship.y + offsetY;
  return {
    id,
    spawnSequence: Number(id.replace(/\D/g, "")) || 1,
    kind: "gunship",
    previousX: x,
    previousY: y,
    x,
    y,
    velocity: { x: 0, y: 0 },
    heading: Math.PI,
    angularVelocity: 0,
    orbitSign: 1,
    perception: { tick: -1, x: 0, y: 0, velocityX: 0, velocityY: 0 },
    aimRngState: 3,
    radius: archetype.radius,
    spawnedTick: 0,
    hp: 100_000,
    maxHp: 100_000,
    // Frozen: an enemy that manoeuvres would change the geometry under the test.
    weaponCooldownTicks: archetype.weapons.map(() => 100_000),
    speedPerSecondOverride: 0
  } as CombatEnemyState;
}

function fireTurret(
  state: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig,
  ticks: number,
  aim = { x: 1, y: 0 }
): SpaceshipSimulationState {
  let next = state;
  for (let tick = 0; tick < ticks; tick += 1) {
    next = applyGunnerInput(next, { vector: aim, firing: true, receivedTick: next.clock.tick });
    next = advanceSpaceshipSimulation(next, config);
  }
  return next;
}

describe("laser barrel", () => {
  it("burns the nearer of two targets on the beam and creates no projectile", () => {
    const config = quietConfig({ cannonWeaponKind: "laser", cannonLaserRange: 900 });
    const fresh = createSpaceshipSimulationState(config, 11);
    const state = fireTurret(
      {
        ...fresh,
        pendingSpawns: [],
        enemies: [
          sittingDuck(fresh, config, "near-1", 300),
          sittingDuck(fresh, config, "far-2", 700)
        ]
      },
      config,
      12
    );

    const near = state.enemies.find(({ id }) => id === "near-1");
    const far = state.enemies.find(({ id }) => id === "far-2");
    expect(near?.hp).toBeLessThan(100_000);
    expect(far?.hp).toBe(100_000);
    expect(state.projectiles).toHaveLength(0);
    expect(state.runStats.hitsByCannon).toBeGreaterThan(0);
  });

  it("spends the shot on nothing when the target is past its reach", () => {
    const config = quietConfig({ cannonWeaponKind: "laser", cannonLaserRange: 300 });
    const fresh = createSpaceshipSimulationState(config, 12);
    const state = fireTurret(
      { ...fresh, pendingSpawns: [], enemies: [sittingDuck(fresh, config, "far-1", 700)] },
      config,
      12
    );

    expect(state.enemies[0]?.hp).toBe(100_000);
    expect(state.runStats.shotsByCannon).toBeGreaterThan(0);
    expect(state.runStats.hitsByCannon).toBe(0);
    // The barrel still ran hot: a miss costs what a hit costs.
    expect(state.cannonHeat).toBeGreaterThan(0);
  });

  it("fires with the projectile cap full, because it takes no room in it", () => {
    const config = quietConfig({ cannonWeaponKind: "laser", cannonLaserRange: 900 });
    const fresh = createSpaceshipSimulationState(config, 13);
    const filler: ProjectileState[] = Array.from(
      { length: config.caps.friendlyProjectiles },
      (_, index) => ({
        id: `filler-${String(index)}`,
        projectileId: `filler-${String(index)}`,
        spawnSequence: 500 + index,
        previousX: fresh.spaceship.x,
        previousY: fresh.spaceship.y - 1_000,
        x: fresh.spaceship.x,
        y: fresh.spaceship.y - 1_000,
        velocity: { x: 0, y: -10 },
        radius: config.projectileRadius,
        damage: 1,
        spawnedTick: 0,
        source: "cannon",
        homing: null
      })
    );

    const state = fireTurret(
      {
        ...fresh,
        pendingSpawns: [],
        enemies: [sittingDuck(fresh, config, "near-1", 300)],
        projectiles: filler
      },
      config,
      12
    );

    expect(state.enemies[0]?.hp).toBeLessThan(100_000);
  });
});

describe("missile barrel", () => {
  function missileConfig(kind: "missile" | "kinetic") {
    return quietConfig({
      cannonWeaponKind: kind,
      friendlyMissileAcquireConeRadians: Math.PI / 4,
      friendlyMissileTurnRatePerSecond: Math.PI
    });
  }

  /** The bore points along +x; the target sits well off it. */
  function offBoreRun(kind: "missile" | "kinetic") {
    const config = missileConfig(kind);
    const fresh = createSpaceshipSimulationState(config, 14);
    const state = fireTurret(
      { ...fresh, pendingSpawns: [], enemies: [sittingDuck(fresh, config, "victim-1", 600, 160)] },
      config,
      30
    );
    return state.enemies[0]?.hp ?? 0;
  }

  it("reaches a target the bore never pointed at, where a bullet flies past", () => {
    expect(offBoreRun("missile")).toBeLessThan(100_000);
    expect(offBoreRun("kinetic")).toBe(100_000);
  });

  it("keeps its course and takes no new target when the first one dies", () => {
    const config = missileConfig("missile");
    const fresh = createSpaceshipSimulationState(config, 15);
    const target = sittingDuck(fresh, config, "victim-1", 600, 160);
    let state = fireTurret({ ...fresh, pendingSpawns: [], enemies: [target] }, config, 2);

    const launched = state.projectiles.find(({ homing }) => homing !== null);
    expect(launched?.homing?.targetId).toBe("victim-1");

    // The target dies, and another one appears where the bore points.
    state = fireTurret(
      { ...state, enemies: [sittingDuck(fresh, config, "second-2", 900, -400)] },
      config,
      1
    );
    const orphaned = state.projectiles.find(({ id }) => id === launched?.id);
    const heldHeading = orphaned?.homing?.heading;
    state = fireTurret(state, config, 3);
    const later = state.projectiles.find(({ id }) => id === launched?.id);

    expect(later?.homing?.targetId).toBe("victim-1");
    expect(later?.homing?.heading).toBe(heldHeading);
  });
});
