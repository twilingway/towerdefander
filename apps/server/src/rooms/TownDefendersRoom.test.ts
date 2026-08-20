import {
  CREW_ROLES,
  PLAYER_CAPACITY,
  PROTOCOL_VERSION,
  serverLatencyProbeSchema,
  serverErrorSchema,
  serverMessage,
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

function latencyProbes(client: TestClient) {
  return (client.send.mock.calls as unknown[][]).flatMap((call) => {
    if (call[0] !== serverMessage.latencyProbe) return [];
    const parsed = serverLatencyProbeSchema.safeParse(call[1]);
    return parsed.success ? [parsed.data] : [];
  });
}

function playerByRole(room: TownDefendersRoom, role: CrewRole): TestClient["client"] | undefined {
  const player = [...room.state.players.values()].find((candidate) => candidate.role === role);
  return player === undefined
    ? undefined
    : ({ sessionId: player.playerId, send: vi.fn() } as unknown as Client);
}

describe("TownDefendersRoom v7 lifecycle", () => {
  it("accepts only strict protocol v7 display create options", () => {
    const room = new TownDefendersRoom();
    room.roomId = "ROOM123";
    expect(() => {
      room.onCreate({ role: "display", protocolVersion: PROTOCOL_VERSION, capacity: 3 });
    }).toThrow("invalid_message");
    expect(() => {
      room.onCreate({ role: "display", protocolVersion: 6 });
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
    expect(room.state.game).toMatchObject({ worldWidth: 4800, worldHeight: 3200 });
    expect(room.state.game.castle).toMatchObject({ x: 2400, y: 1600, radius: 52 });
    expect(room.state.game.shield).toMatchObject({ energy: 100, capacity: 100 });
    expect(room.state.game.display.obstacles).toHaveLength(9);
    expect(room.maxMessagesPerSecond).toBe(25);
    expect(setInterval).toHaveBeenCalledTimes(1);
  });

  it("distributes decorative landmarks across every quadrant and the initial viewport", () => {
    const { room } = startGame();
    const obstacles = [...room.state.game.display.obstacles];
    const centerX = room.state.game.worldWidth / 2;
    const centerY = room.state.game.worldHeight / 2;

    expect(obstacles.some(({ x, y }) => x < centerX && y < centerY)).toBe(true);
    expect(obstacles.some(({ x, y }) => x > centerX && y < centerY)).toBe(true);
    expect(obstacles.some(({ x, y }) => x < centerX && y > centerY)).toBe(true);
    expect(obstacles.some(({ x, y }) => x > centerX && y > centerY)).toBe(true);
    expect(
      obstacles.some(({ x, y }) => Math.abs(x - centerX) <= 640 && Math.abs(y - centerY) <= 360)
    ).toBe(true);
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
    expect(room.state.game.castle.velocityX).toBe(-32);
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

describe("TownDefendersRoom v7 authoritative inputs", () => {
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
    expect(room.state.game.castle).toMatchObject({ x: 2401.6, velocityX: 32, velocityY: 0 });
  });

  it("rejects an unsafe sequence without advancing the connection watermark", () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId
    } as const;

    room.handlePilotInput(pilot.client, {
      ...envelope,
      sequence: Number.MAX_SAFE_INTEGER + 1,
      vector: { x: -1, y: 0 }
    });
    room.handlePilotInput(pilot.client, { ...envelope, sequence: 1, vector: { x: 1, y: 0 } });
    room.advanceGameStep();

    expect(countErrors(pilot, "invalid_message")).toBe(1);
    expect(room.state.game.castle).toMatchObject({ x: 2401.6, velocityX: 32, velocityY: 0 });
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
    expect(room.state.game.turretAngle).toBeLessThan(0);
    expect(room.state.game.turretAngle).toBeGreaterThan(-Math.PI / 2);
    const firstProjectile = room.state.game.display.projectiles.at(0);
    expect(Math.atan2(firstProjectile.velocityY, firstProjectile.velocityX)).toBeCloseTo(
      (-13 * Math.PI) / 6000
    );
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
    expect(room.state.game.shield.energy).toBe(99);
    expect(room.state.game.shield.angle).toBeGreaterThan(0);
    expect(room.state.game.shield.angle).toBeLessThan(Math.PI);
  });

  it("pre-aims an inactive shield with a gradual authoritative traverse", () => {
    const { room, controllers } = startGame();
    const shield = controllerAt(controllers, 2);
    room.handleShieldInput(shield.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: shield.client.sessionId,
      sequence: 1,
      aim: { x: 0, y: -1 },
      active: false
    });

    room.advanceGameStep();
    const firstAngle = room.state.game.shield.angle;
    expect(room.state.game.shield).toMatchObject({ active: false, energy: 100 });
    expect(firstAngle).toBeLessThan(0);
    expect(firstAngle).toBeGreaterThan(-Math.PI / 2);

    room.advanceGameStep();
    expect(room.state.game.shield.angle).toBeLessThan(firstAngle);
  });

  it("ignores duplicate and out-of-order gunner inputs without retargeting", () => {
    const { room, controllers } = startGame();
    const gunner = controllerAt(controllers, 1);
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: gunner.client.sessionId
    } as const;
    room.handleGunnerInput(gunner.client, {
      ...envelope,
      sequence: 2,
      aim: { x: 0, y: 1 },
      firing: false
    });
    room.handleGunnerInput(gunner.client, {
      ...envelope,
      sequence: 1,
      aim: { x: 0, y: -1 },
      firing: false
    });

    room.advanceGameStep();
    const firstAngle = room.state.game.turretAngle;
    room.advanceGameStep();
    expect(firstAngle).toBeGreaterThan(0);
    expect(room.state.game.turretAngle).toBeGreaterThan(firstAngle);
  });

  it("cancels stale aim and softly brakes the turret", () => {
    const { room, controllers } = startGame();
    const gunner = controllerAt(controllers, 1);
    room.handleGunnerInput(gunner.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: gunner.client.sessionId,
      sequence: 1,
      aim: { x: 0, y: 1 },
      firing: false
    });

    const angles: number[] = [];
    for (let step = 0; step < 5; step += 1) {
      room.advanceGameStep();
      angles.push(room.state.game.turretAngle);
    }
    const thirdIncrement = (angles[3] ?? 0) - (angles[2] ?? 0);
    const staleIncrement = (angles[4] ?? 0) - (angles[3] ?? 0);
    expect(staleIncrement).toBeGreaterThan(0);
    expect(staleIncrement).toBeLessThan(thirdIncrement);
  });

  it("does not restore a disconnected angular target after reconnect", async () => {
    const { room, controllers } = startGame();
    const gunner = controllerAt(controllers, 1);
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: gunner.client.sessionId
    } as const;
    room.handleGunnerInput(gunner.client, {
      ...envelope,
      sequence: 8,
      aim: { x: 0, y: 1 },
      firing: false
    });
    room.advanceGameStep();
    room.advanceGameStep();
    vi.spyOn(room, "allowReconnection").mockResolvedValue(gunner.client);

    await room.onLeave(gunner.client, 1006);
    for (let step = 0; step < 10; step += 1) room.advanceGameStep();
    const stoppedAngle = room.state.game.turretAngle;
    room.advanceGameStep();
    expect(room.state.game.turretAngle).toBeCloseTo(stoppedAngle);

    room.handleGunnerInput(gunner.client, {
      ...envelope,
      sequence: 1,
      aim: { x: 0, y: -1 },
      firing: false
    });
    room.advanceGameStep();
    expect(room.state.game.turretAngle).toBeLessThan(stoppedAngle);
  });

  it("drains shield energy only on fixed steps and ignores duplicate sequences", () => {
    const { room, controllers } = startGame();
    const shield = controllerAt(controllers, 2);
    const input = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: shield.client.sessionId,
      sequence: 1,
      aim: { x: 1, y: 0 },
      active: true
    } as const;
    room.handleShieldInput(shield.client, input);
    room.handleShieldInput(shield.client, input);
    expect(room.state.game.shield.energy).toBe(100);
    room.advanceGameStep();
    expect(room.state.game.shield.energy).toBe(99);
    room.advanceGameStep();
    expect(room.state.game.shield.energy).toBe(98);
  });

  it("publishes depletion, recharge and a fresh manual re-arm", () => {
    const { room, controllers } = startGame();
    const shield = controllerAt(controllers, 2);
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: shield.client.sessionId
    } as const;
    room.handleShieldInput(shield.client, {
      ...envelope,
      sequence: 1,
      aim: { x: 1, y: 0 },
      active: true
    });
    for (let index = 0; index < 100; index += 1) room.advanceGameStep();
    expect(room.state.game.shield).toMatchObject({ active: false, energy: 0, capacity: 100 });

    room.handleShieldInput(shield.client, {
      ...envelope,
      sequence: 2,
      aim: { x: 1, y: 0 },
      active: true
    });
    for (let index = 0; index < 20; index += 1) room.advanceGameStep();
    expect(room.state.game.shield).toMatchObject({ active: false, energy: 10 });

    room.handleShieldInput(shield.client, {
      ...envelope,
      sequence: 3,
      aim: { x: 1, y: 0 },
      active: false
    });
    room.handleShieldInput(shield.client, {
      ...envelope,
      sequence: 4,
      aim: { x: 1, y: 0 },
      active: true
    });
    room.advanceGameStep();
    expect(room.state.game.shield).toMatchObject({ active: true, energy: 9 });
  });

  it("clears a queued gunner click on disconnect and reconnect", async () => {
    const { room, controllers } = startGame();
    const gunner = controllerAt(controllers, 1);
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: gunner.client.sessionId
    } as const;
    room.handleGunnerInput(gunner.client, {
      ...envelope,
      sequence: 1,
      aim: { x: 1, y: 0 },
      firing: true
    });
    room.handleGunnerInput(gunner.client, {
      ...envelope,
      sequence: 2,
      aim: { x: 1, y: 0 },
      firing: false
    });
    vi.spyOn(room, "allowReconnection").mockResolvedValue(gunner.client);
    await room.onLeave(gunner.client, 1006);
    room.advanceGameStep();
    expect(room.state.game.display.projectiles).toHaveLength(0);
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
    expect(room.state.game.shield.active).toBe(false);
    expect(room.state.game.shield.energy).toBe(99);
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

describe("TownDefendersRoom v7 latency telemetry", () => {
  it("publishes server-measured display and controller RTT without changing gameplay", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    try {
      const room = createRoom();
      const display = joinDisplay(room);
      const controller = joinController(room, 0);
      const displayProbe = latencyProbes(display).at(-1);
      const controllerProbe = latencyProbes(controller).at(-1);
      if (displayProbe === undefined || controllerProbe === undefined) {
        throw new Error("Expected initial latency probes.");
      }

      room.handleLatencyPong(
        display.client,
        {
          protocolVersion: PROTOCOL_VERSION,
          roomId: room.roomId,
          probeId: displayProbe.probeId
        },
        1_018
      );
      room.handleLatencyPong(
        controller.client,
        {
          protocolVersion: PROTOCOL_VERSION,
          roomId: room.roomId,
          probeId: controllerProbe.probeId
        },
        1_047
      );

      expect(room.state.displayLatencyMs).toBe(18);
      expect(room.state.players.get(controller.client.sessionId)?.latencyMs).toBe(47);
      expect(room.state.phase).toBe("lobby");
      expect(room.state.game.tick).toBe(0);
    } finally {
      now.mockRestore();
    }
  });

  it("publishes the median of the latest five bounded samples", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(2_000);
    try {
      const room = createRoom();
      const setTimeout = vi.spyOn(room.clock, "setTimeout");
      const controller = joinController(room, 0);
      const samples = [100, 400, 200, 5_800, 300, 50];

      for (const [index, sample] of samples.entries()) {
        const probe = latencyProbes(controller).at(-1);
        if (probe === undefined) throw new Error("Expected a latency probe.");
        room.handleLatencyPong(
          controller.client,
          {
            protocolVersion: PROTOCOL_VERSION,
            roomId: room.roomId,
            probeId: probe.probeId
          },
          2_000 + sample
        );
        if (index < samples.length - 1) {
          const scheduledProbe = setTimeout.mock.calls
            .filter((call) => call[1] === 2_000)
            .at(-1)?.[0];
          if (scheduledProbe === undefined) throw new Error("Expected a scheduled probe.");
          (scheduledProbe as () => void)();
        }
      }

      // The retained samples are [400, 200, 5000, 300, 50].
      expect(room.state.players.get(controller.client.sessionId)?.latencyMs).toBe(300);
    } finally {
      now.mockRestore();
    }
  });

  it("ignores stale, duplicate and cross-connection pongs", () => {
    const room = createRoom();
    const display = joinDisplay(room);
    const controller = joinController(room, 0);
    const displayProbe = latencyProbes(display).at(-1);
    const controllerProbe = latencyProbes(controller).at(-1);
    if (displayProbe === undefined || controllerProbe === undefined) {
      throw new Error("Expected initial latency probes.");
    }

    room.handleLatencyPong(controller.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: displayProbe.probeId
    });
    room.handleLatencyPong(display.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: "unknown-probe"
    });
    expect(room.state.displayLatencyMs).toBe(-1);
    expect(room.state.players.get(controller.client.sessionId)?.latencyMs).toBe(-1);

    room.handleLatencyPong(controller.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: controllerProbe.probeId
    });
    const accepted = room.state.players.get(controller.client.sessionId)?.latencyMs;
    room.handleLatencyPong(controller.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: controllerProbe.probeId
    });
    expect(room.state.players.get(controller.client.sessionId)?.latencyMs).toBe(accepted);
    expect(countErrors(controller, "invalid_message")).toBe(0);
  });

  it("rejects malformed, v6 and wrong-room pongs with stable actor-only errors", () => {
    const room = createRoom();
    const controller = joinController(room, 0);

    room.handleLatencyPong(controller.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: "probe",
      playerId: "spoofed"
    });
    room.handleLatencyPong(controller.client, {
      protocolVersion: 6,
      roomId: room.roomId,
      probeId: "probe"
    });
    room.handleLatencyPong(controller.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: "OTHER",
      probeId: "probe"
    });

    expect(countErrors(controller, "invalid_message")).toBe(1);
    expect(countErrors(controller, "protocol_mismatch")).toBe(1);
    expect(countErrors(controller, "identity_mismatch")).toBe(1);
  });

  it("expires a missing sample and prevents the old probe from overwriting a retry", () => {
    const room = createRoom();
    const setTimeout = vi.spyOn(room.clock, "setTimeout");
    const controller = joinController(room, 0);
    const oldProbe = latencyProbes(controller).at(-1);
    if (oldProbe === undefined) throw new Error("Expected an initial latency probe.");

    const expiry = setTimeout.mock.calls.find((call) => call[1] === 5_000)?.[0];
    if (expiry === undefined) throw new Error("Expected a probe expiry timer.");
    (expiry as () => void)();
    const nextProbe = latencyProbes(controller).at(-1);
    if (nextProbe === undefined) throw new Error("Expected a retry latency probe.");
    expect(nextProbe.probeId).not.toBe(oldProbe.probeId);
    expect(room.state.players.get(controller.client.sessionId)?.latencyMs).toBe(-1);

    room.handleLatencyPong(controller.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: oldProbe.probeId
    });
    expect(room.state.players.get(controller.client.sessionId)?.latencyMs).toBe(-1);
  });

  it("clears RTT and uses a new probe after reconnect", async () => {
    const room = createRoom();
    const controller = joinController(room, 0);
    const oldProbe = latencyProbes(controller).at(-1);
    if (oldProbe === undefined) throw new Error("Expected an initial latency probe.");
    room.handleLatencyPong(controller.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: oldProbe.probeId
    });
    expect(room.state.players.get(controller.client.sessionId)?.latencyMs).toBeGreaterThanOrEqual(
      0
    );

    vi.spyOn(room, "allowReconnection").mockResolvedValue(controller.client);
    await room.onLeave(controller.client, 1006);
    const reconnectProbe = latencyProbes(controller).at(-1);
    if (reconnectProbe === undefined) throw new Error("Expected a reconnect latency probe.");
    expect(reconnectProbe.probeId).not.toBe(oldProbe.probeId);
    expect(room.state.players.get(controller.client.sessionId)?.latencyMs).toBe(-1);

    room.handleLatencyPong(controller.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: oldProbe.probeId
    });
    expect(room.state.players.get(controller.client.sessionId)?.latencyMs).toBe(-1);
  });

  it("clears published RTT and makes every probe timer inert on room disposal", () => {
    const room = createRoom();
    const setTimeout = vi.spyOn(room.clock, "setTimeout");
    const display = joinDisplay(room);
    const controller = joinController(room, 0);
    const displayProbe = latencyProbes(display).at(-1);
    const controllerProbe = latencyProbes(controller).at(-1);
    if (displayProbe === undefined || controllerProbe === undefined) {
      throw new Error("Expected initial latency probes.");
    }
    room.handleLatencyPong(display.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: displayProbe.probeId
    });
    room.handleLatencyPong(controller.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: controllerProbe.probeId
    });
    const displaySendCount = display.send.mock.calls.length;
    const controllerSendCount = controller.send.mock.calls.length;
    const callbacks = setTimeout.mock.calls.map((call) => call[0] as () => void);

    room.onDispose();
    expect(room.state.displayLatencyMs).toBe(-1);
    expect(room.state.players.get(controller.client.sessionId)?.latencyMs).toBe(-1);
    callbacks.forEach((callback) => {
      callback();
    });
    expect(display.send).toHaveBeenCalledTimes(displaySendCount);
    expect(controller.send).toHaveBeenCalledTimes(controllerSendCount);
  });
});
