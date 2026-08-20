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
  it("decodes compact v5 state and sorts canonical roles", () => {
    const state: NetworkRoomState = {
      roomId: "ROOM123",
      phase: "active",
      displayConnected: true,
      players: collection([
        { playerId: "p2", playerName: "Sam", role: "shield", ready: true, connected: true },
        { playerId: "p1", playerName: "Alex", role: "pilot", ready: true, connected: true }
      ]),
      hasGame: true,
      game: {
        tick: 1,
        elapsedMs: 50,
        worldWidth: 2400,
        worldHeight: 1600,
        castle: { x: 1200, y: 800, velocityX: 0, velocityY: 0, radius: 52 },
        turretAngle: 0,
        shield: { angle: Math.PI, active: true }
      }
    };
    const view = toControllerRoomView(state);
    expect(view?.players.map((player) => player.role)).toEqual(["pilot", "shield"]);
    expect(view?.game).not.toHaveProperty("projectiles");
    expect(findCurrentPlayer(view, "p2")?.role).toBe("shield");
  });

  it("reads trimmed room code from URL", () => {
    expect(getRoomFromLocation("?room=%20ABC123%20")).toBe("ABC123");
  });
});
