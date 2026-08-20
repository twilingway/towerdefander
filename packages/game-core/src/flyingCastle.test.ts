import { describe, expect, it } from "vitest";

import {
  advanceFlyingCastle,
  applyGunnerInput,
  applyPilotInput,
  applyShieldInput,
  cancelGunnerControl,
  cancelQueuedFire,
  cancelShieldControl,
  canonicalizeAngle,
  createFlyingCastleConfig,
  createFlyingCastleState,
  deactivateShield,
  moveVectorTowards,
  moveScalarTowards,
  normalizeVector,
  shortestAngleDelta,
  validateFlyingCastleConfig,
  type FlyingCastleConfig,
  type FlyingCastleState,
  type Vector2
} from "./index.js";

function advance(state: FlyingCastleState, config: FlyingCastleConfig, steps: number) {
  let current = state;
  for (let step = 0; step < steps; step += 1) {
    current = advanceFlyingCastle(current, config);
  }
  return current;
}

function holdPilot(
  state: FlyingCastleState,
  config: FlyingCastleConfig,
  vector: Vector2,
  steps: number
) {
  let current = state;
  for (let step = 0; step < steps; step += 1) {
    current = applyPilotInput(current, { vector, receivedTick: current.clock.tick });
    current = advanceFlyingCastle(current, config);
  }
  return current;
}

describe("flying castle configuration", () => {
  it("creates the explicit smooth-flight defaults deterministically", () => {
    const config = createFlyingCastleConfig();

    expect(config).toEqual({
      fixedStepMs: 50,
      worldWidth: 2400,
      worldHeight: 1600,
      castleSpeedPerSecond: 320,
      castleAccelerationPerSecondSquared: 640,
      castleBrakingPerSecondSquared: 800,
      castleRadius: 52,
      inputTimeoutTicks: 5,
      projectileSpeedPerSecond: 720,
      projectileLifetimeMs: 1500,
      projectileRadius: 8,
      fireCooldownTicks: 5,
      shieldCapacity: 100,
      shieldDrainPerSecond: 20,
      shieldRechargePerSecond: 10,
      turretMaxAngularSpeedPerSecond: (4 * Math.PI) / 3,
      turretAngularAccelerationPerSecondSquared: (20 * Math.PI) / 3,
      turretAngularBrakingPerSecondSquared: (20 * Math.PI) / 3,
      shieldMaxAngularSpeedPerSecond: (5 * Math.PI) / 3,
      shieldAngularAccelerationPerSecondSquared: (25 * Math.PI) / 3,
      shieldAngularBrakingPerSecondSquared: (25 * Math.PI) / 3
    });
    expect(createFlyingCastleState(config)).toEqual(createFlyingCastleState(config));
    expect(createFlyingCastleState(config)).toMatchObject({
      shieldEnergy: 100,
      shieldRearmRequired: false,
      queuedFire: false,
      turretTargetAngle: null,
      turretAngularVelocity: 0,
      shieldTargetAngle: null,
      shieldAngularVelocity: 0
    });
  });

  it.each([
    ["fixedStepMs", 0],
    ["worldWidth", Number.NaN],
    ["worldHeight", 0],
    ["castleSpeedPerSecond", -1],
    ["castleAccelerationPerSecondSquared", 0],
    ["castleBrakingPerSecondSquared", Number.POSITIVE_INFINITY],
    ["castleRadius", 0],
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
      validateFlyingCastleConfig({ ...createFlyingCastleConfig(), [field]: value });
    }).toThrow(RangeError);
  });

  it("rejects worlds that cannot fit the castle", () => {
    expect(() => createFlyingCastleConfig({ worldWidth: 100 })).toThrow(RangeError);
    expect(() => createFlyingCastleConfig({ worldHeight: 100 })).toThrow(RangeError);
  });
});

describe("pilot movement", () => {
  it("accelerates to max speed in ten equal fixed steps", () => {
    const config = createFlyingCastleConfig();
    let state = createFlyingCastleState(config);
    const velocities: number[] = [];

    for (let step = 0; step < 10; step += 1) {
      state = holdPilot(state, config, { x: 1, y: 0 }, 1);
      velocities.push(state.castle.velocity.x);
    }

    expect(velocities).toEqual([32, 64, 96, 128, 160, 192, 224, 256, 288, 320]);
    expect(state.castle.x).toBe(createFlyingCastleState(config).castle.x + 88);
  });

  it("brakes from max speed to rest in eight fixed steps", () => {
    const config = createFlyingCastleConfig();
    let state = holdPilot(createFlyingCastleState(config), config, { x: 1, y: 0 }, 10);
    const releaseX = state.castle.x;
    const velocities: number[] = [];

    state = applyPilotInput(state, { vector: { x: 0, y: 0 }, receivedTick: state.clock.tick });
    for (let step = 0; step < 8; step += 1) {
      state = advanceFlyingCastle(state, config);
      velocities.push(state.castle.velocity.x);
    }

    expect(velocities).toEqual([280, 240, 200, 160, 120, 80, 40, 0]);
    expect(state.castle.x).toBe(releaseX + 56);
  });

  it("caps diagonal target and actual velocity at max speed", () => {
    const config = createFlyingCastleConfig();
    const state = holdPilot(createFlyingCastleState(config), config, { x: 1, y: 1 }, 10);

    expect(Math.hypot(state.castle.velocity.x, state.castle.velocity.y)).toBeCloseTo(320);
    expect(state.castle.velocity.x).toBeCloseTo(320 / Math.sqrt(2));
    expect(normalizeVector({ x: 0.25, y: 0.5 })).toEqual({ x: 0.25, y: 0.5 });
    const moved = moveVectorTowards({ x: 0, y: 0 }, { x: 3, y: 4 }, 2);
    expect(moved.x).toBeCloseTo(1.2);
    expect(moved.y).toBeCloseTo(1.6);
  });

  it("clamps at bounds and clears only the outward velocity component", () => {
    const config = createFlyingCastleConfig({ worldWidth: 200, worldHeight: 200 });
    const nearRight: FlyingCastleState = {
      ...createFlyingCastleState(config),
      castle: { x: 147, y: 100, velocity: { x: 100, y: 100 } }
    };
    const bounded = advanceFlyingCastle(
      applyPilotInput(nearRight, { vector: { x: 1, y: 1 }, receivedTick: 0 }),
      config
    );

    expect(bounded.castle.x).toBe(config.worldWidth - config.castleRadius);
    expect(bounded.castle.velocity.x).toBe(0);
    expect(bounded.castle.velocity.y).toBeGreaterThan(100);

    const inward: FlyingCastleState = {
      ...createFlyingCastleState(config),
      castle: {
        x: config.worldWidth - config.castleRadius,
        y: 100,
        velocity: { x: -100, y: 0 }
      }
    };
    const movedInward = advanceFlyingCastle(
      applyPilotInput(inward, { vector: { x: -1, y: 0 }, receivedTick: 0 }),
      config
    );
    expect(movedInward.castle.x).toBeLessThan(config.worldWidth - config.castleRadius);
    expect(movedInward.castle.velocity.x).toBeLessThan(0);
  });

  it("starts ordinary braking when input becomes stale", () => {
    const config = createFlyingCastleConfig();
    const moving = applyPilotInput(createFlyingCastleState(config), {
      vector: { x: 1, y: 0 },
      receivedTick: 0
    });
    const afterFourSteps = advance(moving, config, 4);
    const stale = advanceFlyingCastle(afterFourSteps, config);

    expect(afterFourSteps.castle.velocity.x).toBe(128);
    expect(stale.castle.velocity.x).toBe(88);
    expect(stale.castle.x).toBeGreaterThan(afterFourSteps.castle.x);
    expect(stale.inputs.pilot?.vector).toEqual({ x: 0, y: 0 });
  });

  it("brakes instead of teleporting velocity to zero after trusted neutral input", () => {
    const config = createFlyingCastleConfig();
    let state = holdPilot(createFlyingCastleState(config), config, { x: 1, y: 0 }, 10);
    state = applyPilotInput(state, { vector: { x: 0, y: 0 }, receivedTick: state.clock.tick });
    state = advanceFlyingCastle(state, config);

    expect(state.castle.velocity.x).toBe(280);
  });

  it("rejects non-finite vectors, invalid deltas, and future received ticks", () => {
    const state = createFlyingCastleState(createFlyingCastleConfig());
    expect(() =>
      applyPilotInput(state, { vector: { x: Number.NaN, y: 0 }, receivedTick: 0 })
    ).toThrow(RangeError);
    expect(() => applyPilotInput(state, { vector: { x: 0, y: 0 }, receivedTick: 1 })).toThrow(
      RangeError
    );
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
    const config = createFlyingCastleConfig();
    let state = applyGunnerInput(createFlyingCastleState(config), {
      vector: { x: 0, y: -1 },
      firing: false,
      receivedTick: 0
    });
    state = advanceFlyingCastle(state, config);
    expect(state.turretTargetAngle).toBeCloseTo(-Math.PI / 2);
    expect(state.turretAngularVelocity).toBeCloseTo(-Math.PI / 3);
    expect(state.turretAngle).toBeCloseTo(-Math.PI / 60);

    state = applyGunnerInput(state, {
      vector: { x: 0, y: 0 },
      firing: false,
      receivedTick: state.clock.tick
    });
    state = advanceFlyingCastle(state, config);
    expect(state.turretTargetAngle).toBeCloseTo(-Math.PI / 2);
    expect(state.turretAngle).toBeLessThan(-Math.PI / 60);
  });

  it("accelerates to the configured turret angular speed in four steps", () => {
    const config = createFlyingCastleConfig();
    let state = createFlyingCastleState(config);
    const velocities: number[] = [];

    for (let step = 0; step < 4; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: -1, y: 0 },
        firing: false,
        receivedTick: state.clock.tick
      });
      state = advanceFlyingCastle(state, config);
      velocities.push(state.turretAngularVelocity);
    }

    expect(velocities[0]).toBeCloseTo(Math.PI / 3);
    expect(velocities[1]).toBeCloseTo((2 * Math.PI) / 3);
    expect(velocities[2]).toBeCloseTo(Math.PI);
    expect(velocities[3]).toBeCloseTo((4 * Math.PI) / 3);
  });

  it("traverses an exact antipode positively and reaches it without overshoot", () => {
    const config = createFlyingCastleConfig();
    let state = createFlyingCastleState(config);
    let travelled = 0;
    let previousAngle = state.turretAngle;

    for (let step = 0; step < 100; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: -1, y: 0 },
        firing: false,
        receivedTick: state.clock.tick
      });
      state = advanceFlyingCastle(state, config);
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
  });

  it("takes the short arc through the canonical angle boundary", () => {
    const config = createFlyingCastleConfig();
    let state: FlyingCastleState = {
      ...createFlyingCastleState(config),
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
      state = advanceFlyingCastle(state, config);
      expect(shortestAngleDelta(previousAngle, state.turretAngle)).toBeGreaterThanOrEqual(0);
      crossedBoundary ||= state.turretAngle < 0;
      previousAngle = state.turretAngle;
    }

    expect(crossedBoundary).toBe(true);
    expect(state.turretAngle).toBeCloseTo(target);
    expect(state.turretAngularVelocity).toBe(0);
  });

  it("clamps a close target instead of overshooting it", () => {
    const config = createFlyingCastleConfig();
    const target = 0.02;
    const state = advanceFlyingCastle(
      applyGunnerInput(createFlyingCastleState(config), {
        vector: { x: Math.cos(target), y: Math.sin(target) },
        firing: false,
        receivedTick: 0
      }),
      config
    );

    expect(state.turretAngle).toBeCloseTo(target);
    expect(state.turretTargetAngle).toBeCloseTo(target);
    expect(state.turretAngularVelocity).toBe(0);
  });

  it("brakes before reversing toward a target on the opposite side", () => {
    const config = createFlyingCastleConfig();
    let state = createFlyingCastleState(config);
    for (let step = 0; step < 3; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: 0, y: 1 },
        firing: false,
        receivedTick: state.clock.tick
      });
      state = advanceFlyingCastle(state, config);
    }
    const velocityBeforeReverse = state.turretAngularVelocity;

    state = applyGunnerInput(state, {
      vector: { x: 0, y: -1 },
      firing: false,
      receivedTick: state.clock.tick
    });
    state = advanceFlyingCastle(state, config);

    expect(velocityBeforeReverse).toBeCloseTo(Math.PI);
    expect(state.turretAngularVelocity).toBeCloseTo((2 * Math.PI) / 3);
    expect(state.turretAngularVelocity).toBeGreaterThan(0);

    for (let step = 0; step < 5 && state.turretAngularVelocity >= 0; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: 0, y: -1 },
        firing: false,
        receivedTick: state.clock.tick
      });
      state = advanceFlyingCastle(state, config);
    }
    expect(state.turretAngularVelocity).toBeLessThan(0);
  });

  it("completes a tap traverse while zero aim heartbeats keep the target fresh", () => {
    const config = createFlyingCastleConfig();
    let state = applyGunnerInput(createFlyingCastleState(config), {
      vector: { x: 0, y: -1 },
      firing: false,
      receivedTick: 0
    });
    state = advanceFlyingCastle(state, config);

    for (let step = 0; step < 30 && state.turretAngle !== -Math.PI / 2; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: 0, y: 0 },
        firing: false,
        receivedTick: state.clock.tick
      });
      state = advanceFlyingCastle(state, config);
    }

    expect(state.turretTargetAngle).toBeCloseTo(-Math.PI / 2);
    expect(state.turretAngle).toBeCloseTo(-Math.PI / 2);
    expect(state.turretAngularVelocity).toBe(0);
  });

  it("preserves a short true/false click until the next simulation tick", () => {
    const config = createFlyingCastleConfig();
    let state = createFlyingCastleState(config);
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
    state = advanceFlyingCastle(state, config);
    expect(state.projectiles).toHaveLength(1);
    expect(state.queuedFire).toBe(false);
    expect(advance(state, config, config.fireCooldownTicks * 2).projectiles).toHaveLength(1);
  });

  it("spawns a projectile along the current turret angle instead of its target", () => {
    const config = createFlyingCastleConfig();
    let state = applyGunnerInput(createFlyingCastleState(config), {
      vector: { x: 0, y: -1 },
      firing: true,
      receivedTick: 0
    });
    state = advanceFlyingCastle(state, config);

    const projectile = state.projectiles[0];
    if (projectile === undefined || state.turretTargetAngle === null) {
      throw new Error("expected a projectile and turret target");
    }
    expect(state.turretAngle).toBeCloseTo(-Math.PI / 60);
    expect(state.turretTargetAngle).toBeCloseTo(-Math.PI / 2);
    expect(Math.atan2(projectile.velocity.y, projectile.velocity.x)).toBeCloseTo(state.turretAngle);
    expect(Math.atan2(projectile.velocity.y, projectile.velocity.x)).not.toBeCloseTo(
      state.turretTargetAngle
    );
  });

  it("coalesces repeated clicks into one pending shot during cooldown", () => {
    const config = createFlyingCastleConfig();
    let state = applyGunnerInput(createFlyingCastleState(config), {
      vector: { x: 1, y: 0 },
      firing: true,
      receivedTick: 0
    });
    state = advanceFlyingCastle(state, config);
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
    const config = createFlyingCastleConfig();
    let state = createFlyingCastleState(config);
    for (let step = 0; step < 11; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: 1, y: 0 },
        firing: true,
        receivedTick: state.clock.tick
      });
      state = advanceFlyingCastle(state, config);
    }

    expect(state.projectiles.map(({ spawnedTick }) => spawnedTick)).toEqual([1, 6, 11]);
  });

  it("allows the authoritative disconnect path to clear a pending shot", () => {
    const config = createFlyingCastleConfig();
    let state = applyGunnerInput(createFlyingCastleState(config), {
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
    expect(advanceFlyingCastle(state, config).projectiles).toEqual([]);
  });

  it("cancels a stale angular target and brakes without clearing queued fire", () => {
    const config = createFlyingCastleConfig({ fireCooldownTicks: 100 });
    let state: FlyingCastleState = {
      ...createFlyingCastleState(config),
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
    state = advanceFlyingCastle(state, config);

    expect(velocityBeforeStale).toBeCloseTo((-4 * Math.PI) / 3);
    expect(state.turretTargetAngle).toBeNull();
    expect(state.turretAngularVelocity).toBeCloseTo(-Math.PI);
    expect(state.queuedFire).toBe(true);
    expect(state.projectiles).toEqual([]);
  });

  it("trusted gunner disconnect clears target, hold and queue but preserves braking velocity", () => {
    const config = createFlyingCastleConfig({ fireCooldownTicks: 100 });
    let state: FlyingCastleState = {
      ...createFlyingCastleState(config),
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

    state = advanceFlyingCastle(state, config);
    expect(Math.abs(state.turretAngularVelocity)).toBeLessThan(Math.abs(velocityAtDisconnect));
    state = applyGunnerInput(state, {
      vector: { x: 0, y: 0 },
      firing: false,
      receivedTick: state.clock.tick
    });
    expect(state.turretTargetAngle).toBeNull();
  });

  it("allows the authoritative disconnect path to turn off the shield without draining energy", () => {
    const config = createFlyingCastleConfig();
    let state = applyShieldInput(createFlyingCastleState(config), {
      vector: { x: 1, y: 0 },
      active: true,
      receivedTick: 0
    });
    state = advanceFlyingCastle(state, config);
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
    const config = createFlyingCastleConfig();
    const firing = applyGunnerInput(createFlyingCastleState(config), {
      vector: { x: 0, y: 1 },
      firing: true,
      receivedTick: 0
    });
    const stale = advance(firing, config, 6);

    expect(stale.projectiles).toHaveLength(1);
    expect(stale.turretAngle).toBeCloseTo(Math.PI / 4);
    expect(stale.turretTargetAngle).toBeNull();
    expect(stale.turretAngularVelocity).toBeCloseTo((2 * Math.PI) / 3);
    expect(stale.inputs.gunner?.firing).toBe(false);
  });

  it("expires projectiles by lifetime and removes projectiles outside padded bounds", () => {
    const lifetimeConfig = createFlyingCastleConfig({ projectileSpeedPerSecond: 1 });
    let state = applyGunnerInput(createFlyingCastleState(lifetimeConfig), {
      vector: { x: 1, y: 0 },
      firing: true,
      receivedTick: 0
    });
    state = advanceFlyingCastle(state, lifetimeConfig);
    state = advance(state, lifetimeConfig, 30);
    expect(state.projectiles).toEqual([]);

    const smallWorld = createFlyingCastleConfig({
      worldWidth: 200,
      worldHeight: 200,
      projectileSpeedPerSecond: 4000
    });
    let escaping = applyGunnerInput(createFlyingCastleState(smallWorld), {
      vector: { x: 1, y: 0 },
      firing: true,
      receivedTick: 0
    });
    escaping = advanceFlyingCastle(escaping, smallWorld);
    escaping = advanceFlyingCastle(escaping, smallWorld);
    expect(escaping.projectiles).toEqual([]);
  });
});

describe("shield simulation", () => {
  it("keeps manual active state after input becomes stale and preserves angle", () => {
    const config = createFlyingCastleConfig();
    const state = advance(
      applyShieldInput(createFlyingCastleState(config), {
        vector: { x: -1, y: 0 },
        active: true,
        receivedTick: 0
      }),
      config,
      6
    );

    expect(state.shieldAngle).toBeCloseTo((5 * Math.PI) / 16);
    expect(state.shieldTargetAngle).toBeNull();
    expect(state.shieldAngularVelocity).toBeCloseTo((5 * Math.PI) / 6);
    expect(state.shieldActive).toBe(true);
    expect(state.inputs.shield?.active).toBe(true);
    expect(state.shieldEnergy).toBe(94);
  });

  it("accelerates faster than the turret and traverses while inactive and recharging", () => {
    const config = createFlyingCastleConfig();
    let state: FlyingCastleState = {
      ...createFlyingCastleState(config),
      shieldEnergy: 50
    };
    const velocities: number[] = [];

    for (let step = 0; step < 4; step += 1) {
      state = applyShieldInput(state, {
        vector: { x: 0, y: 1 },
        active: false,
        receivedTick: state.clock.tick
      });
      state = advanceFlyingCastle(state, config);
      velocities.push(state.shieldAngularVelocity);
    }

    expect(velocities[0]).toBeCloseTo((5 * Math.PI) / 12);
    expect(velocities[1]).toBeCloseTo((5 * Math.PI) / 6);
    expect(velocities[2]).toBeCloseTo((5 * Math.PI) / 4);
    expect(velocities[3]).toBeCloseTo((5 * Math.PI) / 3);
    expect(state.shieldAngle).toBeGreaterThan(0);
    expect(state.shieldActive).toBe(false);
    expect(state.shieldEnergy).toBe(52);
  });

  it("trusted shield disconnect turns it off and cancels target without changing energy", () => {
    const config = createFlyingCastleConfig();
    let state = applyShieldInput(createFlyingCastleState(config), {
      vector: { x: 0, y: -1 },
      active: true,
      receivedTick: 0
    });
    state = advance(state, config, 2);
    const energyAtDisconnect = state.shieldEnergy;
    const velocityAtDisconnect = state.shieldAngularVelocity;
    state = cancelShieldControl(state);

    expect(state.shieldTargetAngle).toBeNull();
    expect(state.shieldActive).toBe(false);
    expect(state.shieldEnergy).toBe(energyAtDisconnect);
    expect(state.shieldAngularVelocity).toBe(velocityAtDisconnect);
    expect(state.inputs.shield).toMatchObject({ vector: { x: 0, y: 0 }, active: false });

    state = advanceFlyingCastle(state, config);
    expect(Math.abs(state.shieldAngularVelocity)).toBeLessThan(Math.abs(velocityAtDisconnect));
    expect(state.shieldEnergy).toBe(energyAtDisconnect + 0.5);
  });

  it("drains a full shield in five seconds and requires re-arming", () => {
    const config = createFlyingCastleConfig();
    let state = applyShieldInput(createFlyingCastleState(config), {
      vector: { x: 0, y: 1 },
      active: true,
      receivedTick: 0
    });
    state = advance(state, config, 100);

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
    const config = createFlyingCastleConfig();
    let state: FlyingCastleState = {
      ...createFlyingCastleState(config),
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

  it("requires an accepted false then a new true after depletion", () => {
    const config = createFlyingCastleConfig();
    let state = applyShieldInput(createFlyingCastleState(config), {
      vector: { x: 0, y: -1 },
      active: true,
      receivedTick: 0
    });
    state = advance(state, config, 100);
    state = advance(state, config, 4);
    expect(state.shieldEnergy).toBe(2);
    expect(state.shieldActive).toBe(false);

    state = applyShieldInput(state, {
      vector: { x: 0, y: -1 },
      active: false,
      receivedTick: state.clock.tick
    });
    state = advanceFlyingCastle(state, config);
    expect(state.shieldRearmRequired).toBe(false);
    expect(state.shieldActive).toBe(false);

    state = applyShieldInput(state, {
      vector: { x: 0, y: -1 },
      active: true,
      receivedTick: state.clock.tick
    });
    state = advanceFlyingCastle(state, config);
    expect(state.shieldActive).toBe(true);
    expect(state.shieldEnergy).toBe(1.5);
  });

  it("does not arm a true intent accepted while energy is still empty", () => {
    const config = createFlyingCastleConfig();
    let state: FlyingCastleState = {
      ...createFlyingCastleState(config),
      shieldEnergy: 0,
      shieldRearmRequired: true,
      inputs: {
        ...createFlyingCastleState(config).inputs,
        shield: { vector: { x: 1, y: 0 }, active: true, receivedTick: 0 }
      }
    };

    state = applyShieldInput(state, {
      vector: { x: 1, y: 0 },
      active: false,
      receivedTick: 0
    });
    state = applyShieldInput(state, {
      vector: { x: 1, y: 0 },
      active: true,
      receivedTick: 0
    });
    state = advance(state, config, 10);

    expect(state.shieldEnergy).toBe(5);
    expect(state.shieldActive).toBe(false);
    expect(state.shieldRearmRequired).toBe(true);
  });
});

describe("deterministic flying castle trace", () => {
  it("produces an identical mixed-role trace for identical accepted inputs", () => {
    const config = createFlyingCastleConfig();

    const run = () => {
      let state = createFlyingCastleState(config);
      state = applyPilotInput(state, { vector: { x: 1, y: -1 }, receivedTick: 0 });
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
        receivedTick: state.clock.tick
      });
      return advance(state, config, 12);
    };

    expect(run()).toEqual(run());
  });
});
