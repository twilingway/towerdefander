import { describe, expect, it, vi } from "vitest";

import {
  calculateVisibleDemoRate,
  findNearestVisibleDemoTarget,
  findNearestVisibleDemoThreat,
  isVisibleDemoMode,
  parseVisibleDemoStatus,
  sendVisibleDemoCommand
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
        spaceship: { x: 100, y: 100 },
        enemyShips: [],
        asteroids: [],
        homingMissiles: []
      })
    ).toBeUndefined();
  });

  it("selects a hostile projectile as the nearest shield threat", () => {
    const threat = findNearestVisibleDemoThreat({
      spaceship: { x: 100, y: 100 },
      enemyShips: [enemy("enemy", 1, 200, 100)],
      asteroids: [],
      hostileProjectiles: [{ ...moving("bullet", 2, 110, 100), kind: "hostile" }],
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
  return { ...moving(entityId, spawnSequence, x, y), heading: 0 };
}
