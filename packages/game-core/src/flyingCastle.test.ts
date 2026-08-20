import { describe, expect, it } from "vitest";

import {
  advanceFlyingCastle,
  applyGunnerInput,
  applyPilotInput,
  applyShieldInput,
  cancelQueuedFire,
  createFlyingCastleConfig,
  createFlyingCastleState,
  deactivateShield,
  moveVectorTowards,
  normalizeVector,
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
      shieldRechargePerSecond: 10
    });
    expect(createFlyingCastleState(config)).toEqual(createFlyingCastleState(config));
    expect(createFlyingCastleState(config)).toMatchObject({
      shieldEnergy: 100,
      shieldRearmRequired: false,
      queuedFire: false
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
    ["shieldRechargePerSecond", Number.NaN]
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

describe("gunner simulation", () => {
  it("aims upward and preserves the angle after a zero vector", () => {
    const config = createFlyingCastleConfig();
    let state = applyGunnerInput(createFlyingCastleState(config), {
      vector: { x: 0, y: -1 },
      firing: false,
      receivedTick: 0
    });
    state = advanceFlyingCastle(state, config);
    expect(state.turretAngle).toBeCloseTo(-Math.PI / 2);

    state = applyGunnerInput(state, {
      vector: { x: 0, y: 0 },
      firing: false,
      receivedTick: state.clock.tick
    });
    expect(advanceFlyingCastle(state, config).turretAngle).toBeCloseTo(-Math.PI / 2);
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
    expect(stale.turretAngle).toBeCloseTo(Math.PI / 2);
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

    expect(Math.abs(state.shieldAngle)).toBeCloseTo(Math.PI);
    expect(state.shieldActive).toBe(true);
    expect(state.inputs.shield?.active).toBe(true);
    expect(state.shieldEnergy).toBe(94);
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
