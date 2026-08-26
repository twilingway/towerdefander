import { describe, expect, it, vi } from "vitest";

import {
  buildVisibleDemoWorld,
  calculateVisibleDemoRate,
  findNearestVisibleDemoTarget,
  findNearestVisibleDemoThreat,
  isVisibleDemoMode,
  parseVisibleDemoStatus,
  publishVisibleDemoWorld,
  sendVisibleDemoCommand,
  visibleDemoWorldKey
} from "./visibleDemo.js";

describe("visible demo helpers", () => {
  it("requires the explicit development gate and query", () => {
    expect(isVisibleDemoMode("?demo=1", true, "1")).toBe(true);
    expect(isVisibleDemoMode("?room=ABC&demo=1", true, "1")).toBe(true);
    expect(isVisibleDemoMode("?demo=0", true, "1")).toBe(false);
    expect(isVisibleDemoMode("?demo=1", false, "1")).toBe(false);
    expect(isVisibleDemoMode("?demo=1", true, undefined)).toBe(false);
  });

  it("selects the nearest shootable public target deterministically", () => {
    const nearest = findNearestVisibleDemoTarget({
      cameraViewWidth: 1600,
      spaceship: { x: 100, y: 100 },
      enemyShips: [enemy("enemy-later", 8, 120, 100)],
      asteroids: [asteroid("asteroid-first", 3, 80, 100)],
      homingMissiles: [missile("missile", 2, 160, 100)]
    });

    expect(nearest).toMatchObject({ entityId: "asteroid-first", x: 80, velocityX: 2 });
  });

  it("returns no target for an empty public combat snapshot", () => {
    expect(
      findNearestVisibleDemoTarget({
        cameraViewWidth: 1600,
        spaceship: { x: 100, y: 100 },
        enemyShips: [],
        asteroids: [],
        homingMissiles: []
      })
    ).toBeUndefined();
  });

  it("ignores entities the camera never frames, however close they are", () => {
    const spaceship = { x: 2200, y: 2200 };
    const cameraViewWidth = 1600;

    expect(
      findNearestVisibleDemoTarget({
        cameraViewWidth,
        spaceship,
        enemyShips: [enemy("enemy-below-frame", 1, 2200, 2700)],
        asteroids: [asteroid("asteroid-on-screen", 2, 2900, 2200)],
        homingMissiles: []
      })
    ).toMatchObject({ entityId: "asteroid-on-screen" });

    expect(
      findNearestVisibleDemoTarget({
        cameraViewWidth,
        spaceship,
        enemyShips: [enemy("enemy-right-of-frame", 1, 3100, 2200)],
        asteroids: [],
        homingMissiles: []
      })
    ).toBeUndefined();

    expect(
      findNearestVisibleDemoThreat({
        cameraViewWidth,
        spaceship,
        enemyShips: [],
        asteroids: [],
        hostileProjectiles: [
          { ...moving("bullet-off-screen", 1, 2200, 2660), kind: "hostile", visual: null }
        ],
        homingMissiles: [missile("missile-on-screen", 2, 2900, 2200)]
      })
    ).toMatchObject({ entityId: "missile-on-screen" });
  });

  it("selects a hostile projectile as the nearest shield threat", () => {
    const threat = findNearestVisibleDemoThreat({
      cameraViewWidth: 1600,
      spaceship: { x: 100, y: 100 },
      enemyShips: [enemy("enemy", 1, 200, 100)],
      asteroids: [],
      hostileProjectiles: [{ ...moving("bullet", 2, 110, 100), kind: "hostile", visual: null }],
      homingMissiles: []
    });

    expect(threat?.entityId).toBe("bullet");
  });

  it("validates status events and calls the optional bridge", () => {
    expect(
      parseVisibleDemoStatus({
        state: "running",
        message: "Targeting",
        waveNumber: 2,
        phase: "combat",
        controlHz: 20
      })
    ).toEqual({
      state: "running",
      message: "Targeting",
      waveNumber: 2,
      phase: "combat",
      controlHz: 20
    });
    expect(
      parseVisibleDemoStatus({ state: "running", waveNumber: 2, phase: "combat" })
    ).toBeUndefined();

    const bridge = vi.fn();
    expect(sendVisibleDemoCommand({ __spaceshipVisibleDemoCommand: bridge }, "pause")).toBe(true);
    expect(bridge).toHaveBeenCalledWith("pause");
    expect(sendVisibleDemoCommand({}, "stop")).toBe(false);
  });

  it("calculates measured rates from real elapsed time", () => {
    expect(calculateVisibleDemoRate(60, 1_000)).toBe(60);
    expect(calculateVisibleDemoRate(10, 500)).toBe(20);
    expect(calculateVisibleDemoRate(10, 0)).toBe(0);
  });
});

function moving(entityId: string, spawnSequence: number, x: number, y: number) {
  return { entityId, spawnSequence, x, y, velocityX: 2, velocityY: -1, radius: 10 };
}

function enemy(entityId: string, spawnSequence: number, x: number, y: number) {
  return {
    ...moving(entityId, spawnSequence, x, y),
    kind: "gunship" as const,
    heading: 0,
    hp: 10,
    maxHp: 10
  };
}

function asteroid(entityId: string, spawnSequence: number, x: number, y: number) {
  return { ...moving(entityId, spawnSequence, x, y), hp: 10, maxHp: 10 };
}

function missile(entityId: string, spawnSequence: number, x: number, y: number) {
  return { ...moving(entityId, spawnSequence, x, y), heading: 0, visual: null };
}

describe("visible demo world picture", () => {
  it("keeps every framed entity with the fields the bot needs", () => {
    const world = buildVisibleDemoWorld(worldGame(), 1_700);

    expect(world.sampledAtMs).toBe(1_700);
    expect(world.tick).toBe(42);
    expect(world.phase).toBe("combat");
    expect(world.ship).toMatchObject({ x: 2_200, y: 2_200, heading: 0.5, radius: 52 });
    expect(world.shield).toMatchObject({ active: false, energy: 80, arcHalfAngle: Math.PI / 4 });
    expect(world.machineGun).toMatchObject({ heat: 12, capacity: 100, overheated: false });
    expect(world.enemies).toHaveLength(1);
    expect(world.enemies[0]).toMatchObject({
      entityId: "enemy-near",
      kind: "gunship",
      hp: 10,
      velocityX: 2,
      radius: 10
    });
    expect(world.missiles[0]).toMatchObject({ entityId: "missile-near", heading: 0 });
    expect(world.bullets[0]).toMatchObject({ entityId: "bullet-near" });
    expect(world.asteroids[0]).toMatchObject({ entityId: "rock-near", maxHp: 10 });
  });

  it("drops every entity the camera never frames", () => {
    const world = buildVisibleDemoWorld(
      worldGame({
        enemyShips: [enemy("enemy-near", 1, 2_300, 2_200), enemy("enemy-far", 2, 2_200, 3_400)],
        homingMissiles: [missile("missile-far", 3, 4_000, 2_200)],
        hostileProjectiles: [projectile("bullet-far", 4, 2_200, 4_000)],
        asteroids: [asteroid("rock-far", 5, 100, 2_200)]
      }),
      0
    );

    expect(world.enemies.map(({ entityId }) => entityId)).toEqual(["enemy-near"]);
    expect(world.missiles).toHaveLength(0);
    expect(world.bullets).toHaveLength(0);
    expect(world.asteroids).toHaveLength(0);
  });

  it("survives an empty battlefield", () => {
    const world = buildVisibleDemoWorld(
      worldGame({ enemyShips: [], homingMissiles: [], hostileProjectiles: [], asteroids: [] }),
      0
    );

    expect(world.enemies).toHaveLength(0);
    expect(world.missiles).toHaveLength(0);
    expect(world.bullets).toHaveLength(0);
    expect(world.asteroids).toHaveLength(0);
  });

  it("publishes onto the host only when asked", () => {
    const host: Record<string, unknown> = {};
    publishVisibleDemoWorld(host, buildVisibleDemoWorld(worldGame(), 5));

    expect(host[visibleDemoWorldKey]).toMatchObject({ sampledAtMs: 5 });
    expect(() => {
      publishVisibleDemoWorld(undefined, buildVisibleDemoWorld(worldGame(), 5));
    }).not.toThrow();
  });
});

function projectile(entityId: string, spawnSequence: number, x: number, y: number) {
  return { ...moving(entityId, spawnSequence, x, y), kind: "hostile" as const, visual: null };
}

function worldGame(overrides: Record<string, unknown> = {}) {
  return {
    tick: 42,
    cameraViewWidth: 1600,
    arenaRadius: 2200,
    worldWidth: 4400,
    worldHeight: 4400,
    shieldRadius: 104,
    turretAngle: 1.2,
    spaceship: {
      x: 2_200,
      y: 2_200,
      heading: 0.5,
      velocityX: 10,
      velocityY: -5,
      radius: 52,
      hp: 400,
      maxHp: 500
    },
    shield: { angle: 0.1, active: false, energy: 80, capacity: 100, arcHalfAngle: Math.PI / 4 },
    machineGun: { heat: 12, capacity: 100, overheated: false },
    encounter: { phase: "combat" as const, waveNumber: 3 },
    enemyShips: [enemy("enemy-near", 1, 2_300, 2_200)],
    homingMissiles: [missile("missile-near", 2, 2_250, 2_200)],
    hostileProjectiles: [projectile("bullet-near", 3, 2_180, 2_200)],
    asteroids: [asteroid("rock-near", 4, 2_120, 2_200)],
    ...overrides
  };
}
