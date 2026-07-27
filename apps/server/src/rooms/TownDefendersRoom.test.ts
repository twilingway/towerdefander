import {
  PROTOCOL_VERSION,
  serverMessage,
  type ReadyCommand,
  type SignalCommand
} from "@town-defenders/protocol";
import { CloseCode, type Client } from "colyseus";
import { describe, expect, it, vi } from "vitest";

import { TownDefendersRoom } from "./TownDefendersRoom.js";

interface TestClient {
  client: Client;
  send: ReturnType<typeof vi.fn>;
}

function createClient(sessionId: string): TestClient {
  const send = vi.fn();

  return {
    client: {
      sessionId,
      send
    } as unknown as Client,
    send
  };
}

function createRoom(): TownDefendersRoom {
  const room = new TownDefendersRoom();
  room.roomId = "ROOM123";
  room.onCreate({
    role: "display",
    protocolVersion: PROTOCOL_VERSION
  });
  return room;
}

describe("TownDefendersRoom", () => {
  it("allows only a display to create a room", () => {
    const room = new TownDefendersRoom();
    room.roomId = "ROOM123";

    expect(() => {
      room.onCreate({
        role: "controller",
        protocolVersion: PROTOCOL_VERSION,
        playerName: "Alex"
      });
    }).toThrow("Only the display may create a room.");
  });

  it("starts after two connected controllers are ready", () => {
    const room = createRoom();
    const display = createClient("display");
    const first = createClient("player-1");
    const second = createClient("player-2");

    room.onJoin(display.client, {
      role: "display",
      protocolVersion: PROTOCOL_VERSION
    });
    room.onJoin(first.client, {
      role: "controller",
      protocolVersion: PROTOCOL_VERSION,
      playerName: "Alex"
    });
    room.onJoin(second.client, {
      role: "controller",
      protocolVersion: PROTOCOL_VERSION,
      playerName: "Sam"
    });

    const ready: ReadyCommand = {
      protocolVersion: PROTOCOL_VERSION,
      ready: true
    };
    room.handleReady(first.client, ready);
    expect(room.state.phase).toBe("lobby");

    room.handleReady(second.client, ready);
    expect(room.state.phase).toBe("active");
  });

  it("rejects a third controller without displacing players", () => {
    const room = createRoom();

    for (const sessionId of ["player-1", "player-2"]) {
      room.onJoin(createClient(sessionId).client, {
        role: "controller",
        protocolVersion: PROTOCOL_VERSION,
        playerName: sessionId
      });
    }

    expect(() => {
      room.onJoin(createClient("player-3").client, {
        role: "controller",
        protocolVersion: PROTOCOL_VERSION,
        playerName: "player-3"
      });
    }).toThrow("room_full");
    expect(room.state.players.size).toBe(2);
  });

  it("keeps player state when the display disconnects", async () => {
    const room = createRoom();
    const display = createClient("display");
    const controller = createClient("player-1");
    room.onJoin(display.client, {
      role: "display",
      protocolVersion: PROTOCOL_VERSION
    });
    room.onJoin(controller.client, {
      role: "controller",
      protocolVersion: PROTOCOL_VERSION,
      playerName: "Alex"
    });

    await room.onLeave(display.client, 1006);

    expect(room.state.displayConnected).toBe(false);
    expect(room.state.players.get("player-1")?.playerName).toBe("Alex");
  });

  it("applies a signal action only once", () => {
    const room = createRoom();
    const first = createClient("player-1");
    const second = createClient("player-2");

    for (const client of [first, second]) {
      room.onJoin(client.client, {
        role: "controller",
        protocolVersion: PROTOCOL_VERSION,
        playerName: client.client.sessionId
      });
      room.handleReady(client.client, {
        protocolVersion: PROTOCOL_VERSION,
        ready: true
      });
    }

    const signal: SignalCommand = {
      protocolVersion: PROTOCOL_VERSION,
      actionId: "00000000-0000-4000-8000-000000000001"
    };

    room.handleSignal(first.client, signal);
    room.handleSignal(first.client, signal);

    expect(room.state.players.get("player-1")?.signalCount).toBe(1);
  });

  it("deduplicates one actionId across all controller identities", () => {
    const room = createRoom();
    const first = createClient("player-1");
    const second = createClient("player-2");

    for (const client of [first, second]) {
      room.onJoin(client.client, {
        role: "controller",
        protocolVersion: PROTOCOL_VERSION,
        playerName: client.client.sessionId
      });
      room.handleReady(client.client, {
        protocolVersion: PROTOCOL_VERSION,
        ready: true
      });
    }

    const signal: SignalCommand = {
      protocolVersion: PROTOCOL_VERSION,
      actionId: "00000000-0000-4000-8000-000000000002"
    };
    room.handleSignal(first.client, signal);
    room.handleSignal(second.client, signal);

    expect(room.state.players.get("player-1")?.signalCount).toBe(1);
    expect(room.state.players.get("player-2")?.signalCount).toBe(0);
  });

  it("rejects a protocol mismatch without mutation", () => {
    const room = createRoom();
    const controller = createClient("player-1");

    room.onJoin(controller.client, {
      role: "controller",
      protocolVersion: PROTOCOL_VERSION,
      playerName: "Alex"
    });

    room.handleReady(controller.client, {
      protocolVersion: PROTOCOL_VERSION + 1,
      ready: true
    });

    expect(room.state.players.get("player-1")?.ready).toBe(false);
    expect(controller.send).toHaveBeenCalledWith(serverMessage.error, {
      code: "protocol_mismatch",
      message: "Unsupported protocol version."
    });
  });

  it("preserves controller identity during the reconnection grace period", async () => {
    const room = createRoom();
    const controller = createClient("player-1");

    room.onJoin(controller.client, {
      role: "controller",
      protocolVersion: PROTOCOL_VERSION,
      playerName: "Alex"
    });
    const player = room.state.players.get("player-1");
    expect(player).toBeDefined();
    if (player === undefined) {
      throw new Error("Expected controller state to exist.");
    }
    player.ready = true;
    player.signalCount = 4;

    const allowReconnection = vi
      .spyOn(room, "allowReconnection")
      .mockResolvedValue(controller.client);

    await room.onLeave(controller.client, 1006);

    expect(allowReconnection).toHaveBeenCalledWith(controller.client, 30);
    expect(room.state.players.get("player-1")).toMatchObject({
      playerName: "Alex",
      ready: true,
      connected: true,
      signalCount: 4
    });
    expect(room.state.players.size).toBe(1);
  });

  it("removes an expired or deliberately disconnected controller", async () => {
    const expiredRoom = createRoom();
    const expiredController = createClient("expired-player");

    expiredRoom.onJoin(expiredController.client, {
      role: "controller",
      protocolVersion: PROTOCOL_VERSION,
      playerName: "Alex"
    });
    vi.spyOn(expiredRoom, "allowReconnection").mockRejectedValue(new Error("reconnection expired"));

    await expiredRoom.onLeave(expiredController.client, 1006);
    expect(expiredRoom.state.players.has("expired-player")).toBe(false);

    const consentedRoom = createRoom();
    const consentedController = createClient("consented-player");
    consentedRoom.onJoin(consentedController.client, {
      role: "controller",
      protocolVersion: PROTOCOL_VERSION,
      playerName: "Sam"
    });

    await consentedRoom.onLeave(consentedController.client, CloseCode.CONSENTED);
    expect(consentedRoom.state.players.has("consented-player")).toBe(false);
  });
});
