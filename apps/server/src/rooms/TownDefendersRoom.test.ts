import {
  PROTOCOL_VERSION,
  serverErrorSchema,
  serverMessage,
  type AirstrikeCommand,
  type PlayerCapacity,
  type ReadyCommand,
  type ResourceActionCommand,
  type ServerErrorCode
} from "@town-defenders/protocol";
import type { DefenseState } from "@town-defenders/game-core";
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

function createRoom(playerCapacity = 2): TownDefendersRoom {
  const room = new TownDefendersRoom();
  room.roomId = "ROOM123";
  room.onCreate({
    role: "display",
    protocolVersion: PROTOCOL_VERSION,
    playerCapacity
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

function fillAndStartBattle(room: TownDefendersRoom, playerCapacity: PlayerCapacity): TestClient[] {
  const controllers = Array.from({ length: playerCapacity }, (_, index) =>
    createClient(`player-${String(index + 1)}`)
  );
  controllers.forEach((controller, index) => {
    joinController(room, controller, `Player ${String(index + 1)}`);
    room.handleReady(controller.client, {
      protocolVersion: PROTOCOL_VERSION,
      ready: true
    });
  });
  return controllers;
}

function action(playerId: string, actionId: string): ResourceActionCommand {
  return {
    protocolVersion: PROTOCOL_VERSION,
    roomId: "ROOM123",
    playerId,
    actionId
  };
}

function advanceUntil(room: TownDefendersRoom, predicate: () => boolean, maximumSteps = 250): void {
  for (let index = 0; index < maximumSteps && !predicate(); index += 1) {
    room.advanceGameStep();
  }
}

function updateDefenseState(
  room: TownDefendersRoom,
  update: (state: DefenseState) => DefenseState
): void {
  const testRoom = room as unknown as {
    defenseState: DefenseState | undefined;
    syncDefenseState(): void;
  };
  if (testRoom.defenseState === undefined) {
    throw new Error("Expected an active defense state.");
  }
  testRoom.defenseState = update(testRoom.defenseState);
  testRoom.syncDefenseState();
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
    }).toThrow("invalid_message");
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

  for (const playerCapacity of [2, 3, 4, 5, 6] as const) {
    it(`starts exactly ${String(playerCapacity)} stable sectors`, () => {
      const room = createRoom(playerCapacity);
      const controllers = fillAndStartBattle(room, playerCapacity);

      expect(room.state.phase).toBe("active");
      expect(room.state.playerCapacity).toBe(playerCapacity);
      expect(room.state.game.treasury).toBe(25 * playerCapacity);
      expect([...room.state.game.sectors].map((sector) => sector.sectorId)).toEqual(
        Array.from({ length: playerCapacity }, (_, index) => index)
      );
      controllers.forEach((controller, index) => {
        const player = room.state.players.get(controller.client.sessionId);
        expect(player?.sectorId).toBe(index);
        expect([...(player?.airstrikeTargetSectorIds ?? [])]).toEqual([
          index,
          (index - 1 + playerCapacity) % playerCapacity,
          ...((index + 1) % playerCapacity === (index - 1 + playerCapacity) % playerCapacity
            ? []
            : [(index + 1) % playerCapacity])
        ]);
      });
    });
  }

  it("waits for every configured player to be ready", () => {
    const room = createRoom(3);
    const controllers = Array.from({ length: 3 }, (_, index) =>
      createClient(`player-${String(index + 1)}`)
    );
    controllers.forEach((controller, index) => {
      joinController(room, controller, `Player ${String(index + 1)}`);
    });
    const [first, second] = controllers;
    if (first === undefined || second === undefined) {
      throw new Error("Expected two controllers.");
    }
    room.handleReady(first.client, {
      protocolVersion: PROTOCOL_VERSION,
      ready: true
    });
    room.handleReady(second.client, {
      protocolVersion: PROTOCOL_VERSION,
      ready: true
    });

    expect(room.state.phase).toBe("lobby");
    expect(room.state.hasGame).toBe(false);
  });

  it("keeps one spare transport seat for a typed room_full rejection", () => {
    const room = createRoom(6);
    expect(room.maxClients).toBe(8);
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

  it("keeps a finished snapshot while an expired player owner is removed", async () => {
    const room = createRoom();
    const [first] = startBattle(room);
    room.state.phase = "finished";
    const tick = room.state.game.tick;
    const result = room.state.game.result;
    vi.spyOn(room, "allowReconnection").mockRejectedValue(new Error("reconnection expired"));

    await room.onLeave(first.client, 1006);

    expect(room.state.players.has(first.client.sessionId)).toBe(false);
    expect(room.state.game.sectors[0]?.assignedPlayerId).toBe("");
    expect(room.state.game.tick).toBe(tick);
    expect(room.state.game.result).toBe(result);
    expect(() => {
      joinController(room, createClient("late-player"), "Late");
    }).toThrow("room_full");
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
    expect(room.state.game).toMatchObject({
      tick: 1,
      elapsedMs: 1000,
      stage: "intermission",
      waveNumber: 1
    });
    advanceUntil(room, () => room.state.game.display.enemies.length > 0);
    expect(room.state.game.display.enemies.length).toBeGreaterThan(0);

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
      defenseDamage: 6
    });
    expect(room.state.game.sectors[1]?.defenseLevel).toBe(1);
  });

  it("repairs damaged gates atomically", () => {
    const room = createRoom();
    const [first] = startBattle(room);
    updateDefenseState(room, (state) => ({
      ...state,
      sectors: state.sectors.map((sector) =>
        sector.sectorId === 0 ? { ...sector, gateHealth: 70 } : sector
      )
    }));
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

  it("applies an airstrike once and keeps its public effect stable on duplicate delivery", () => {
    const room = createRoom();
    const [first] = startBattle(room);
    updateDefenseState(room, (state) => ({
      ...state,
      stage: "combat",
      intermissionRemainingSteps: 0,
      airstrikeCharge: 100,
      enemies: [
        {
          enemyId: "airstrike-target",
          sectorId: 1,
          enemyType: "heavy",
          health: 20,
          maxHealth: 34,
          progress: 3
        }
      ]
    }));
    const command: AirstrikeCommand = {
      ...action(first.client.sessionId, "00000000-0000-4000-8000-000000000010"),
      targetSectorId: 1
    };

    room.handleAirstrike(first.client, command);
    const firstEffect = {
      sequence: room.state.game.display.lastAirstrikeEffect.sequence,
      tick: room.state.game.display.lastAirstrikeEffect.appliedTick,
      treasury: room.state.game.treasury
    };
    room.handleAirstrike(first.client, command);

    expect(room.state.game.display.enemies).toHaveLength(0);
    expect(firstEffect.sequence).toBe(1);
    expect(room.state.game.display).toMatchObject({
      hasLastAirstrikeEffect: true,
      lastAirstrikeEffect: {
        sequence: firstEffect.sequence,
        targetSectorId: 1,
        actionId: command.actionId,
        playerId: first.client.sessionId,
        appliedTick: firstEffect.tick
      }
    });
    expect(room.state.game.treasury).toBe(firstEffect.treasury);
  });

  it("rejects a non-neighbor airstrike in a larger room", () => {
    const room = createRoom(4);
    const [first] = fillAndStartBattle(room, 4);
    if (first === undefined) {
      throw new Error("Expected the first controller.");
    }
    updateDefenseState(room, (state) => ({
      ...state,
      stage: "combat",
      intermissionRemainingSteps: 0,
      airstrikeCharge: 100,
      enemies: [
        {
          enemyId: "remote-target",
          sectorId: 2,
          enemyType: "heavy",
          health: 20,
          maxHealth: 34,
          progress: 3
        }
      ]
    }));

    room.handleAirstrike(first.client, {
      ...action(first.client.sessionId, "00000000-0000-4000-8000-000000000011"),
      targetSectorId: 2
    });

    expect(countSentErrors(first, "action_not_available")).toBe(1);
    expect(room.state.game.airstrikeCharge).toBe(100);
    expect(room.state.game.display.enemies).toHaveLength(1);
  });

  it("journals a target outside room capacity as unavailable", () => {
    const room = createRoom();
    const [first] = startBattle(room);
    const command: AirstrikeCommand = {
      ...action(first.client.sessionId, "00000000-0000-4000-8000-000000000012"),
      targetSectorId: 5
    };

    room.handleAirstrike(first.client, command);
    room.handleAirstrike(first.client, command);

    expect(countSentErrors(first, "action_not_available")).toBe(2);
  });

  it("rejects an actionId collision with a different command fingerprint", () => {
    const room = createRoom();
    const [first] = startBattle(room);
    const command = action(first.client.sessionId, "00000000-0000-4000-8000-000000000013");

    room.handleResourceAction(first.client, command, "upgrade");
    room.handleResourceAction(first.client, command, "repair");

    expect(countSentErrors(first, "invalid_message")).toBe(1);
    expect(room.state.game.sectors[0]).toMatchObject({
      defenseLevel: 2,
      gateHealth: 100
    });
  });
});
