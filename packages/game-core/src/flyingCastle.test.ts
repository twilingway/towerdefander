import { describe, expect, it } from "vitest";

import {
  advanceFlyingCastle,
  applyGunnerInput,
  applyPilotInput,
  applyShieldInput,
  createFlyingCastleConfig,
  createFlyingCastleState,
  normalizeVector,
  validateFlyingCastleConfig,
  type FlyingCastleConfig,
  type FlyingCastleState
} from "./index.js";

function advance(state: FlyingCastleState, config: FlyingCastleConfig, steps: number) {
  let current = state;
  for (let step = 0; step < steps; step += 1) {
    current = advanceFlyingCastle(current, config);
  }
  return current;
}

describe("flying castle configuration", () => {
  it("creates the explicit prototype defaults deterministically", () => {
    const config = createFlyingCastleConfig();

    expect(config).toEqual({
      fixedStepMs: 50,
      worldWidth: 2400,
      worldHeight: 1600,
      castleSpeedPerSecond: 320,
      castleRadius: 52,
      inputTimeoutTicks: 5,
      projectileSpeedPerSecond: 720,
      projectileLifetimeMs: 1500,
      projectileRadius: 8,
      fireCooldownTicks: 5
    });
    expect(createFlyingCastleState(config)).toEqual(createFlyingCastleState(config));
  });

  it.each([
    ["fixedStepMs", 0],
    ["worldWidth", Number.NaN],
    ["worldHeight", 0],
    ["castleSpeedPerSecond", -1],
    ["castleRadius", 0],
    ["inputTimeoutTicks", 1.5],
    ["projectileSpeedPerSecond", Number.POSITIVE_INFINITY],
    ["projectileLifetimeMs", 0],
    ["projectileRadius", -2],
    ["fireCooldownTicks", 0]
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
  it("moves right at configured speed for one fixed step", () => {
    const config = createFlyingCastleConfig();
    const initial = createFlyingCastleState(config);
    const result = advanceFlyingCastle(
      applyPilotInput(initial, { vector: { x: 1, y: 0 }, receivedTick: 0 }),
      config
    );

    expect(result.castle).toEqual({
      x: initial.castle.x + 16,
      y: initial.castle.y,
      velocity: { x: 320, y: 0 }
    });
    expect(result.clock).toEqual({ tick: 1, elapsedMs: 50 });
  });

  it("caps diagonal vectors at unit length", () => {
    const config = createFlyingCastleConfig();
    const state = applyPilotInput(createFlyingCastleState(config), {
      vector: { x: 1, y: 1 },
      receivedTick: 0
    });
    const result = advanceFlyingCastle(state, config);

    expect(Math.hypot(result.castle.velocity.x, result.castle.velocity.y)).toBeCloseTo(320);
    expect(normalizeVector({ x: 0.25, y: 0.5 })).toEqual({ x: 0.25, y: 0.5 });
  });

  it("clamps the castle radius inside every world edge", () => {
    const config = createFlyingCastleConfig({ worldWidth: 200, worldHeight: 200 });
    const nearEdge: FlyingCastleState = {
      ...createFlyingCastleState(config),
      castle: { x: 53, y: 147, velocity: { x: 0, y: 0 } }
    };
    const result = advanceFlyingCastle(
      applyPilotInput(nearEdge, { vector: { x: -1, y: 1 }, receivedTick: 0 }),
      config
    );

    expect(result.castle.x).toBe(config.castleRadius);
    expect(result.castle.y).toBe(config.worldHeight - config.castleRadius);
  });

  it("neutralizes movement when input age reaches five ticks", () => {
    const config = createFlyingCastleConfig();
    const moving = applyPilotInput(createFlyingCastleState(config), {
      vector: { x: 1, y: 0 },
      receivedTick: 0
    });
    const afterFourSteps = advance(moving, config, 4);
    const stopped = advanceFlyingCastle(afterFourSteps, config);

    expect(afterFourSteps.castle.velocity.x).toBe(320);
    expect(stopped.castle.velocity).toEqual({ x: 0, y: 0 });
    expect(stopped.castle.x).toBe(afterFourSteps.castle.x);
    expect(stopped.inputs.pilot?.vector).toEqual({ x: 0, y: 0 });
  });

  it("rejects non-finite vectors and future received ticks", () => {
    const state = createFlyingCastleState(createFlyingCastleConfig());
    expect(() =>
      applyPilotInput(state, { vector: { x: Number.NaN, y: 0 }, receivedTick: 0 })
    ).toThrow(RangeError);
    expect(() => applyPilotInput(state, { vector: { x: 0, y: 0 }, receivedTick: 1 })).toThrow(
      RangeError
    );
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

  it("fires one server-identified projectile and enforces tick cooldown", () => {
    const config = createFlyingCastleConfig();
    let state = applyGunnerInput(createFlyingCastleState(config), {
      vector: { x: 1, y: 0 },
      firing: true,
      receivedTick: 0
    });
    state = advanceFlyingCastle(state, config);

    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0]).toMatchObject({
      projectileId: "projectile-0",
      x: 1260,
      y: 800,
      velocity: { x: 720, y: 0 },
      spawnedTick: 1
    });
    expect(advanceFlyingCastle(state, config).projectiles).toHaveLength(1);

    state = advance(state, config, 4);
    state = applyGunnerInput(state, {
      vector: { x: 1, y: 0 },
      firing: true,
      receivedTick: state.clock.tick
    });
    state = advanceFlyingCastle(state, config);
    expect(state.projectiles.map(({ projectileId }) => projectileId)).toEqual([
      "projectile-0",
      "projectile-1"
    ]);
  });

  it("stops firing when held input becomes stale", () => {
    const config = createFlyingCastleConfig();
    const firing = applyGunnerInput(createFlyingCastleState(config), {
      vector: { x: 1, y: 0 },
      firing: true,
      receivedTick: 0
    });
    const stale = advance(firing, config, 5);

    expect(stale.projectiles).toHaveLength(1);
    expect(stale.turretAngle).toBe(0);
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
  it("aims left and holds the active sector", () => {
    const config = createFlyingCastleConfig();
    const state = advanceFlyingCastle(
      applyShieldInput(createFlyingCastleState(config), {
        vector: { x: -1, y: 0 },
        active: true,
        receivedTick: 0
      }),
      config
    );

    expect(Math.abs(state.shieldAngle)).toBeCloseTo(Math.PI);
    expect(state.shieldActive).toBe(true);
  });

  it("deactivates immediately on release and on stale input while preserving angle", () => {
    const config = createFlyingCastleConfig();
    let state = advanceFlyingCastle(
      applyShieldInput(createFlyingCastleState(config), {
        vector: { x: 0, y: 1 },
        active: true,
        receivedTick: 0
      }),
      config
    );
    const angle = state.shieldAngle;
    state = applyShieldInput(state, {
      vector: { x: 0, y: 0 },
      active: false,
      receivedTick: state.clock.tick
    });
    state = advanceFlyingCastle(state, config);
    expect(state.shieldActive).toBe(false);
    expect(state.shieldAngle).toBe(angle);

    state = applyShieldInput(state, {
      vector: { x: 0, y: 1 },
      active: true,
      receivedTick: state.clock.tick
    });
    state = advance(state, config, 5);
    expect(state.shieldActive).toBe(false);
    expect(state.shieldAngle).toBe(angle);
    expect(state.inputs.shield?.active).toBe(false);
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
