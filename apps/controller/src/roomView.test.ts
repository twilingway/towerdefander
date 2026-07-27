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
      sectorId: 1 as const
    };

    expect(
      findCurrentPlayer(
        {
          roomId: "ROOM1",
          phase: "lobby",
          displayConnected: true,
          game: null,
          players: [
            {
              playerId: "player-1",
              playerName: "Alex",
              ready: true,
              connected: true,
              sectorId: 0
            },
            player
          ]
        },
        "player-2"
      )
    ).toEqual(player);
  });

  it("maps the authoritative game snapshot", () => {
    const view = toPublicRoomView({
      roomId: "ROOM1",
      phase: "active",
      displayConnected: true,
      players: new Map([
        [
          "player-1",
          {
            playerId: "player-1",
            playerName: "Alex",
            ready: true,
            connected: true,
            sectorId: 0
          }
        ]
      ]),
      hasGame: true,
      game: {
        tick: 4,
        elapsedMs: 4000,
        treasury: 35,
        pathLength: 8,
        repairCost: 15,
        result: "in_progress",
        sectors: [
          {
            sectorId: 0,
            assignedPlayerId: "player-1",
            gateHealth: 80,
            gateMaxHealth: 100,
            defenseLevel: 2,
            defenseDamage: 5,
            nextUpgradeCost: 30
          },
          {
            sectorId: 1,
            assignedPlayerId: "",
            gateHealth: 100,
            gateMaxHealth: 100,
            defenseLevel: 3,
            defenseDamage: 7,
            nextUpgradeCost: -1
          }
        ],
        enemies: [
          {
            enemyId: "enemy-1",
            sectorId: 0,
            health: 6,
            progress: 3
          }
        ]
      }
    });

    expect(view?.game).toMatchObject({
      tick: 4,
      treasury: 35,
      pathLength: 8,
      repairCost: 15,
      sectors: [
        { assignedPlayerId: "player-1", nextUpgradeCost: 30 },
        { assignedPlayerId: null, nextUpgradeCost: null }
      ]
    });
  });
});
