import { describe, expect, it } from "vitest";

import {
  PROTOCOL_VERSION,
  joinOptionsSchema,
  publicGameSnapshotSchema,
  publicRoomViewSchema,
  readyCommandSchema,
  resourceActionCommandSchema,
  signalCommandSchema
} from "./index.js";

describe("protocol schemas", () => {
  it("accepts a named controller using the current version", () => {
    expect(
      joinOptionsSchema.parse({
        role: "controller",
        protocolVersion: PROTOCOL_VERSION,
        playerName: "  Alex  "
      })
    ).toEqual({
      role: "controller",
      protocolVersion: PROTOCOL_VERSION,
      playerName: "Alex"
    });
  });

  it("rejects an unsupported protocol version", () => {
    expect(() =>
      joinOptionsSchema.parse({
        role: "display",
        protocolVersion: PROTOCOL_VERSION + 1
      })
    ).toThrow();
  });

  it("requires UUID action identifiers", () => {
    expect(
      signalCommandSchema.safeParse({
        protocolVersion: PROTOCOL_VERSION,
        actionId: "duplicate"
      }).success
    ).toBe(false);
  });

  it("requires a complete resource-action identity envelope", () => {
    const command = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: "ROOM123",
      playerId: "session-1",
      actionId: "00000000-0000-4000-8000-000000000001"
    };

    expect(resourceActionCommandSchema.parse(command)).toEqual(command);
    expect(resourceActionCommandSchema.safeParse({ ...command, roomId: "" }).success).toBe(false);
    expect(resourceActionCommandSchema.safeParse({ ...command, sectorId: 1 }).success).toBe(false);
  });

  it("validates a compact two-sector game snapshot", () => {
    expect(
      publicGameSnapshotSchema.parse({
        tick: 3,
        elapsedMs: 1500,
        treasury: 42,
        result: "in_progress",
        sectors: [
          {
            sectorId: 0,
            assignedPlayerId: "session-1",
            gateHealth: 80,
            gateMaxHealth: 100,
            defenseLevel: 1,
            defenseDamage: 3
          },
          {
            sectorId: 1,
            assignedPlayerId: null,
            gateHealth: 100,
            gateMaxHealth: 100,
            defenseLevel: 2,
            defenseDamage: 5
          }
        ],
        enemies: [{ enemyId: "enemy-1", sectorId: 0, health: 6, progress: 2 }]
      })
    ).toMatchObject({ tick: 3, treasury: 42, result: "in_progress" });
  });

  it("rejects unknown fields at the trust boundary", () => {
    expect(
      joinOptionsSchema.safeParse({
        role: "display",
        protocolVersion: PROTOCOL_VERSION,
        trusted: true
      }).success
    ).toBe(false);
  });

  it("validates ready commands strictly", () => {
    expect(
      readyCommandSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        ready: true
      })
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      ready: true
    });

    expect(
      readyCommandSchema.safeParse({
        protocolVersion: PROTOCOL_VERSION + 1,
        ready: true
      }).success
    ).toBe(false);
  });

  it("defines the complete public room view", () => {
    const view = publicRoomViewSchema.parse({
      roomId: "ROOM123",
      phase: "lobby",
      displayConnected: true,
      players: [
        {
          playerId: "session-1",
          playerName: "Alex",
          ready: false,
          connected: true,
          signalCount: 0
        }
      ]
    });

    expect(view).toMatchObject({
      roomId: "ROOM123",
      phase: "lobby",
      displayConnected: true,
      game: null,
      players: [{ sectorId: null }]
    });
  });
});
