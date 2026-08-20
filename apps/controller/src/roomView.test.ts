import { describe, expect, it } from "vitest";

import {
  findCurrentPlayer,
  getRoomFromLocation,
  toControllerRoomView,
  type NetworkRoomState
} from "./roomView.js";

function collection<T>(values: T[]) {
  return new Map(values.map((value, index) => [index, value]));
}

describe("controller room view", () => {
  it("decodes compact v7 state with public latency and sorts canonical roles", () => {
    const state: NetworkRoomState = {
      roomId: "ROOM123",
      phase: "active",
      displayConnected: true,
      displayLatencyMs: -1,
      players: collection([
        {
          playerId: "p2",
          playerName: "Sam",
          role: "shield",
          ready: true,
          connected: true,
          latencyMs: 62
        },
        {
          playerId: "p1",
          playerName: "Alex",
          role: "pilot",
          ready: true,
          connected: true,
          latencyMs: 28
        }
      ]),
      hasGame: true,
      game: {
        tick: 1,
        elapsedMs: 50,
        worldWidth: 2400,
        worldHeight: 1600,
        castle: { x: 1200, y: 800, velocityX: 0, velocityY: 0, radius: 52 },
        turretAngle: 0,
        shield: { angle: Math.PI, active: true, energy: 64, capacity: 100 }
      }
    };
    const view = toControllerRoomView(state);
    expect(view?.players.map((player) => player.role)).toEqual(["pilot", "shield"]);
    expect(view?.game).not.toHaveProperty("projectiles");
    expect(view?.game?.shield).toEqual({
      angle: Math.PI,
      active: true,
      energy: 64,
      capacity: 100
    });
    expect(findCurrentPlayer(view, "p2")?.role).toBe("shield");
    expect(findCurrentPlayer(view, "p2")?.latencyMs).toBe(62);
    expect(view?.displayLatencyMs).toBeNull();
  });

  it("reads trimmed room code from URL", () => {
    expect(getRoomFromLocation("?room=%20ABC123%20")).toBe("ABC123");
  });
});
