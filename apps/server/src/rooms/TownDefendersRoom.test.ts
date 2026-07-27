import {
  PROTOCOL_VERSION,
  serverErrorSchema,
  serverMessage,
  type ReadyCommand,
  type ResourceActionCommand,
  type ServerErrorCode
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

function joinController(room: TownDefendersRoom, client: TestClient, playerName: string): void {
  room.onJoin(client.client, {
    role: "controller",
    protocolVersion: PROTOCOL_VERSION,
    playerName
  });
}

function startBattle(room: TownDefendersRoom): [TestClient, TestClient] {
  const first = createClient("player-1");
  const second = createClient("player-2");
  joinController(room, first, "Alex");
  joinController(room, second, "Sam");

  const ready: ReadyCommand = {
    protocolVersion: PROTOCOL_VERSION,
    ready: true
  };
  room.handleReady(first.client, ready);
  room.handleReady(second.client, ready);
  return [first, second];
}

function action(playerId: string, actionId: string): ResourceActionCommand {
  return {
    protocolVersion: PROTOCOL_VERSION,
    roomId: "ROOM123",
    playerId,
    actionId
  };
}

function advanceUntil(room: TownDefendersRoom, predicate: () => boolean, maximumSteps = 50): void {
  for (let index = 0; index < maximumSteps && !predicate(); index += 1) {
    room.advanceGameStep();
  }
}

function countSentErrors(client: TestClient, code: ServerErrorCode): number {
  return (client.send.mock.calls as unknown[][]).filter((call) => {
    const result = serverErrorSchema.safeParse(call[1]);
    return result.success && result.data.code === code;
  }).length;
}

describe("TownDefendersRoom lobby and lifecycle", () => {
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

  it("starts one authoritative battle after two controllers are ready", () => {
    const room = createRoom();
    const setInterval = vi.spyOn(room.clock, "setInterval");
    const [first, second] = startBattle(room);

    expect(room.state.phase).toBe("active");
    expect(room.state.hasGame).toBe(true);
    expect(room.state.game).toMatchObject({
      tick: 0,
      treasury: 50,
      result: "in_progress"
    });
    expect([...room.state.game.sectors]).toHaveLength(2);
    expect(room.state.players.get(first.client.sessionId)?.sectorId).toBe(0);
    expect(room.state.players.get(second.client.sessionId)?.sectorId).toBe(1);
    expect(setInterval).toHaveBeenCalledTimes(1);
  });

  it("rejects a third controller without displacing players", () => {
    const room = createRoom();
    startBattle(room);

    expect(() => {
      joinController(room, createClient("player-3"), "Third");
    }).toThrow("room_full");
    expect(room.state.players.size).toBe(2);
  });

  it("reserves and restores display presence during reconnection", async () => {
    const room = createRoom();
    const display = createClient("display");
    room.onJoin(display.client, {
      role: "display",
      protocolVersion: PROTOCOL_VERSION
    });
    const allowReconnection = vi.spyOn(room, "allowReconnection").mockResolvedValue(display.client);

    await room.onLeave(display.client, 1006);

    expect(allowReconnection).toHaveBeenCalledWith(display.client, 30);
    expect(room.state.displayConnected).toBe(true);
  });

  it("keeps the battle and assignment during controller reconnection", async () => {
    const room = createRoom();
    const [first] = startBattle(room);
    room.advanceGameStep();
    const tick = room.state.game.tick;
    const allowReconnection = vi.spyOn(room, "allowReconnection").mockResolvedValue(first.client);

    await room.onLeave(first.client, 1006);

    expect(allowReconnection).toHaveBeenCalledWith(first.client, 30);
    expect(room.state.players.get("player-1")).toMatchObject({
      playerName: "Alex",
      connected: true,
      sectorId: 0
    });
    expect(room.state.game.tick).toBe(tick);
  });

  it("releases an expired active sector for a replacement controller", async () => {
    const room = createRoom();
    const [first] = startBattle(room);
    vi.spyOn(room, "allowReconnection").mockRejectedValue(new Error("reconnection expired"));

    await room.onLeave(first.client, 1006);
    expect(room.state.players.has("player-1")).toBe(false);
    expect(room.state.game.sectors[0]?.assignedPlayerId).toBe("");

    const replacement = createClient("replacement");
    joinController(room, replacement, "New defender");

    expect(room.state.players.get("replacement")).toMatchObject({
      ready: true,
      sectorId: 0
    });
    expect(room.state.game.sectors[0]?.assignedPlayerId).toBe("replacement");
  });

  it("removes a deliberately disconnected lobby controller", async () => {
    const room = createRoom();
    const controller = createClient("player-1");
    joinController(room, controller, "Alex");

    await room.onLeave(controller.client, CloseCode.CONSENTED);

    expect(room.state.players.has("player-1")).toBe(false);
  });
});

describe("TownDefendersRoom simulation", () => {
  it("advances fixed steps and publishes a terminal result", () => {
    const room = createRoom();
    startBattle(room);

    room.advanceGameStep();
    expect(room.state.game).toMatchObject({ tick: 1, elapsedMs: 1000 });
    expect(room.state.game.enemies.length).toBeGreaterThan(0);

    advanceUntil(room, () => room.state.phase === "finished");
    expect(room.state.phase).toBe("finished");
    expect(["victory", "defeat"]).toContain(room.state.game.result);

    const terminalTick = room.state.game.tick;
    room.advanceGameStep();
    expect(room.state.game.tick).toBe(terminalTick);
  });

  it("continues simulation while clients are marked disconnected", () => {
    const room = createRoom();
    startBattle(room);
    const first = room.state.players.get("player-1");
    const second = room.state.players.get("player-2");
    if (first === undefined || second === undefined) {
      throw new Error("Expected both players.");
    }
    first.connected = false;
    second.connected = false;
    room.state.displayConnected = false;

    room.advanceGameStep();

    expect(room.state.game.tick).toBe(1);
  });
});

describe("TownDefendersRoom resource actions", () => {
  it("applies upgrade once and deduplicates it room-wide", () => {
    const room = createRoom();
    const [first, second] = startBattle(room);
    const command = action(first.client.sessionId, "00000000-0000-4000-8000-000000000001");

    room.handleResourceAction(first.client, command, "upgrade");
    room.handleResourceAction(first.client, command, "upgrade");
    room.handleResourceAction(
      second.client,
      { ...command, playerId: second.client.sessionId },
      "upgrade"
    );

    expect(room.state.game.treasury).toBe(30);
    expect(room.state.game.sectors[0]).toMatchObject({
      defenseLevel: 2,
      defenseDamage: 5
    });
    expect(room.state.game.sectors[1]?.defenseLevel).toBe(1);
  });

  it("repairs damaged gates atomically", () => {
    const room = createRoom();
    const [first] = startBattle(room);
    advanceUntil(room, () => (room.state.game.sectors[0]?.gateHealth ?? 100) < 100);
    const healthBefore = room.state.game.sectors[0]?.gateHealth ?? 0;
    const treasuryBefore = room.state.game.treasury;

    room.handleResourceAction(
      first.client,
      action(first.client.sessionId, "00000000-0000-4000-8000-000000000002"),
      "repair"
    );

    expect(room.state.game.sectors[0]?.gateHealth).toBe(Math.min(100, healthBefore + 20));
    expect(room.state.game.treasury).toBe(treasuryBefore - 15);
  });

  it("rejects a mismatched room or player identity", () => {
    const room = createRoom();
    const [first] = startBattle(room);

    room.handleResourceAction(
      first.client,
      {
        ...action(first.client.sessionId, "00000000-0000-4000-8000-000000000003"),
        playerId: "player-2"
      },
      "upgrade"
    );

    expect(first.send).toHaveBeenCalledWith(serverMessage.error, {
      code: "identity_mismatch",
      message: "Room or player identity does not match."
    });
    expect(room.state.game.treasury).toBe(50);
  });

  it("replays an invalid-phase result after the battle starts", () => {
    const room = createRoom();
    const first = createClient("player-1");
    const second = createClient("player-2");
    joinController(room, first, "Alex");
    const command = action(first.client.sessionId, "00000000-0000-4000-8000-000000000004");

    room.handleResourceAction(first.client, command, "upgrade");
    joinController(room, second, "Sam");
    room.handleReady(first.client, {
      protocolVersion: PROTOCOL_VERSION,
      ready: true
    });
    room.handleReady(second.client, {
      protocolVersion: PROTOCOL_VERSION,
      ready: true
    });
    room.handleResourceAction(first.client, command, "upgrade");

    expect(countSentErrors(first, "invalid_phase")).toBe(2);
    expect(room.state.game.sectors[0]?.defenseLevel).toBe(1);
    expect(room.state.game.treasury).toBe(50);
  });

  it("replays insufficient funds after rewards replenish the treasury", () => {
    const room = createRoom();
    const [first, second] = startBattle(room);
    room.handleResourceAction(
      first.client,
      action(first.client.sessionId, "00000000-0000-4000-8000-000000000005"),
      "upgrade"
    );
    room.handleResourceAction(
      first.client,
      action(first.client.sessionId, "00000000-0000-4000-8000-000000000006"),
      "upgrade"
    );
    const rejected = action(second.client.sessionId, "00000000-0000-4000-8000-000000000007");
    room.handleResourceAction(second.client, rejected, "upgrade");
    advanceUntil(room, () => room.state.game.treasury >= 20);
    const treasuryBeforeReplay = room.state.game.treasury;

    room.handleResourceAction(second.client, rejected, "upgrade");

    expect(countSentErrors(second, "insufficient_funds")).toBe(2);
    expect(room.state.game.sectors[1]?.defenseLevel).toBe(1);
    expect(room.state.game.treasury).toBe(treasuryBeforeReplay);
  });

  it("rejects protocol mismatch without mutation", () => {
    const room = createRoom();
    const [first] = startBattle(room);

    room.handleResourceAction(
      first.client,
      {
        ...action(first.client.sessionId, "00000000-0000-4000-8000-000000000008"),
        protocolVersion: PROTOCOL_VERSION + 1
      },
      "upgrade"
    );

    expect(first.send).toHaveBeenCalledWith(serverMessage.error, {
      code: "protocol_mismatch",
      message: "Unsupported protocol version."
    });
    expect(room.state.game.treasury).toBe(50);
  });
});
