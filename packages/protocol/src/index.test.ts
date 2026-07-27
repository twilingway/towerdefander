import { describe, expect, it } from "vitest";

import {
  PROTOCOL_VERSION,
  joinOptionsSchema,
  publicRoomViewSchema,
  readyCommandSchema,
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
    expect(
      publicRoomViewSchema.parse({
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
      })
    ).toMatchObject({
      roomId: "ROOM123",
      phase: "lobby",
      displayConnected: true
    });
  });
});
