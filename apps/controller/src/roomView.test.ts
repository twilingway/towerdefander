import { describe, expect, it } from "vitest";

import { findCurrentPlayer, getRoomFromLocation, toPublicRoomView } from "./roomView.js";

describe("controller room view", () => {
  it("waits for the first complete Colyseus snapshot", () => {
    expect(toPublicRoomView(undefined)).toBeUndefined();
  });

  it("reads a room code from a direct link", () => {
    expect(getRoomFromLocation("?room=ROOM%207")).toBe("ROOM 7");
  });

  it("finds only the server-assigned player identity", () => {
    const player = {
      playerId: "player-2",
      playerName: "Sam",
      ready: false,
      connected: true,
      signalCount: 0
    };

    expect(
      findCurrentPlayer(
        {
          roomId: "ROOM1",
          phase: "lobby",
          displayConnected: true,
          players: [
            {
              playerId: "player-1",
              playerName: "Alex",
              ready: true,
              connected: true,
              signalCount: 1
            },
            player
          ]
        },
        "player-2"
      )
    ).toEqual(player);
  });
});
