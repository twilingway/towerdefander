import {
  CREW_ROLES,
  PLAYER_CAPACITY,
  PROTOCOL_VERSION,
  serverErrorSchema,
  type CrewRole,
  type ServerErrorCode
} from "@town-defenders/protocol";
import { CloseCode, type Client } from "colyseus";
import { describe, expect, it, vi } from "vitest";

import { TownDefendersRoom } from "./TownDefendersRoom.js";

interface TestClient {
  readonly client: Client;
  readonly send: ReturnType<typeof vi.fn>;
}

function createClient(sessionId: string): TestClient {
  const send = vi.fn();
  return { client: { sessionId, send } as unknown as Client, send };
}

function createRoom(): TownDefendersRoom {
  const room = new TownDefendersRoom();
  room.roomId = "ROOM123";
  room.onCreate({ role: "display", protocolVersion: PROTOCOL_VERSION });
  return room;
}

function joinDisplay(room: TownDefendersRoom): TestClient {
  const display = createClient("display");
  room.onJoin(display.client, { role: "display", protocolVersion: PROTOCOL_VERSION });
  return display;
}

function joinController(room: TownDefendersRoom, index: number): TestClient {
  const controller = createClient(`player-${String(index + 1)}`);
  room.onJoin(controller.client, {
    role: "controller",
    protocolVersion: PROTOCOL_VERSION,
    playerName: `Player ${String(index + 1)}`
  });
  return controller;
}

function ready(room: TownDefendersRoom, controller: TestClient): void {
  room.handleReady(controller.client, {
    protocolVersion: PROTOCOL_VERSION,
    roomId: room.roomId,
    playerId: controller.client.sessionId
  });
}

function startGame(room = createRoom()): { room: TownDefendersRoom; controllers: TestClient[] } {
  const controllers = Array.from({ length: PLAYER_CAPACITY }, (_, index) =>
    joinController(room, index)
  );
  controllers.forEach((controller) => {
    ready(room, controller);
  });
  return { room, controllers };
}

function controllerAt(controllers: readonly TestClient[], index: number): TestClient {
  const controller = controllers[index];
  if (controller === undefined) throw new Error(`Missing controller at index ${String(index)}.`);
  return controller;
}

function countErrors(client: TestClient, code: ServerErrorCode): number {
  return (client.send.mock.calls as unknown[][]).filter((call) => {
    const parsed = serverErrorSchema.safeParse(call[1]);
    return parsed.success && parsed.data.code === code;
  }).length;
}

function playerByRole(room: TownDefendersRoom, role: CrewRole): TestClient["client"] | undefined {
  const player = [...room.state.players.values()].find((candidate) => candidate.role === role);
  return player === undefined
    ? undefined
    : ({ sessionId: player.playerId, send: vi.fn() } as unknown as Client);
}

describe("TownDefendersRoom v5 lifecycle", () => {
  it("accepts only strict protocol v5 display create options", () => {
    const room = new TownDefendersRoom();
    room.roomId = "ROOM123";
    expect(() => {
      room.onCreate({ role: "display", protocolVersion: PROTOCOL_VERSION, capacity: 3 });
    }).toThrow("invalid_message");
    expect(() => {
      room.onCreate({ role: "display", protocolVersion: 4 });
    }).toThrow("protocol_mismatch");
  });

  it("assigns canonical roles and starts only when all three are ready", () => {
    const room = createRoom();
    const setInterval = vi.spyOn(room.clock, "setInterval");
    const controllers = Array.from({ length: PLAYER_CAPACITY }, (_, index) =>
      joinController(room, index)
    );
    expect([...room.state.players.values()].map((player) => player.role)).toEqual(CREW_ROLES);

    ready(room, controllerAt(controllers, 0));
    ready(room, controllerAt(controllers, 1));
    expect(room.state.phase).toBe("lobby");
    ready(room, controllerAt(controllers, 2));

    expect(room.state.phase).toBe("active");
    expect(room.state.hasGame).toBe(true);
    expect(room.state.game.castle).toMatchObject({ x: 1200, y: 800, radius: 52 });
    expect(room.state.game.display.obstacles).toHaveLength(5);
    expect(setInterval).toHaveBeenCalledTimes(1);
  });

  it("keeps one spare transport seat and rejects a fourth controller", () => {
    const { room } = startGame();
    expect(room.maxClients).toBe(5);
    expect(() => joinController(room, 3)).toThrow("room_full");
  });

  it("makes ready idempotent in lobby and rejects it in active phase", () => {
    const room = createRoom();
    const controllers = Array.from({ length: PLAYER_CAPACITY }, (_, index) =>
      joinController(room, index)
    );
    ready(room, controllerAt(controllers, 0));
    ready(room, controllerAt(controllers, 0));
    controllers.slice(1).forEach((controller) => {
      ready(room, controller);
    });
    ready(room, controllerAt(controllers, 0));
    expect(countErrors(controllerAt(controllers, 0), "invalid_phase")).toBe(1);
  });

  it("reserves and restores controller identity and role", async () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    room.handlePilotInput(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      sequence: 99,
      vector: { x: 1, y: 0 }
    });
    const allow = vi.spyOn(room, "allowReconnection").mockResolvedValue(pilot.client);

    await room.onLeave(pilot.client, 1006);

    expect(allow).toHaveBeenCalledWith(pilot.client, 30);
    expect(room.state.players.get(pilot.client.sessionId)).toMatchObject({
      role: "pilot",
      connected: true
    });
    room.handlePilotInput(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      sequence: 1,
      vector: { x: -1, y: 0 }
    });
    room.advanceGameStep();
    expect(room.state.game.castle.velocityX).toBe(-320);
  });

  it("releases an expired role for an active replacement", async () => {
    const { room, controllers } = startGame();
    const gunner = controllerAt(controllers, 1);
    vi.spyOn(room, "allowReconnection").mockRejectedValue(new Error("expired"));
    await room.onLeave(gunner.client, 1006);
    expect(room.state.players.has(gunner.client.sessionId)).toBe(false);

    const replacement = joinController(room, 9);
    expect(room.state.players.get(replacement.client.sessionId)).toMatchObject({
      role: "gunner",
      ready: true
    });
  });

  it("disposes a room after display reconnect grace expires", async () => {
    const room = createRoom();
    const display = joinDisplay(room);
    vi.spyOn(room, "allowReconnection").mockRejectedValue(new Error("expired"));
    const disconnect = vi.spyOn(room, "disconnect").mockResolvedValue(undefined);
    await room.onLeave(display.client, 1006);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(room.state.displayConnected).toBe(false);
  });
});

describe("TownDefendersRoom v5 authoritative inputs", () => {
  it("moves the castle from fresh pilot input and ignores stale sequence", () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId
    } as const;
    room.handlePilotInput(pilot.client, { ...envelope, sequence: 2, vector: { x: 1, y: 0 } });
    room.handlePilotInput(pilot.client, { ...envelope, sequence: 1, vector: { x: -1, y: 0 } });
    room.advanceGameStep();
    expect(room.state.game.castle).toMatchObject({ x: 1216, velocityX: 320, velocityY: 0 });
  });

  it("limits held gunner fire by simulation cooldown", () => {
    const { room, controllers } = startGame();
    const gunner = controllerAt(controllers, 1);
    room.handleGunnerInput(gunner.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: gunner.client.sessionId,
      sequence: 1,
      aim: { x: 0, y: -1 },
      firing: true
    });
    room.advanceGameStep();
    room.advanceGameStep();
    expect(room.state.game.display.projectiles).toHaveLength(1);
    expect(room.state.game.turretAngle).toBeCloseTo(-Math.PI / 2);
    for (let index = 0; index < 2; index += 1) room.advanceGameStep();
    room.handleGunnerInput(gunner.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: gunner.client.sessionId,
      sequence: 2,
      aim: { x: 0, y: -1 },
      firing: true
    });
    for (let index = 0; index < 2; index += 1) room.advanceGameStep();
    expect(room.state.game.display.projectiles).toHaveLength(2);
  });

  it("aims and activates the shield", () => {
    const { room, controllers } = startGame();
    const shield = controllerAt(controllers, 2);
    room.handleShieldInput(shield.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: shield.client.sessionId,
      sequence: 1,
      aim: { x: -1, y: 0 },
      active: true
    });
    room.advanceGameStep();
    expect(room.state.game.shield.active).toBe(true);
    expect(Math.abs(room.state.game.shield.angle)).toBeCloseTo(Math.PI);
  });

  it("rejects malformed, wrong-role, spoofed and lobby inputs without mutation", () => {
    const lobby = createRoom();
    const lobbyPilot = joinController(lobby, 0);
    lobby.handlePilotInput(lobbyPilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: lobby.roomId,
      playerId: lobbyPilot.client.sessionId,
      sequence: 1,
      vector: { x: 1, y: 0 }
    });
    expect(countErrors(lobbyPilot, "invalid_phase")).toBe(1);

    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    room.handleGunnerInput(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      sequence: 1,
      aim: { x: 1, y: 0 },
      firing: true
    });
    expect(countErrors(pilot, "role_mismatch")).toBe(1);
    room.handlePilotInput(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: "someone-else",
      sequence: 1,
      vector: { x: 1, y: 0 }
    });
    expect(countErrors(pilot, "identity_mismatch")).toBe(1);
    room.handlePilotInput(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      sequence: 1,
      vector: { x: 1, y: 0 },
      extra: true
    });
    expect(countErrors(pilot, "invalid_message")).toBe(1);
  });

  it("neutralizes held controls immediately on disconnect", async () => {
    const { room, controllers } = startGame();
    const shield = controllerAt(controllers, 2);
    room.handleShieldInput(shield.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: shield.client.sessionId,
      sequence: 1,
      aim: { x: 1, y: 0 },
      active: true
    });
    room.advanceGameStep();
    expect(room.state.game.shield.active).toBe(true);
    vi.spyOn(room, "allowReconnection").mockResolvedValue(shield.client);
    await room.onLeave(shield.client, 1006);
    room.advanceGameStep();
    expect(room.state.game.shield.active).toBe(false);
  });

  it("does not expose a role requested by the controller", () => {
    const room = createRoom();
    const attacker = createClient("attacker");
    expect(() => {
      room.onJoin(attacker.client, {
        role: "controller",
        protocolVersion: PROTOCOL_VERSION,
        playerName: "Attacker",
        requestedRole: "gunner"
      });
    }).toThrow("invalid_message");
    expect(playerByRole(room, "gunner")).toBeUndefined();
  });

  it("removes a controller immediately after consented leave", async () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    await room.onLeave(pilot.client, CloseCode.CONSENTED);
    expect(room.state.players.has(pilot.client.sessionId)).toBe(false);
  });
});
