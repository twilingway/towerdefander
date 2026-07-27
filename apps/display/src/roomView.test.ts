import { describe, expect, it } from "vitest";

import { createControllerJoinUrl, toPublicRoomView } from "./roomView.js";

describe("display room view", () => {
  it("waits for the first complete Colyseus snapshot", () => {
    expect(
      toPublicRoomView({
        roomId: "ROOM1",
        phase: "lobby",
        displayConnected: true
      })
    ).toBeUndefined();
  });

  it("creates an encoded controller link", () => {
    expect(createControllerJoinUrl("http://192.168.1.20:5174/play", "room 7")).toBe(
      "http://192.168.1.20:5174/play?room=room+7"
    );
  });

  it("copies only the public state fields", () => {
    const player = {
      playerId: "player-1",
      playerName: "Alex",
      ready: true,
      connected: true,
      signalCount: 2
    };

    expect(
      toPublicRoomView({
        roomId: "ROOM1",
        phase: "active",
        displayConnected: true,
        players: new Map([["player-1", player]])
      })
    ).toEqual({
      roomId: "ROOM1",
      phase: "active",
      displayConnected: true,
      players: [player]
    });
  });
});
