import { describe, expect, it } from "vitest";

import { createControllerJoinUrl, toDisplayRoomView, type NetworkRoomState } from "./roomView.js";

function collection<T>(values: T[]) {
  return new Map(values.map((value, index) => [index, value]));
}

describe("display room view", () => {
  it("flattens display-only world collections into a strict v6 view", () => {
    const state: NetworkRoomState = {
      roomId: "ROOM123",
      phase: "active",
      displayConnected: true,
      players: collection([
        { playerId: "p2", playerName: "Sam", role: "gunner", ready: true, connected: true },
        { playerId: "p1", playerName: "Alex", role: "pilot", ready: true, connected: true }
      ]),
      hasGame: true,
      game: {
        tick: 2,
        elapsedMs: 100,
        worldWidth: 2400,
        worldHeight: 1600,
        castle: { x: 1200, y: 800, velocityX: 0, velocityY: 0, radius: 52 },
        turretAngle: 0,
        shield: { angle: 0, active: false, energy: 75, capacity: 100 },
        display: {
          obstacles: collection([
            { obstacleId: "cloud", kind: "circle", x: 100, y: 100, radius: 20, width: 0, height: 0 }
          ]),
          projectiles: collection([
            {
              projectileId: "projectile-0",
              x: 1300,
              y: 800,
              velocityX: 720,
              velocityY: 0,
              radius: 8
            }
          ])
        }
      }
    };
    const view = toDisplayRoomView(state);
    expect(view?.players.map((player) => player.role)).toEqual(["pilot", "gunner"]);
    expect(view?.game?.obstacles).toEqual([
      { obstacleId: "cloud", kind: "circle", x: 100, y: 100, radius: 20 }
    ]);
    expect(view?.game?.projectiles).toHaveLength(1);
    expect(view?.game?.shield.energy).toBe(75);
  });

  it("builds a controller URL without losing existing parameters", () => {
    expect(createControllerJoinUrl("https://game.test/controller?lang=ru", "ROOM123")).toBe(
      "https://game.test/controller?lang=ru&room=ROOM123"
    );
  });
});
