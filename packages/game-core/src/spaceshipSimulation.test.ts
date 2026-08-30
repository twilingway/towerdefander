import { describe, expect, it } from "vitest";

import {
  ARENA_CUSHION_BAND,
  advanceSpaceshipSimulation,
  applyGunnerInput,
  applyPilotInput,
  applyShieldInput,
  cancelGunnerControl,
  cancelPilotControl,
  cancelQueuedFire,
  cancelShieldControl,
  canonicalizeAngle,
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState,
  deactivateShield,
  getEnemyArchetype,
  moveVectorTowards,
  moveScalarTowards,
  normalizeVector,
  shortestAngleDelta,
  validateSpaceshipSimulationConfig,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState,
  type Vector2
} from "./index.ts";

function advance(
  state: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig,
  steps: number
) {
  let current = state;
  for (let step = 0; step < steps; step += 1) {
    current = advanceSpaceshipSimulation(current, config);
  }
  return current;
}

function holdPilot(
  state: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig,
  vector: Vector2,
  steps: number
) {
  let current = state;
  for (let step = 0; step < steps; step += 1) {
    current = applyPilotInput(current, {
      vector,
      mgFiring: false,
      receivedTick: current.clock.tick
    });
    current = advanceSpaceshipSimulation(current, config);
  }
  return current;
}

function holdHelm(
  state: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig,
  intent: { turn: number; thrust: number },
  steps: number
) {
  let current = state;
  for (let step = 0; step < steps; step += 1) {
    current = applyPilotInput(current, {
      vector: { x: 0, y: 0 },
      mgFiring: false,
      receivedTick: current.clock.tick,
      turn: intent.turn,
      thrust: intent.thrust
    });
    current = advanceSpaceshipSimulation(current, config);
  }
  return current;
}

describe("spaceship configuration", () => {
  it("creates the explicit smooth-flight defaults deterministically", () => {
    const config = createSpaceshipSimulationConfig();

    expect(config).toMatchObject({
      fixedStepMs: 50,
      worldWidth: 4400,
      worldHeight: 4400,
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
      turretMaxAngularSpeedPerSecond: (13 * Math.PI) / 30,
      turretAngularAccelerationPerSecondSquared: (13 * Math.PI) / 15,
      turretAngularBrakingPerSecondSquared: (13 * Math.PI) / 10,
      shieldMaxAngularSpeedPerSecond: (13 * Math.PI) / 24,
      shieldAngularAccelerationPerSecondSquared: (13 * Math.PI) / 12,
      shieldAngularBrakingPerSecondSquared: (13 * Math.PI) / 8,
      ambientAsteroidIntervalMinTicks: 40,
      ambientAsteroidIntervalMaxTicks: 100
    });
    expect(createSpaceshipSimulationState(config, 1)).toEqual(
      createSpaceshipSimulationState(config, 1)
    );
    expect(createSpaceshipSimulationState(config, 1)).toMatchObject({
      shieldEnergy: 100,
      shieldRearmRequired: false,
      queuedFire: false,
      turretTargetAngle: null,
      turretAngularVelocity: 0,
      shieldTargetAngle: null,
      shieldAngularVelocity: 0
    });
    expect(createSpaceshipSimulationState(config, 1).spaceship).toMatchObject({ x: 2200, y: 2200 });
  });

  it.each([
    ["fixedStepMs", 0],
    ["worldWidth", Number.NaN],
    ["worldHeight", 0],
    ["arenaRadius", 0],
    ["ambientAsteroidIntervalMinTicks", 0],
    ["ambientAsteroidIntervalMaxTicks", 1.5],
    ["spaceshipSpeedPerSecond", -1],
    ["spaceshipAccelerationPerSecondSquared", 0],
    ["spaceshipBrakingPerSecondSquared", Number.POSITIVE_INFINITY],
    ["spaceshipRadius", 0],
    ["inputTimeoutTicks", 1.5],
    ["projectileSpeedPerSecond", Number.POSITIVE_INFINITY],
    ["projectileLifetimeMs", 0],
    ["projectileRadius", -2],
    ["fireCooldownTicks", 0],
    ["shieldCapacity", 0],
    ["shieldDrainPerSecond", -1],
    ["shieldRechargePerSecond", Number.NaN],
    ["turretMaxAngularSpeedPerSecond", 0],
    ["turretAngularAccelerationPerSecondSquared", -1],
    ["turretAngularBrakingPerSecondSquared", Number.NaN],
    ["shieldMaxAngularSpeedPerSecond", Number.POSITIVE_INFINITY],
    ["shieldAngularAccelerationPerSecondSquared", 0],
    ["shieldAngularBrakingPerSecondSquared", -1]
  ] as const)("rejects invalid %s", (field, value) => {
    expect(() => {
      validateSpaceshipSimulationConfig({ ...createSpaceshipSimulationConfig(), [field]: value });
    }).toThrow(RangeError);
  });

  it("rejects worlds that cannot fit the spaceship", () => {
    expect(() => createSpaceshipSimulationConfig({ worldWidth: 100 })).toThrow(RangeError);
    expect(() => createSpaceshipSimulationConfig({ worldHeight: 100 })).toThrow(RangeError);
    expect(() => createSpaceshipSimulationConfig({ arenaRadius: 51 })).toThrow(RangeError);
    expect(() =>
      createSpaceshipSimulationConfig({ worldWidth: 200, worldHeight: 200, arenaRadius: 99 })
    ).toThrow(RangeError);
    expect(() =>
      createSpaceshipSimulationConfig({
        ambientAsteroidIntervalMinTicks: 101,
        ambientAsteroidIntervalMaxTicks: 100
      })
    ).toThrow(RangeError);
    const base = createSpaceshipSimulationConfig();
    for (const kind of ["gunship", "missileCarrier"]) {
      expect(() =>
        createSpaceshipSimulationConfig({
          enemyArchetypes: {
            ...base.enemyArchetypes,
            [kind]: { ...getEnemyArchetype(base, kind), radius: 2201 }
          }
        })
      ).toThrow(RangeError);
    }
    expect(() => createSpaceshipSimulationConfig({ worldPadding: 257 })).toThrow(RangeError);
    expect(() =>
      createSpaceshipSimulationConfig({ asteroidRadius: 257, worldPadding: 256 })
    ).toThrow(RangeError);
  });
});

describe("pilot movement", () => {
  it("accelerates to max speed in ten equal fixed steps", () => {
    const config = createSpaceshipSimulationConfig();
    let state = createSpaceshipSimulationState(config, 1);
    const velocities: number[] = [];

    for (let step = 0; step < 10; step += 1) {
      state = holdPilot(state, config, { x: 1, y: 0 }, 1);
      velocities.push(state.spaceship.velocity.x);
    }

    expect(velocities).toEqual([32, 64, 96, 128, 160, 192, 224, 256, 288, 320]);
    expect(state.spaceship.x).toBe(createSpaceshipSimulationState(config, 1).spaceship.x + 88);
  });

  it("brakes from max speed to rest in eight fixed steps", () => {
    const config = createSpaceshipSimulationConfig();
    let state = holdPilot(createSpaceshipSimulationState(config, 1), config, { x: 1, y: 0 }, 10);
    const releaseX = state.spaceship.x;
    const velocities: number[] = [];

    state = applyPilotInput(state, {
      vector: { x: 0, y: 0 },
      mgFiring: false,
      receivedTick: state.clock.tick
    });
    for (let step = 0; step < 8; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
      velocities.push(state.spaceship.velocity.x);
    }

    expect(velocities).toEqual([280, 240, 200, 160, 120, 80, 40, 0]);
    expect(state.spaceship.x).toBe(releaseX + 56);
  });

  it("caps diagonal target and actual velocity at max speed", () => {
    const config = createSpaceshipSimulationConfig();
    const state = holdPilot(createSpaceshipSimulationState(config, 1), config, { x: 1, y: 1 }, 10);

    expect(Math.hypot(state.spaceship.velocity.x, state.spaceship.velocity.y)).toBeCloseTo(320);
    expect(state.spaceship.velocity.x).toBeCloseTo(320 / Math.sqrt(2));
    expect(normalizeVector({ x: 0.25, y: 0.5 })).toEqual({ x: 0.25, y: 0.5 });
    const moved = moveVectorTowards({ x: 0, y: 0 }, { x: 3, y: 4 }, 2);
    expect(moved.x).toBeCloseTo(1.2);
    expect(moved.y).toBeCloseTo(1.6);
  });

  it("projects at the circular rim and clears only the outward velocity component", () => {
    const config = createSpaceshipSimulationConfig({
      worldWidth: 200,
      worldHeight: 200,
      arenaRadius: 100
    });
    const nearRight: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 1),
      spaceship: { x: 147, y: 100, velocity: { x: 100, y: 100 } }
    };
    const bounded = advanceSpaceshipSimulation(
      applyPilotInput(nearRight, { vector: { x: 1, y: 1 }, mgFiring: false, receivedTick: 0 }),
      config
    );

    expect(Math.hypot(bounded.spaceship.x - 100, bounded.spaceship.y - 100)).toBeCloseTo(
      config.arenaRadius - config.spaceshipRadius
    );
    const normalX = (bounded.spaceship.x - 100) / (config.arenaRadius - config.spaceshipRadius);
    const normalY = (bounded.spaceship.y - 100) / (config.arenaRadius - config.spaceshipRadius);
    expect(
      bounded.spaceship.velocity.x * normalX + bounded.spaceship.velocity.y * normalY
    ).toBeCloseTo(0);

    const inward: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 1),
      spaceship: {
        x: config.worldWidth - config.spaceshipRadius,
        y: 100,
        velocity: { x: -100, y: 0 }
      }
    };
    const movedInward = advanceSpaceshipSimulation(
      applyPilotInput(inward, { vector: { x: -1, y: 0 }, mgFiring: false, receivedTick: 0 }),
      config
    );
    expect(movedInward.spaceship.x).toBeLessThan(config.worldWidth - config.spaceshipRadius);
    expect(movedInward.spaceship.velocity.x).toBeLessThan(0);
  });

  it("starts ordinary braking when input becomes stale", () => {
    const config = createSpaceshipSimulationConfig();
    const moving = applyPilotInput(createSpaceshipSimulationState(config, 1), {
      vector: { x: 1, y: 0 },
      mgFiring: false,
      receivedTick: 0
    });
    const afterFourSteps = advance(moving, config, 4);
    const stale = advanceSpaceshipSimulation(afterFourSteps, config);

    expect(afterFourSteps.spaceship.velocity.x).toBe(128);
    expect(stale.spaceship.velocity.x).toBe(88);
    expect(stale.spaceship.x).toBeGreaterThan(afterFourSteps.spaceship.x);
    expect(stale.inputs.pilot?.vector).toEqual({ x: 0, y: 0 });
  });

  it("brakes instead of teleporting velocity to zero after trusted neutral input", () => {
    const config = createSpaceshipSimulationConfig();
    let state = holdPilot(createSpaceshipSimulationState(config, 1), config, { x: 1, y: 0 }, 10);
    state = applyPilotInput(state, {
      vector: { x: 0, y: 0 },
      mgFiring: false,
      receivedTick: state.clock.tick
    });
    state = advanceSpaceshipSimulation(state, config);

    expect(state.spaceship.velocity.x).toBe(280);
  });

  it("rejects non-finite vectors, invalid deltas, and future received ticks", () => {
    const state = createSpaceshipSimulationState(createSpaceshipSimulationConfig(), 1);
    expect(() =>
      applyPilotInput(state, { vector: { x: Number.NaN, y: 0 }, mgFiring: false, receivedTick: 0 })
    ).toThrow(RangeError);
    expect(() =>
      applyPilotInput(state, { vector: { x: 0, y: 0 }, mgFiring: false, receivedTick: 1 })
    ).toThrow(RangeError);
    expect(() => moveVectorTowards({ x: 0, y: 0 }, { x: 1, y: 0 }, -1)).toThrow(RangeError);
  });
});

describe("angular helpers", () => {
  it("canonicalizes every finite angle into [-PI, PI)", () => {
    expect(canonicalizeAngle(0)).toBe(0);
    expect(canonicalizeAngle(Math.PI)).toBe(-Math.PI);
    expect(canonicalizeAngle(-Math.PI)).toBe(-Math.PI);
    expect(canonicalizeAngle(3 * Math.PI)).toBe(-Math.PI);
    expect(canonicalizeAngle(2 * Math.PI)).toBe(0);
    expect(canonicalizeAngle(-2 * Math.PI)).toBe(0);
    expect(() => canonicalizeAngle(Number.NaN)).toThrow(RangeError);
  });

  it("uses the shortest signed arc and resolves an exact antipode positively", () => {
    expect(shortestAngleDelta(0, Math.PI)).toBe(Math.PI);
    expect(shortestAngleDelta(0, -Math.PI)).toBe(Math.PI);
    expect(shortestAngleDelta(0.3, 0.3 + Math.PI)).toBe(Math.PI);
    expect(shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(shortestAngleDelta(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2);
  });

  it("moves scalar velocity without overshooting its requested value", () => {
    expect(moveScalarTowards(1, 4, 2)).toBe(3);
    expect(moveScalarTowards(1, 2, 2)).toBe(2);
    expect(moveScalarTowards(1, -4, 2)).toBe(-1);
    expect(() => moveScalarTowards(0, 1, -1)).toThrow(RangeError);
    expect(() => moveScalarTowards(Number.NaN, 1, 1)).toThrow(RangeError);
  });
});

describe("gunner simulation", () => {
  it("starts turning toward an upward target without snapping and zero aim preserves it", () => {
    const config = createSpaceshipSimulationConfig();
    let state = applyGunnerInput(createSpaceshipSimulationState(config, 1), {
      vector: { x: 0, y: -1 },
      firing: false,
      receivedTick: 0
    });
    state = advanceSpaceshipSimulation(state, config);
    expect(state.turretTargetAngle).toBeCloseTo(-Math.PI / 2);
    expect(state.turretAngularVelocity).toBeCloseTo((-13 * Math.PI) / 300);
    expect(state.turretAngle).toBeCloseTo((-13 * Math.PI) / 6000);

    state = applyGunnerInput(state, {
      vector: { x: 0, y: 0 },
      firing: false,
      receivedTick: state.clock.tick
    });
    state = advanceSpaceshipSimulation(state, config);
    expect(state.turretTargetAngle).toBeCloseTo(-Math.PI / 2);
    expect(state.turretAngle).toBeLessThan((-13 * Math.PI) / 6000);
  });

  it("accelerates to the configured turret angular speed in ten steps", () => {
    const config = createSpaceshipSimulationConfig();
    let state = createSpaceshipSimulationState(config, 1);
    const velocities: number[] = [];

    for (let step = 0; step < 10; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: -1, y: 0 },
        firing: false,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
      velocities.push(state.turretAngularVelocity);
    }

    velocities.forEach((velocity, index) => {
      expect(velocity).toBeCloseTo(((index + 1) * 13 * Math.PI) / 300);
    });
    expect(velocities[9]).toBeCloseTo((13 * Math.PI) / 30);
  });

  it("traverses an exact antipode positively and reaches it without overshoot", () => {
    const config = createSpaceshipSimulationConfig();
    let state = createSpaceshipSimulationState(config, 1);
    let travelled = 0;
    let previousAngle = state.turretAngle;
    let ticks = 0;

    for (let step = 0; step < 100; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: -1, y: 0 },
        firing: false,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
      ticks += 1;
      const delta = shortestAngleDelta(previousAngle, state.turretAngle);
      expect(delta).toBeGreaterThanOrEqual(0);
      travelled += delta;
      expect(travelled).toBeLessThanOrEqual(Math.PI + 1e-12);
      previousAngle = state.turretAngle;
      if (state.turretAngle === -Math.PI && state.turretAngularVelocity === 0) {
        break;
      }
    }

    expect(state.turretTargetAngle).toBe(-Math.PI);
    expect(state.turretAngle).toBe(-Math.PI);
    expect(state.turretAngularVelocity).toBe(0);
    expect(travelled).toBeCloseTo(Math.PI);
    expect(ticks).toBe(52);
  });

  it("takes the short arc through the canonical angle boundary", () => {
    const config = createSpaceshipSimulationConfig();
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 1),
      turretAngle: Math.PI - 0.08
    };
    const target = -Math.PI + 0.08;
    let previousAngle = state.turretAngle;
    let crossedBoundary = false;

    for (let step = 0; step < 20 && state.turretAngle !== target; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: Math.cos(target), y: Math.sin(target) },
        firing: false,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
      expect(shortestAngleDelta(previousAngle, state.turretAngle)).toBeGreaterThanOrEqual(0);
      crossedBoundary ||= state.turretAngle < 0;
      previousAngle = state.turretAngle;
    }

    expect(crossedBoundary).toBe(true);
    expect(state.turretAngle).toBeCloseTo(target);
    expect(state.turretAngularVelocity).toBe(0);
  });

  it("clamps a close target instead of overshooting it", () => {
    const config = createSpaceshipSimulationConfig();
    const target = 0.02;
    let state = createSpaceshipSimulationState(config, 1);
    const angles: number[] = [];

    for (let step = 0; step < 3; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: Math.cos(target), y: Math.sin(target) },
        firing: false,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
      angles.push(state.turretAngle);
    }

    expect(angles[0]).toBeCloseTo((13 * Math.PI) / 6000);
    expect(angles.every((angle) => angle <= target)).toBe(true);
    expect(state.turretAngle).toBeCloseTo(target);
    expect(state.turretTargetAngle).toBeCloseTo(target);
    expect(state.turretAngularVelocity).toBe(0);
  });

  it("brakes before reversing toward a target on the opposite side", () => {
    const config = createSpaceshipSimulationConfig();
    let state = createSpaceshipSimulationState(config, 1);
    for (let step = 0; step < 3; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: 0, y: 1 },
        firing: false,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
    }
    const velocityBeforeReverse = state.turretAngularVelocity;

    state = applyGunnerInput(state, {
      vector: { x: 0, y: -1 },
      firing: false,
      receivedTick: state.clock.tick
    });
    state = advanceSpaceshipSimulation(state, config);

    expect(velocityBeforeReverse).toBeCloseTo((13 * Math.PI) / 100);
    expect(state.turretAngularVelocity).toBeCloseTo((13 * Math.PI) / 200);
    expect(state.turretAngularVelocity).toBeGreaterThan(0);

    for (let step = 0; step < 5 && state.turretAngularVelocity >= 0; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: 0, y: -1 },
        firing: false,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
    }
    expect(state.turretAngularVelocity).toBeLessThan(0);
  });

  it("completes a tap traverse while zero aim heartbeats keep the target fresh", () => {
    const config = createSpaceshipSimulationConfig();
    let state = applyGunnerInput(createSpaceshipSimulationState(config, 1), {
      vector: { x: 0, y: -1 },
      firing: false,
      receivedTick: 0
    });
    state = advanceSpaceshipSimulation(state, config);

    let ticks = 1;
    for (let step = 0; step < 50 && state.turretAngle !== -Math.PI / 2; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: 0, y: 0 },
        firing: false,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
      ticks += 1;
    }

    expect(state.turretTargetAngle).toBeCloseTo(-Math.PI / 2);
    expect(state.turretAngle).toBeCloseTo(-Math.PI / 2);
    expect(state.turretAngularVelocity).toBe(0);
    expect(ticks).toBe(29);
  });

  it("preserves a short true/false click until the next simulation tick", () => {
    const config = createSpaceshipSimulationConfig();
    let state = createSpaceshipSimulationState(config, 1);
    state = applyGunnerInput(state, {
      vector: { x: 1, y: 0 },
      firing: true,
      receivedTick: 0
    });
    state = applyGunnerInput(state, {
      vector: { x: 1, y: 0 },
      firing: false,
      receivedTick: 0
    });

    expect(state.queuedFire).toBe(true);
    state = advanceSpaceshipSimulation(state, config);
    expect(state.projectiles).toHaveLength(1);
    expect(state.queuedFire).toBe(false);
    expect(advance(state, config, config.fireCooldownTicks * 2).projectiles).toHaveLength(1);
  });

  it("spawns a projectile along the current turret angle instead of its target", () => {
    const config = createSpaceshipSimulationConfig();
    let state = applyGunnerInput(createSpaceshipSimulationState(config, 1), {
      vector: { x: 0, y: -1 },
      firing: true,
      receivedTick: 0
    });
    state = advanceSpaceshipSimulation(state, config);

    const projectile = state.projectiles[0];
    if (projectile === undefined || state.turretTargetAngle === null) {
      throw new Error("expected a projectile and turret target");
    }
    expect(state.turretAngle).toBeCloseTo((-13 * Math.PI) / 6000);
    expect(state.turretTargetAngle).toBeCloseTo(-Math.PI / 2);
    expect(Math.atan2(projectile.velocity.y, projectile.velocity.x)).toBeCloseTo(state.turretAngle);
    expect(Math.atan2(projectile.velocity.y, projectile.velocity.x)).not.toBeCloseTo(
      state.turretTargetAngle
    );
  });

  it("coalesces repeated clicks into one pending shot during cooldown", () => {
    const config = createSpaceshipSimulationConfig();
    let state = applyGunnerInput(createSpaceshipSimulationState(config, 1), {
      vector: { x: 1, y: 0 },
      firing: true,
      receivedTick: 0
    });
    state = advanceSpaceshipSimulation(state, config);
    state = applyGunnerInput(state, {
      vector: { x: 1, y: 0 },
      firing: false,
      receivedTick: state.clock.tick
    });

    for (let click = 0; click < 3; click += 1) {
      state = applyGunnerInput(state, {
        vector: { x: 1, y: 0 },
        firing: true,
        receivedTick: state.clock.tick
      });
      state = applyGunnerInput(state, {
        vector: { x: 1, y: 0 },
        firing: false,
        receivedTick: state.clock.tick
      });
    }

    expect(state.queuedFire).toBe(true);
    state = advance(state, config, config.fireCooldownTicks);
    expect(state.projectiles.map(({ projectileId }) => projectileId)).toEqual([
      "projectile-0",
      "projectile-1"
    ]);
    expect(state.queuedFire).toBe(false);
  });

  it("continues cooldown cadence while fire remains held", () => {
    const config = createSpaceshipSimulationConfig();
    let state = createSpaceshipSimulationState(config, 1);
    for (let step = 0; step < 11; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: 1, y: 0 },
        firing: true,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
    }

    expect(state.projectiles.map(({ spawnedTick }) => spawnedTick)).toEqual([1, 6, 11]);
  });

  it("allows the authoritative disconnect path to clear a pending shot", () => {
    const config = createSpaceshipSimulationConfig();
    let state = applyGunnerInput(createSpaceshipSimulationState(config, 1), {
      vector: { x: 1, y: 0 },
      firing: true,
      receivedTick: 0
    });
    state = applyGunnerInput(state, {
      vector: { x: 1, y: 0 },
      firing: false,
      receivedTick: 0
    });
    state = cancelQueuedFire(state);

    expect(state.queuedFire).toBe(false);
    expect(advanceSpaceshipSimulation(state, config).projectiles).toEqual([]);
  });

  it("cancels a stale angular target and brakes without clearing queued fire", () => {
    const config = createSpaceshipSimulationConfig({ fireCooldownTicks: 100 });
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 1),
      lastFiredTick: 0
    };
    state = applyGunnerInput(state, {
      vector: { x: 0, y: -1 },
      firing: true,
      receivedTick: 0
    });
    state = applyGunnerInput(state, {
      vector: { x: 0, y: 0 },
      firing: false,
      receivedTick: 0
    });
    state = advance(state, config, 4);
    const velocityBeforeStale = state.turretAngularVelocity;
    state = advanceSpaceshipSimulation(state, config);

    expect(velocityBeforeStale).toBeCloseTo((-13 * Math.PI) / 75);
    expect(state.turretTargetAngle).toBeNull();
    expect(state.turretAngularVelocity).toBeCloseTo((-13 * Math.PI) / 120);
    expect(state.queuedFire).toBe(true);
    expect(state.projectiles).toEqual([]);
  });

  it("trusted gunner disconnect clears target, hold and queue but preserves braking velocity", () => {
    const config = createSpaceshipSimulationConfig({ fireCooldownTicks: 100 });
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 1),
      lastFiredTick: 0
    };
    state = applyGunnerInput(state, {
      vector: { x: 0, y: 1 },
      firing: true,
      receivedTick: 0
    });
    state = advance(state, config, 2);
    const angleAtDisconnect = state.turretAngle;
    const velocityAtDisconnect = state.turretAngularVelocity;
    state = cancelGunnerControl(state);

    expect(state.turretTargetAngle).toBeNull();
    expect(state.turretAngle).toBe(angleAtDisconnect);
    expect(state.turretAngularVelocity).toBe(velocityAtDisconnect);
    expect(state.queuedFire).toBe(false);
    expect(state.inputs.gunner).toMatchObject({ vector: { x: 0, y: 0 }, firing: false });

    state = advanceSpaceshipSimulation(state, config);
    expect(Math.abs(state.turretAngularVelocity)).toBeLessThan(Math.abs(velocityAtDisconnect));
    state = applyGunnerInput(state, {
      vector: { x: 0, y: 0 },
      firing: false,
      receivedTick: state.clock.tick
    });
    expect(state.turretTargetAngle).toBeNull();
  });

  it("allows the authoritative disconnect path to turn off the shield without draining energy", () => {
    const config = createSpaceshipSimulationConfig();
    let state = applyShieldInput(createSpaceshipSimulationState(config, 1), {
      vector: { x: 1, y: 0 },
      active: true,
      receivedTick: 0
    });
    state = advanceSpaceshipSimulation(state, config);
    const energyAtDisconnect = state.shieldEnergy;
    state = applyShieldInput(state, {
      vector: { x: 0, y: 0 },
      active: false,
      receivedTick: state.clock.tick
    });
    state = deactivateShield(state);

    expect(state.shieldActive).toBe(false);
    expect(state.shieldEnergy).toBe(energyAtDisconnect);
  });

  it("stops held cadence when input becomes stale but preserves turret angle", () => {
    const config = createSpaceshipSimulationConfig();
    const firing = applyGunnerInput(createSpaceshipSimulationState(config, 1), {
      vector: { x: 0, y: 1 },
      firing: true,
      receivedTick: 0
    });
    const stale = advance(firing, config, 6);

    expect(stale.projectiles).toHaveLength(1);
    expect(stale.turretAngle).toBeCloseTo((117 * Math.PI) / 4000);
    expect(stale.turretTargetAngle).toBeNull();
    expect(stale.turretAngularVelocity).toBeCloseTo((13 * Math.PI) / 300);
    expect(stale.inputs.gunner?.firing).toBe(false);
  });

  it("expires projectiles by lifetime and removes them outside the circular padded envelope", () => {
    const lifetimeConfig = createSpaceshipSimulationConfig({ projectileSpeedPerSecond: 1 });
    let state = applyGunnerInput(createSpaceshipSimulationState(lifetimeConfig, 1), {
      vector: { x: 1, y: 0 },
      firing: true,
      receivedTick: 0
    });
    state = advanceSpaceshipSimulation(state, lifetimeConfig);
    state = advance(state, lifetimeConfig, 30);
    expect(state.projectiles).toEqual([]);

    const smallWorld = createSpaceshipSimulationConfig({
      worldWidth: 200,
      worldHeight: 200,
      arenaRadius: 100,
      projectileSpeedPerSecond: 4000
    });
    let escaping = applyGunnerInput(createSpaceshipSimulationState(smallWorld, 1), {
      vector: { x: 1, y: 0 },
      firing: true,
      receivedTick: 0
    });
    escaping = advanceSpaceshipSimulation(escaping, smallWorld);
    escaping = advanceSpaceshipSimulation(escaping, smallWorld);
    escaping = advanceSpaceshipSimulation(escaping, smallWorld);
    expect(escaping.projectiles).toEqual([]);
  });
});

describe("shield simulation", () => {
  it("keeps manual active state after input becomes stale and preserves angle", () => {
    const config = createSpaceshipSimulationConfig();
    const state = advance(
      applyShieldInput(createSpaceshipSimulationState(config, 1), {
        vector: { x: -1, y: 0 },
        active: true,
        receivedTick: 0
      }),
      config,
      6
    );

    expect(state.shieldAngle).toBeCloseTo((117 * Math.PI) / 3200);
    expect(state.shieldTargetAngle).toBeNull();
    expect(state.shieldAngularVelocity).toBeCloseTo((13 * Math.PI) / 240);
    // Six ticks in the shield is still coming up, so it neither blocks nor
    // spends yet; what survives the stale input is the request itself.
    expect(state.shieldPhase).toBe("raising");
    expect(state.shieldActive).toBe(false);
    expect(state.inputs.shield?.active).toBe(true);
    expect(state.shieldEnergy).toBe(100);

    // And it does come up on its own once the engage window is served.
    const raised = advance(state, config, config.shieldEngageTicks);
    expect(raised.shieldPhase).toBe("up");
    expect(raised.shieldActive).toBe(true);
  });

  it("accelerates faster than the turret and traverses while inactive and recharging", () => {
    const config = createSpaceshipSimulationConfig();
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 1),
      shieldEnergy: 50
    };
    const velocities: number[] = [];

    for (let step = 0; step < 10; step += 1) {
      state = applyShieldInput(state, {
        vector: { x: 0, y: 1 },
        active: false,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
      velocities.push(state.shieldAngularVelocity);
    }

    velocities.forEach((velocity, index) => {
      expect(velocity).toBeCloseTo(((index + 1) * 13 * Math.PI) / 240);
    });
    expect(velocities[9]).toBeCloseTo((13 * Math.PI) / 24);
    expect(state.shieldAngle).toBeGreaterThan(0);
    expect(state.shieldActive).toBe(false);
    expect(state.shieldEnergy).toBe(55);
  });

  it("completes a 180 degree inactive shield traverse in forty-three ticks without overshoot", () => {
    const config = createSpaceshipSimulationConfig();
    let state = createSpaceshipSimulationState(config, 1);
    let travelled = 0;
    let previousAngle = state.shieldAngle;
    let ticks = 0;

    for (let step = 0; step < 100; step += 1) {
      state = applyShieldInput(state, {
        vector: { x: -1, y: 0 },
        active: false,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
      ticks += 1;
      const delta = shortestAngleDelta(previousAngle, state.shieldAngle);
      expect(delta).toBeGreaterThanOrEqual(0);
      travelled += delta;
      expect(travelled).toBeLessThanOrEqual(Math.PI + 1e-12);
      previousAngle = state.shieldAngle;
      if (state.shieldAngle === -Math.PI && state.shieldAngularVelocity === 0) {
        break;
      }
    }

    expect(ticks).toBe(43);
    expect(state.shieldAngle).toBe(-Math.PI);
    expect(state.shieldAngularVelocity).toBe(0);
    expect(state.shieldActive).toBe(false);
  });

  it("trusted shield disconnect turns it off and cancels target without changing energy", () => {
    const config = createSpaceshipSimulationConfig();
    let state = applyShieldInput(
      { ...createSpaceshipSimulationState(config, 1), shieldEnergy: 90 },
      {
        vector: { x: 0, y: -1 },
        active: true,
        receivedTick: 0
      }
    );
    state = advance(state, config, 2);
    const energyAtDisconnect = state.shieldEnergy;
    const velocityAtDisconnect = state.shieldAngularVelocity;
    state = cancelShieldControl(state);

    expect(state.shieldTargetAngle).toBeNull();
    expect(state.shieldActive).toBe(false);
    expect(state.shieldEnergy).toBe(energyAtDisconnect);
    expect(state.shieldAngularVelocity).toBe(velocityAtDisconnect);
    expect(state.inputs.shield).toMatchObject({ vector: { x: 0, y: 0 }, active: false });

    state = advanceSpaceshipSimulation(state, config);
    expect(Math.abs(state.shieldAngularVelocity)).toBeLessThan(Math.abs(velocityAtDisconnect));
    expect(state.shieldEnergy).toBe(energyAtDisconnect + 0.5);
  });

  it("drains a full shield in five seconds of holding and requires re-arming", () => {
    const config = createSpaceshipSimulationConfig();
    let state = applyShieldInput(createSpaceshipSimulationState(config, 1), {
      vector: { x: 0, y: 1 },
      active: true,
      receivedTick: 0
    });
    // The engage window comes first and spends nothing, so a full drain now
    // takes it plus the same five seconds of holding.
    state = advance(state, config, config.shieldEngageTicks + 100);

    expect(state.shieldEnergy).toBe(0);
    expect(state.shieldActive).toBe(false);
    expect(state.shieldRearmRequired).toBe(true);

    state = applyShieldInput(state, {
      vector: { x: 1, y: 0 },
      active: true,
      receivedTick: state.clock.tick
    });
    state = advance(state, config, 10);
    expect(state.shieldEnergy).toBe(5);
    expect(state.shieldActive).toBe(false);
    expect(state.shieldRearmRequired).toBe(true);
  });

  it("recharges an inactive empty shield in ten seconds and clamps at capacity", () => {
    const config = createSpaceshipSimulationConfig();
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 1),
      shieldEnergy: 0,
      shieldRearmRequired: true
    };
    state = applyShieldInput(state, {
      vector: { x: 0, y: 0 },
      active: false,
      receivedTick: 0
    });
    state = advance(state, config, 200);

    expect(state.shieldEnergy).toBe(100);
    expect(state.shieldActive).toBe(false);
    expect(state.shieldRearmRequired).toBe(false);
    expect(advance(state, config, 10).shieldEnergy).toBe(100);
  });

  it("re-arms itself once the battery wins back the mark", () => {
    const config = createSpaceshipSimulationConfig();
    let state = applyShieldInput(createSpaceshipSimulationState(config, 1), {
      vector: { x: 0, y: -1 },
      active: true,
      receivedTick: 0
    });
    state = advance(state, config, config.shieldEngageTicks + 100);
    state = advance(state, config, 4);
    expect(state.shieldEnergy).toBe(2);
    expect(state.shieldActive).toBe(false);
    // Draining put the shield into its cooldown and locked it out.
    expect(state.shieldPhase).toBe("cooling");
    expect(state.shieldRearmRequired).toBe(true);

    // No release and no second press: the old rule left an operator holding a
    // shield that refused for ever with nothing saying why.
    const mark = config.shieldRearmEnergy;
    while (state.shieldEnergy < mark) state = advanceSpaceshipSimulation(state, config);
    expect(state.shieldRearmRequired).toBe(false);
    expect(state.shieldEnergy).toBeGreaterThanOrEqual(mark);
  });

  it("refuses to hold until the mark, however hard the button is pressed", () => {
    const config = createSpaceshipSimulationConfig();
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 1),
      shieldEnergy: 0,
      shieldRearmRequired: true
    };

    const mark = config.shieldRearmEnergy;
    while (state.shieldEnergy < mark) {
      state = applyShieldInput(state, {
        vector: { x: 1, y: 0 },
        active: true,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
      if (state.shieldEnergy < mark) expect(state.shieldActive).toBe(false);
    }
    // And the moment it has the charge, the same held request is honoured.
    state = advance(state, config, config.shieldEngageTicks + 1);
    expect(state.shieldActive).toBe(true);
  });
});

describe("deterministic spaceship trace", () => {
  it("produces an identical mixed-role trace for identical accepted inputs", () => {
    const config = createSpaceshipSimulationConfig();

    const run = () => {
      let state = createSpaceshipSimulationState(config, 1);
      state = applyPilotInput(state, { vector: { x: 1, y: -1 }, mgFiring: false, receivedTick: 0 });
      state = applyGunnerInput(state, {
        vector: { x: 0, y: 1 },
        firing: true,
        receivedTick: 0
      });
      state = applyShieldInput(state, {
        vector: { x: -1, y: 0 },
        active: true,
        receivedTick: 0
      });
      state = advance(state, config, 3);
      state = applyPilotInput(state, {
        vector: { x: 0, y: 0 },
        mgFiring: false,
        receivedTick: state.clock.tick
      });
      return advance(state, config, 12);
    };

    expect(run()).toEqual(run());
  });
});

describe("pilot nose machine gun", () => {
  const ZERO = { x: 0, y: 0 };

  const mgSpawnsOnTick = (state: SpaceshipSimulationState) =>
    state.projectiles.filter(
      (projectile) =>
        projectile.source === "machineGun" && projectile.spawnedTick === state.clock.tick
    ).length;

  it("spawns a nose projectile along the heading with fixed MG stats", () => {
    const config = createSpaceshipSimulationConfig();
    let state = createSpaceshipSimulationState(config, 1);
    state = applyPilotInput(state, {
      vector: ZERO,
      mgFiring: true,
      receivedTick: state.clock.tick
    });
    state = advanceSpaceshipSimulation(state, config);

    const shots = state.projectiles.filter((projectile) => projectile.source === "machineGun");
    expect(shots).toHaveLength(1);
    const shot = shots[0];
    if (shot === undefined) return;
    // Nose offset along +x (heading 0) from the world center.
    expect(shot.x).toBeCloseTo(
      config.worldWidth / 2 + config.spaceshipRadius + config.mgProjectileRadius
    );
    expect(shot.y).toBeCloseTo(config.worldHeight / 2);
    expect(shot.velocity.x).toBeCloseTo(config.mgProjectileSpeedPerSecond);
    expect(shot.velocity.y).toBeCloseTo(0);
    expect(shot.damage).toBe(config.mgDamage);
    expect(shot.radius).toBe(config.mgProjectileRadius);
  });

  it("fires at a 2-tick cooldown cadence (5 shots in 10 ticks)", () => {
    const config = createSpaceshipSimulationConfig();
    let state = createSpaceshipSimulationState(config, 1);
    let totalSpawns = 0;
    for (let i = 0; i < 10; i++) {
      state = applyPilotInput(state, {
        vector: ZERO,
        mgFiring: true,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
      totalSpawns += mgSpawnsOnTick(state);
    }
    expect(totalSpawns).toBe(5);
  });

  it("queues a rising edge and coalesces taps into one shot", () => {
    const config = createSpaceshipSimulationConfig();

    // Short tap: true then false before the next advance still fires once.
    let state = createSpaceshipSimulationState(config, 1);
    state = applyPilotInput(state, {
      vector: ZERO,
      mgFiring: true,
      receivedTick: state.clock.tick
    });
    expect(state.queuedMgFire).toBe(true);
    state = applyPilotInput(state, {
      vector: ZERO,
      mgFiring: false,
      receivedTick: state.clock.tick
    });
    expect(state.queuedMgFire).toBe(true); // still queued after the falling edge
    state = advanceSpaceshipSimulation(state, config);
    expect(mgSpawnsOnTick(state)).toBe(1); // fired once from the queued edge
    state = applyPilotInput(state, {
      vector: ZERO,
      mgFiring: false,
      receivedTick: state.clock.tick
    });
    state = advanceSpaceshipSimulation(state, config);
    expect(mgSpawnsOnTick(state)).toBe(0); // no second shot

    // Coalescing: multiple rising edges before one advance collapse into a single shot.
    state = createSpaceshipSimulationState(config, 1);
    state = applyPilotInput(state, {
      vector: ZERO,
      mgFiring: true,
      receivedTick: state.clock.tick
    });
    state = applyPilotInput(state, {
      vector: ZERO,
      mgFiring: false,
      receivedTick: state.clock.tick
    });
    state = applyPilotInput(state, {
      vector: ZERO,
      mgFiring: true,
      receivedTick: state.clock.tick
    });
    expect(state.queuedMgFire).toBe(true); // coalesced into one request
    state = advanceSpaceshipSimulation(state, config);
    expect(mgSpawnsOnTick(state)).toBe(1); // only one shot despite two rising edges
  });

  it("overheats exactly on the 25th shot when cooling is disabled", () => {
    const config = createSpaceshipSimulationConfig({ mgCoolingPerSecond: 0 });
    let state = createSpaceshipSimulationState(config, 1);
    let totalSpawns = 0;
    for (let i = 0; i < 80 && !state.mgOverheated; i++) {
      state = applyPilotInput(state, {
        vector: ZERO,
        mgFiring: true,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
      totalSpawns += mgSpawnsOnTick(state);
    }
    expect(state.mgOverheated).toBe(true);
    expect(totalSpawns).toBe(25); // the 25th shot pushes heat to capacity
  });

  it("cools from overheat down to the rearm threshold in 47 ticks", () => {
    const config = createSpaceshipSimulationConfig(); // cooling 30/s -> 1.5/tick, rearm at 30
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 1),
      mgHeat: config.mgHeatCapacity,
      mgOverheated: true
    };
    let ticks = 0;
    while (state.mgOverheated && ticks < 200) {
      state = applyPilotInput(state, {
        vector: ZERO,
        mgFiring: false,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
      ticks++;
    }
    expect(ticks).toBe(47); // 100 -> <=30 at 1.5/tick
  });

  it("auto-resumes firing while held after rearming", () => {
    const config = createSpaceshipSimulationConfig();
    let state = createSpaceshipSimulationState(config, 1);
    const spawnedTicks: number[] = [];
    let overheatTick: number | null = null;
    let rearmTick: number | null = null;
    for (let i = 0; i < 300; i++) {
      const wasOverheated = state.mgOverheated;
      state = applyPilotInput(state, {
        vector: ZERO,
        mgFiring: true,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
      if (mgSpawnsOnTick(state) > 0) spawnedTicks.push(state.clock.tick);
      if (!wasOverheated && state.mgOverheated) overheatTick = state.clock.tick;
      if (wasOverheated && !state.mgOverheated && rearmTick === null) rearmTick = state.clock.tick;
    }
    expect(overheatTick).not.toBeNull(); // it did overheat while held
    expect(rearmTick).not.toBeNull(); // and rearmed via cooling
    if (rearmTick === null) return;
    const resumedSpawns = spawnedTicks.filter((tick) => tick > rearmTick).length;
    expect(resumedSpawns).toBeGreaterThan(0); // fired again without re-pressing
  });

  it("cancels the heading target and zeroes mgFiring when pilot input goes stale", () => {
    const config = createSpaceshipSimulationConfig();
    let state = createSpaceshipSimulationState(config, 1);
    state = applyPilotInput(state, {
      vector: { x: 0, y: 1 },
      mgFiring: true,
      receivedTick: state.clock.tick
    });
    expect(state.headingTargetAngle).toBeCloseTo(Math.PI / 2); // target set from the vector
    for (let i = 0; i < config.inputTimeoutTicks + 2; i++) {
      state = advanceSpaceshipSimulation(state, config);
    }
    expect(state.headingTargetAngle).toBeNull(); // stale input cancels the target
    expect(state.inputs.pilot?.mgFiring ?? false).toBe(false); // stale input zeroes mgFiring
  });

  it("cancelPilotControl clears queued fire, target and intent but keeps angle and heat", () => {
    const config = createSpaceshipSimulationConfig();
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 1),
      spaceshipHeading: 0.7,
      mgHeat: 42
    };
    state = applyPilotInput(state, {
      vector: { x: 1, y: 0 },
      mgFiring: true,
      receivedTick: state.clock.tick
    });
    expect(state.queuedMgFire).toBe(true);
    const cancelled = cancelPilotControl(state);
    expect(cancelled.queuedMgFire).toBe(false);
    expect(cancelled.headingTargetAngle).toBeNull();
    expect(cancelled.inputs.pilot?.mgFiring ?? false).toBe(false);
    expect(cancelled.inputs.pilot?.vector).toEqual({ x: 0, y: 0 });
    expect(cancelled.spaceshipHeading).toBe(0.7); // current angle preserved
    expect(cancelled.mgHeat).toBe(42); // heat preserved
  });

  it("neutralizes MG in intermission and keeps cooling heat", () => {
    const config = createSpaceshipSimulationConfig();
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 1),
      encounterPhase: "intermission",
      mgHeat: 80
    };
    state = applyPilotInput(state, {
      vector: { x: 1, y: 0 },
      mgFiring: true,
      receivedTick: state.clock.tick
    });
    expect(state.queuedMgFire).toBe(true); // pending request before the tick
    const heatBefore = state.mgHeat;
    state = advanceSpaceshipSimulation(state, config); // one intermission tick
    expect(state.queuedMgFire).toBe(false); // neutralized
    expect(state.inputs.pilot?.mgFiring ?? false).toBe(false);
    expect(state.headingTargetAngle).toBeNull();
    expect(state.mgHeat).toBeLessThan(heatBefore); // heat keeps cooling in intermission
  });

  it("latches the heading target on zero vector and converges without overshoot", () => {
    const config = createSpaceshipSimulationConfig();

    // Latch: a non-zero vector sets the target, a zero vector keeps it.
    let state = createSpaceshipSimulationState(config, 1);
    state = applyPilotInput(state, {
      vector: { x: 0, y: 1 },
      mgFiring: false,
      receivedTick: state.clock.tick
    });
    const latchedTarget = state.headingTargetAngle;
    expect(latchedTarget).toBeCloseTo(Math.PI / 2);
    state = applyPilotInput(state, {
      vector: ZERO,
      mgFiring: false,
      receivedTick: state.clock.tick
    });
    expect(state.headingTargetAngle).toBe(latchedTarget); // zero vector keeps the latched target

    // No overshoot: drive toward a fixed target and verify it never crosses.
    const target = Math.PI / 3;
    state = createSpaceshipSimulationState(config, 1);
    let overshot = false;
    let settledFor = 0;
    for (let i = 0; i < 400 && settledFor < 12; i++) {
      state = applyPilotInput(state, {
        vector: { x: Math.cos(target), y: Math.sin(target) },
        mgFiring: false,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
      const delta = shortestAngleDelta(state.spaceshipHeading, target); // + below, - past the target
      if (delta < -1e-4) overshot = true;
      settledFor =
        Math.abs(delta) < 1e-3 && Math.abs(state.headingAngularVelocity) < 1e-3
          ? settledFor + 1
          : 0;
    }
    expect(overshot).toBe(false); // never crossed the target
    expect(settledFor).toBeGreaterThanOrEqual(12); // converged and held
  });
});

describe("gunner cannon heat", () => {
  const AIM = { x: 1, y: 0 };
  const cannonSpawnsOnTick = (state: SpaceshipSimulationState) =>
    state.projectiles.filter(
      (projectile) => projectile.source === "cannon" && projectile.spawnedTick === state.clock.tick
    ).length;

  function holdTrigger(
    state: SpaceshipSimulationState,
    config: SpaceshipSimulationConfig,
    firing: boolean
  ): SpaceshipSimulationState {
    const commanded = applyGunnerInput(state, {
      vector: AIM,
      firing,
      receivedTick: state.clock.tick
    });
    return advanceSpaceshipSimulation(commanded, config);
  }

  it("overheats after a burst when cooling is disabled", () => {
    // Firing used to be free, which made shooting at everything strictly better
    // than choosing targets and left gunnery skill worth nothing.
    const config = createSpaceshipSimulationConfig({ cannonCoolingPerSecond: 0 });
    let state = createSpaceshipSimulationState(config, 1);
    let shots = 0;
    for (let index = 0; index < 200 && !state.cannonOverheated; index += 1) {
      state = holdTrigger(state, config, true);
      shots += cannonSpawnsOnTick(state);
    }
    expect(state.cannonOverheated).toBe(true);
    expect(shots).toBe(Math.ceil(config.cannonHeatCapacity / config.cannonHeatPerShot));
  });

  it("refuses to fire while overheated, however hard the trigger is held", () => {
    const config = createSpaceshipSimulationConfig({ cannonCoolingPerSecond: 0 });
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 2),
      cannonHeat: config.cannonHeatCapacity,
      cannonOverheated: true
    };
    let shots = 0;
    for (let index = 0; index < 40; index += 1) {
      state = holdTrigger(state, config, true);
      shots += cannonSpawnsOnTick(state);
    }
    expect(shots).toBe(0);
  });

  it("comes back into service once it cools past the rearm threshold", () => {
    const config = createSpaceshipSimulationConfig();
    let state: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 3),
      cannonHeat: config.cannonHeatCapacity,
      cannonOverheated: true
    };
    let ticks = 0;
    while (state.cannonOverheated && ticks < 400) {
      state = holdTrigger(state, config, false);
      ticks += 1;
    }
    expect(state.cannonOverheated).toBe(false);
    expect(state.cannonHeat).toBeLessThanOrEqual(config.cannonRearmThreshold);
    // It is a real wait, not a formality.
    expect(ticks).toBeGreaterThan(20);
  });

  it("cools while the trigger is off and climbs while it is held", () => {
    const config = createSpaceshipSimulationConfig();
    let state = createSpaceshipSimulationState(config, 4);
    for (let index = 0; index < 6; index += 1) state = holdTrigger(state, config, true);
    const hot = state.cannonHeat;
    expect(hot).toBeGreaterThan(0);

    for (let index = 0; index < 6; index += 1) state = holdTrigger(state, config, false);
    expect(state.cannonHeat).toBeLessThan(hot);
  });
});

describe("arena geometry", () => {
  it("derives the square world from a radius that came from a preset", () => {
    // Without the derivation this throws: the radius would sit inside the
    // default world and validation rejects a circle that is not inscribed.
    const config = createSpaceshipSimulationConfig({ arenaRadius: 4400 });

    expect(config.arenaRadius).toBe(4400);
    expect(config.worldWidth).toBe(8800);
    expect(config.worldHeight).toBe(8800);
  });

  it("keeps a world the caller states for itself", () => {
    const config = createSpaceshipSimulationConfig({
      arenaRadius: 1200,
      worldWidth: 2400,
      worldHeight: 2400
    });

    expect(config.worldWidth).toBe(2400);
  });
});

describe("shield timing", () => {
  const raise = (config: SpaceshipSimulationConfig, state: SpaceshipSimulationState) =>
    advance(
      applyShieldInput(state, {
        vector: { x: 0, y: 1 },
        active: true,
        receivedTick: state.clock.tick
      }),
      config,
      config.shieldEngageTicks + 1
    );

  it("holds the shield up for its minimum even when the operator lets go at once", () => {
    const config = createSpaceshipSimulationConfig();
    let state = raise(config, createSpaceshipSimulationState(config, 1));
    expect(state.shieldPhase).toBe("up");

    // The flick an autopilot makes for free: on and straight back off.
    state = applyShieldInput(state, {
      vector: { x: 0, y: 1 },
      active: false,
      receivedTick: state.clock.tick
    });
    state = advance(state, config, config.shieldMinimumUpTicks - 1);
    expect(state.shieldActive).toBe(true);

    state = advance(state, config, 2);
    expect(state.shieldPhase).toBe("cooling");
    expect(state.shieldActive).toBe(false);
  });

  it("ignores a request made while the shield is cooling", () => {
    const config = createSpaceshipSimulationConfig();
    let state = raise(config, createSpaceshipSimulationState(config, 1));
    state = applyShieldInput(state, {
      vector: { x: 0, y: 1 },
      active: false,
      receivedTick: state.clock.tick
    });
    state = advance(state, config, config.shieldMinimumUpTicks + 1);
    expect(state.shieldPhase).toBe("cooling");

    state = applyShieldInput(state, {
      vector: { x: 0, y: 1 },
      active: true,
      receivedTick: state.clock.tick
    });
    state = advance(state, config, config.shieldCooldownTicks - 2);
    expect(state.shieldPhase).toBe("cooling");
    expect(state.shieldActive).toBe(false);
  });

  it("keeps the instant toggle when every duration is zero", () => {
    const config = createSpaceshipSimulationConfig({
      shieldEngageTicks: 0,
      shieldMinimumUpTicks: 0,
      shieldCooldownTicks: 0
    });
    let state = applyShieldInput(createSpaceshipSimulationState(config, 1), {
      vector: { x: 0, y: 1 },
      active: true,
      receivedTick: 0
    });

    state = advanceSpaceshipSimulation(state, config);
    expect(state.shieldActive).toBe(true);

    state = applyShieldInput(state, {
      vector: { x: 0, y: 1 },
      active: false,
      receivedTick: state.clock.tick
    });
    state = advanceSpaceshipSimulation(state, config);
    expect(state.shieldActive).toBe(false);
    expect(state.shieldPhase).toBe("down");
  });
});

describe("elastic rim", () => {
  it("turns a full-throttle run around inside the band, never on the circle", () => {
    const config = createSpaceshipSimulationConfig();
    const legalRadius = config.arenaRadius - config.spaceshipRadius;
    const center = config.worldWidth / 2;
    let state = createSpaceshipSimulationState(config, 5);
    let furthest = 0;

    // Long enough to cross half the arena at full thrust and meet the rim.
    for (let step = 0; step < 400; step += 1) {
      state = holdHelm(state, config, { turn: 0, thrust: 1 }, 1);
      furthest = Math.max(
        furthest,
        Math.hypot(state.spaceship.x - center, state.spaceship.y - center)
      );
    }

    // Without the band the hull parks exactly on the legal circle, which is the
    // single zero step that stops the whole picture.
    expect(furthest).toBeLessThan(legalRadius);
    expect(furthest).toBeGreaterThan(legalRadius - ARENA_CUSHION_BAND);

    // Holding the throttle into the rubber settles against it rather than
    // stopping on the circle: the spring and the engine balance out.
    const distanceHeld = Math.hypot(state.spaceship.x - center, state.spaceship.y - center);
    const outward =
      ((state.spaceship.x - center) * state.spaceship.velocity.x +
        (state.spaceship.y - center) * state.spaceship.velocity.y) /
      distanceHeld;
    expect(Math.abs(outward)).toBeLessThan(1);

    // Let go and the band gives the hull back: that is the rubber, not a wall.
    const released = holdHelm(state, config, { turn: 0, thrust: 0 }, 20);
    expect(Math.hypot(released.spaceship.x - center, released.spaceship.y - center)).toBeLessThan(
      distanceHeld
    );
  });
});

describe("tank helm", () => {
  it("spins while a turn is asked for and then stays where it stopped", () => {
    const config = createSpaceshipSimulationConfig();
    const state = createSpaceshipSimulationState(config, 1);

    const spinning = holdHelm(state, config, { turn: 1, thrust: 0 }, 8);
    expect(spinning.headingAngularVelocity).toBeGreaterThan(0);
    expect(spinning.headingTargetAngle).toBeNull();

    const stopped = holdHelm(spinning, config, { turn: 0, thrust: 0 }, 20);
    expect(stopped.headingAngularVelocity).toBe(0);

    // Stopping means staying. A remembered bearing would pull the nose back
    // here, which is exactly the swing this helm exists to lose.
    const settled = holdHelm(stopped, config, { turn: 0, thrust: 0 }, 20);
    expect(settled.spaceshipHeading).toBe(stopped.spaceshipHeading);
  });

  it("drops a bearing the stick named instead of snapping back to it", () => {
    const config = createSpaceshipSimulationConfig();
    const state = createSpaceshipSimulationState(config, 2);

    const aimed = applyPilotInput(state, {
      vector: { x: 0, y: 1 },
      mgFiring: false,
      receivedTick: state.clock.tick
    });
    expect(aimed.headingTargetAngle).not.toBeNull();

    const spinning = applyPilotInput(aimed, {
      vector: { x: 0, y: 0 },
      mgFiring: false,
      receivedTick: aimed.clock.tick,
      turn: -1,
      thrust: 0
    });
    expect(spinning.headingTargetAngle).toBeNull();
  });

  it("burns along the nose and backs up along it without turning", () => {
    const config = createSpaceshipSimulationConfig();
    const state = createSpaceshipSimulationState(config, 3);
    const turned = holdHelm(state, config, { turn: 1, thrust: 0 }, 10);
    const resting = holdHelm(turned, config, { turn: 0, thrust: 0 }, 20);
    const heading = resting.spaceshipHeading;

    const forward = holdHelm(resting, config, { turn: 0, thrust: 1 }, 10);
    expect(Math.hypot(forward.spaceship.velocity.x, forward.spaceship.velocity.y)).toBeGreaterThan(
      0
    );
    expect(
      Math.abs(
        shortestAngleDelta(
          Math.atan2(forward.spaceship.velocity.y, forward.spaceship.velocity.x),
          heading
        )
      )
    ).toBeLessThan(0.01);
    expect(forward.spaceshipHeading).toBe(heading);

    const back = holdHelm(resting, config, { turn: 0, thrust: -1 }, 10);
    expect(
      Math.abs(
        shortestAngleDelta(
          Math.atan2(back.spaceship.velocity.y, back.spaceship.velocity.x),
          canonicalizeAngle(heading + Math.PI)
        )
      )
    ).toBeLessThan(0.01);
    expect(back.spaceshipHeading).toBe(heading);
  });

  it("keeps reverse the slower gear", () => {
    const config = createSpaceshipSimulationConfig();
    const state = createSpaceshipSimulationState(config, 3);
    // Long enough for either direction to have reached its own ceiling.
    const forward = holdHelm(state, config, { turn: 0, thrust: 1 }, 60);
    const back = holdHelm(state, config, { turn: 0, thrust: -1 }, 60);
    const forwardSpeed = Math.hypot(forward.spaceship.velocity.x, forward.spaceship.velocity.y);
    const backSpeed = Math.hypot(back.spaceship.velocity.x, back.spaceship.velocity.y);

    expect(backSpeed).toBeCloseTo(forwardSpeed * config.spaceshipReverseSpeedFactor, 5);
    // The point of the knob: backing up must not be a second forward gear, or
    // a pilot flies the whole fight in reverse with the nose on the target.
    expect(backSpeed).toBeLessThan(forwardSpeed);
  });

  it("leaves the stick untouched, which has no nose to reverse along", () => {
    const config = createSpaceshipSimulationConfig();
    const state = createSpaceshipSimulationState(config, 3);
    let stick = state;
    for (let step = 0; step < 60; step += 1) {
      stick = applyPilotInput(stick, {
        vector: { x: -1, y: 0 },
        mgFiring: false,
        receivedTick: stick.clock.tick
      });
      stick = advanceSpaceshipSimulation(stick, config);
    }
    expect(Math.hypot(stick.spaceship.velocity.x, stick.spaceship.velocity.y)).toBeCloseTo(
      config.spaceshipSpeedPerSecond,
      5
    );
  });

  it("leaves a command without a turn intent driving the bearing as before", () => {
    const config = createSpaceshipSimulationConfig();
    const state = createSpaceshipSimulationState(config, 4);

    const steered = holdPilot(state, config, { x: 0, y: 1 }, 12);

    expect(steered.headingTargetAngle).toBeCloseTo(Math.PI / 2, 10);
    expect(steered.spaceshipHeading).toBeGreaterThan(0);
  });
});
