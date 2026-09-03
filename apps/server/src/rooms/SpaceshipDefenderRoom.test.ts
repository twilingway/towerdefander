import {
  CREW_ROLES,
  PLAYER_CAPACITY,
  PROTOCOL_VERSION,
  ROOM_REFUSED_FOR_MAINTENANCE,
  type CrewSize,
  roomClosingSchema,
  serverLatencyProbeSchema,
  serverErrorSchema,
  serverMessage,
  type CrewRole,
  type ServerErrorCode
} from "@spaceship-defender/protocol";
import {
  createTerminalCombatState,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState
} from "@spaceship-defender/game-core";
import { Decoder, Encoder, type StateView } from "@colyseus/schema";
import { CloseCode, type Client } from "colyseus";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createWorstCaseCombatFixture } from "../benchmarks/worstCaseCombat.js";
import { getBalanceStore } from "../balance/index.js";
import { getMaintenanceWindow } from "../maintenance/index.js";
import { SpaceshipDefenderRoom } from "./SpaceshipDefenderRoom.js";
import { SpaceshipDefenderState } from "./SpaceshipDefenderState.js";

const LEGACY_PROTOCOL_VERSION = 14;

interface TestClient {
  readonly client: Client;
  readonly send: ReturnType<typeof vi.fn>;
}

function createClient(sessionId: string): TestClient {
  const send = vi.fn();
  return { client: { sessionId, send } as unknown as Client, send };
}

/**
 * The simulation loop is a real host timer, so a room left running keeps
 * ticking its clock after the test that made it and fires lifecycle deadlines
 * into a torn-down fixture. Every room built here is therefore stopped.
 */
const openRooms: SpaceshipDefenderRoom[] = [];

afterEach(() => {
  for (const room of openRooms.splice(0)) {
    room.setSimulationInterval(undefined);
    room.clock.clear();
  }
});

function createRoom(crewSize: CrewSize = 3): SpaceshipDefenderRoom {
  const room = new SpaceshipDefenderRoom();
  room.roomId = "ROOM123";
  room.onCreate({ role: "display", protocolVersion: PROTOCOL_VERSION, crewSize });
  openRooms.push(room);
  return room;
}

function joinDisplay(room: SpaceshipDefenderRoom): TestClient {
  const display = createClient("display");
  room.onJoin(display.client, { role: "display", protocolVersion: PROTOCOL_VERSION });
  return display;
}

function joinController(room: SpaceshipDefenderRoom, index: number): TestClient {
  const controller = createClient(`player-${String(index + 1)}`);
  room.onJoin(controller.client, {
    role: "controller",
    protocolVersion: PROTOCOL_VERSION,
    playerName: `Player ${String(index + 1)}`
  });
  return controller;
}

function ready(room: SpaceshipDefenderRoom, controller: TestClient): void {
  room.handleReady(controller.client, {
    protocolVersion: PROTOCOL_VERSION,
    roomId: room.roomId,
    playerId: controller.client.sessionId,
    runNumber: room.state.runNumber
  });
}

function startGame(room = createRoom()): {
  room: SpaceshipDefenderRoom;
  controllers: TestClient[];
} {
  const controllers = Array.from({ length: PLAYER_CAPACITY }, (_, index) =>
    joinController(room, index)
  );
  controllers.forEach((controller) => {
    ready(room, controller);
  });
  return { room, controllers };
}

/** Delays of the calls that armed the loop; a stop passes no callback at all. */
/**
 * The balance the room is actually running, read rather than typed. A full
 * battery and a whole hull are events in these tests - "it starts full", "it
 * lost one point" - and typing the numbers made a retuned campaign read as a
 * broken shield.
 */
function activeBalance() {
  const config = getBalanceStore().getActiveSimulationConfig();
  return { capacity: config.shieldCapacity, maxHp: config.spaceshipMaxHp };
}

function armedLoops(spy: {
  mock: { calls: readonly (readonly unknown[])[] };
}): (number | undefined)[] {
  return spy.mock.calls
    .filter((call) => call[0] !== undefined)
    .map((call) => call[1] as number | undefined);
}

/**
 * Steps until the room says so, and reports how many ticks it took. Timings
 * that follow from balance numbers — a battery draining, a lock clearing — are
 * read as events here, so a retuned drain rate never reads as a broken shield.
 */
function advanceUntil(
  room: SpaceshipDefenderRoom,
  reached: () => boolean,
  limitTicks = 600
): number {
  for (let ticks = 1; ticks <= limitTicks; ticks += 1) {
    room.advanceGameStep();
    if (reached()) return ticks;
  }
  throw new Error(`Room never reached the expected state within ${String(limitTicks)} ticks.`);
}

/** Steps the room until the shield has served its engage window and is up. */
function raiseShield(room: SpaceshipDefenderRoom): void {
  const ticks = internals(room).gameConfig.shieldEngageTicks + 1;
  for (let index = 0; index < ticks; index += 1) room.advanceGameStep();
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

function playerByRole(
  room: SpaceshipDefenderRoom,
  role: CrewRole
): TestClient["client"] | undefined {
  const player = [...room.state.players.values()].find((candidate) => candidate.role === role);
  return player === undefined
    ? undefined
    : ({ sessionId: player.playerId, send: vi.fn() } as unknown as Client);
}

interface RoomInternals {
  gameConfig: SpaceshipSimulationConfig;
  gameState: SpaceshipSimulationState | undefined;
  upgradeJournals: Map<string, readonly unknown[]>;
  sequenceWatermarks: Map<string, Map<string, number>>;
  latency: { pendingProbe(sessionId: string): { readonly probeId: string } | undefined };
  lifecycle: {
    readonly size: number;
    has(reason: string): boolean;
    expiresAt(reason: string): number | undefined;
    set(reason: string, expiresAtMs: number): void;
  };
  lifecycleGeneration: number;
  syncMaintenance(): void;
  waveDeadlineAtMs: number | undefined;
  waveDeadlineGeneration: number;
  metadataWritePromise: Promise<void> | undefined;
  pendingMetadata: unknown;
  expireWaveDeadlineIfDue(now: number): boolean;
}

function internals(room: SpaceshipDefenderRoom): RoomInternals {
  return room as unknown as RoomInternals;
}

/** Drops one hostile bullet a stone's throw from the hull, closing head-on. */
function aimBulletAtHull(room: SpaceshipDefenderRoom): void {
  const runtime = internals(room);
  const game = runtime.gameState;
  if (game === undefined) throw new Error("Expected an active game.");
  const x = game.spaceship.x + 300;
  const y = game.spaceship.y;
  runtime.gameState = {
    ...game,
    hostileProjectiles: [
      {
        id: "bullet-test",
        spawnSequence: 1,
        spawnedTick: game.clock.tick,
        previousX: x,
        previousY: y,
        x,
        y,
        velocity: { x: -720, y: 0 },
        radius: 6,
        damage: 10,
        shieldHitCost: 10,
        lifetimeTicks: 100,
        visual: null
      }
    ]
  };
}

/**
 * Clears the field so the next step ends the wave.
 *
 * `boughtTiers` decides which tier the crew is offered, because the tree widens
 * with depth: the first tier is one card and the sixth is the first that can
 * put all three seats on screen at once.
 */
function forceIntermission(room: SpaceshipDefenderRoom, boughtTiers = 0): void {
  const runtime = internals(room);
  const game = runtime.gameState;
  if (game === undefined) throw new Error("Expected an active game.");
  const purchasedModules = runtime.gameConfig.moduleTiers
    .slice(0, boughtTiers)
    .flatMap((tier) => (tier[0] === undefined ? [] : [tier[0].id]));
  runtime.gameState = {
    ...game,
    purchasedModules,
    pendingSpawns: [],
    enemies: [],
    asteroids: [],
    hostileProjectiles: [],
    homingMissiles: [],
    projectiles: []
  };
  room.advanceGameStep();
  expect(room.state.game.encounter.phase).toBe("intermission");
}

function forceResult(room: SpaceshipDefenderRoom): void {
  const runtime = internals(room);
  const game = runtime.gameState;
  if (game === undefined) throw new Error("Expected an active game.");
  runtime.gameState = createTerminalCombatState({ ...game, spaceshipHp: 0 }, "defeat");
  room.advanceGameStep();
  expect(room.state.game.encounter).toMatchObject({ phase: "result", outcome: "defeat" });
}

function voteUpgrade(
  room: SpaceshipDefenderRoom,
  controller: TestClient,
  role: CrewRole,
  actionId: string,
  cardIndex = 0
): void {
  const upgrade = room.state.game.teamUpgrade;
  if (!upgrade.hasOffer || upgrade.offer.cards.length <= cardIndex)
    throw new Error("Expected an upgrade offer.");
  const card = upgrade.offer.cards.at(cardIndex);
  room.handleUpgradeVote(controller.client, {
    protocolVersion: PROTOCOL_VERSION,
    roomId: room.roomId,
    playerId: controller.client.sessionId,
    runNumber: room.state.runNumber,
    actionId,
    waveNumber: upgrade.offer.waveNumber,
    offerId: upgrade.offer.offerId,
    upgradeId: card.upgradeId,
    revision: cardIndex + 1
  });
  void role;
}

describe("SpaceshipDefenderRoom v15 lifecycle", () => {
  it("accepts only strict protocol v15 display create options and rejects v14 before mutation", () => {
    const room = new SpaceshipDefenderRoom();
    room.roomId = "ROOM123";
    expect(() => {
      room.onCreate({
        role: "display",
        protocolVersion: PROTOCOL_VERSION,
        crewSize: 3,
        capacity: 3
      });
    }).toThrow("invalid_message");
    const stateBeforeMismatch = {
      roomId: room.state.roomId,
      phase: room.state.phase,
      worldWidth: room.state.game.worldWidth,
      worldHeight: room.state.game.worldHeight,
      arenaRadius: room.state.game.arenaRadius
    };
    expect(() => {
      room.onCreate({ role: "display", protocolVersion: LEGACY_PROTOCOL_VERSION });
    }).toThrow("protocol_mismatch");
    expect({
      roomId: room.state.roomId,
      phase: room.state.phase,
      worldWidth: room.state.game.worldWidth,
      worldHeight: room.state.game.worldHeight,
      arenaRadius: room.state.game.arenaRadius
    }).toEqual(stateBeforeMismatch);
    expect(internals(room).lifecycle.size).toBe(0);
    expect(internals(room).pendingMetadata).toBeUndefined();
  });

  it("rejects a v12 controller join before mutating the roster", () => {
    const room = createRoom();
    const controller = createClient("legacy-controller");

    expect(() => {
      room.onJoin(controller.client, {
        role: "controller",
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        playerName: "Legacy"
      });
    }).toThrow("protocol_mismatch");
    expect(room.state.players.size).toBe(0);
    expect(internals(room).sequenceWatermarks.size).toBe(0);
  });

  it("assigns canonical roles and starts only when all three are ready", () => {
    const room = createRoom();
    const setSimulationInterval = vi.spyOn(room, "setSimulationInterval");
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
    expect(room.state.game).toMatchObject({
      worldWidth: 4400,
      worldHeight: 4400,
      arenaRadius: 2200
    });
    expect(room.state.game.spaceship).toMatchObject({ x: 2200, y: 2200, radius: 52 });
    const { capacity } = activeBalance();
    expect(room.state.game.shield).toMatchObject({ energy: capacity, capacity });
    expect(room.state.game.display.obstacles).toHaveLength(9);
    expect(room.maxMessagesPerSecond).toBe(25);
    // Stopping passes no callback, so only the armed calls count.
    expect(armedLoops(setSimulationInterval)).toEqual([10]);
  });

  it("hands the tank helm intent to the core and drops the remembered bearing", () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: room.state.runNumber
    };

    // A stick command first, so there is a bearing for the spin to drop.
    room.handlePilotInput(pilot.client, {
      ...envelope,
      sequence: 1,
      vector: { x: 0, y: 1 },
      mgFiring: false
    });
    expect(internals(room).gameState?.headingTargetAngle).not.toBeNull();

    room.handlePilotInput(pilot.client, {
      ...envelope,
      sequence: 2,
      vector: { x: 0, y: 0 },
      mgFiring: false,
      turn: -1,
      thrust: 1
    });

    expect(internals(room).gameState?.inputs.pilot).toMatchObject({ turn: -1, thrust: 1 });
    expect(internals(room).gameState?.headingTargetAngle).toBeNull();
  });

  it("spends real time in whole steps instead of one step per wake-up", () => {
    const { room } = startGame();
    const before = room.state.game.tick;

    // A host timer quantised above the step - 62.5 ms where 50 was asked for -
    // must still produce twenty steps per second, not sixteen.
    for (let index = 0; index < 16; index += 1) room.advanceElapsedTime(62.5);

    expect(room.state.game.tick - before).toBe(20);
  });

  it("drops a long stall instead of replaying it as a burst", () => {
    const { room } = startGame();
    const before = room.state.game.tick;

    room.advanceElapsedTime(2_000);

    expect(room.state.game.tick - before).toBe(4);
  });

  it("seats a solo crew on the pilot and starts on one ready", () => {
    const room = createRoom(1);
    const solo = joinController(room, 0);
    expect([...room.state.players.values()].map((player) => player.role)).toEqual(["pilot"]);

    expect(() => joinController(room, 1)).toThrow("room_full");

    ready(room, solo);
    expect(room.state.phase).toBe("active");
    expect(room.state.hasGame).toBe(true);
  });

  it("publishes the preset helm to the controller snapshot", () => {
    const { room } = startGame();

    expect(room.state.game.helm.headingLeadRadians).toBeGreaterThan(0);
    expect(room.state.game.helm.rotateInPlaceThrottle).toBeGreaterThan(0);
    expect(room.state.game.helm).toMatchObject(getBalanceStore().getActiveTuning().helm);
    // The helm predicts where a spin rests, so it needs the run's own braking.
    expect(room.state.game.helm.hullAngularBrakingPerSecondSquared).toBeCloseTo(
      getBalanceStore().getActiveSimulationConfig().headingAngularBrakingPerSecondSquared,
      6
    );
  });

  it("raises the message ceiling for the two streams a solo player owns", () => {
    expect(createRoom(1).maxMessagesPerSecond).toBe(50);
    expect(createRoom(2).maxMessagesPerSecond).toBe(25);
    expect(createRoom(3).maxMessagesPerSecond).toBe(25);
  });

  it("seats a duo on pilot and gunner and waits for both", () => {
    const room = createRoom(2);
    const pilot = joinController(room, 0);
    const gunner = joinController(room, 1);
    expect([...room.state.players.values()].map((player) => player.role)).toEqual([
      "pilot",
      "gunner"
    ]);

    expect(() => joinController(room, 2)).toThrow("room_full");

    ready(room, pilot);
    expect(room.state.phase).toBe("lobby");
    ready(room, gunner);
    expect(room.state.phase).toBe("active");
  });

  it("lets the solo pilot drive the turret and keeps the full crew separate", () => {
    const soloRoom = createRoom(1);
    const solo = joinController(soloRoom, 0);
    ready(soloRoom, solo);
    soloRoom.handleGunnerInput(solo.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: soloRoom.roomId,
      playerId: solo.client.sessionId,
      runNumber: soloRoom.state.runNumber,
      sequence: 1,
      aim: { x: 0, y: 1 },
      firing: false
    });
    soloRoom.advanceGameStep();
    expect(countErrors(solo, "role_mismatch")).toBe(0);
    expect(soloRoom.state.game.turretAngle).toBeGreaterThan(0);

    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    room.handleGunnerInput(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: room.state.runNumber,
      sequence: 1,
      aim: { x: 0, y: 1 },
      firing: false
    });
    room.advanceGameStep();
    expect(countErrors(pilot, "role_mismatch")).toBe(1);
    expect(room.state.game.turretAngle).toBe(0);
  });

  it("runs the shield itself only when no player holds that seat", () => {
    const soloRoom = createRoom(1);
    ready(soloRoom, joinController(soloRoom, 0));
    aimBulletAtHull(soloRoom);
    raiseShield(soloRoom);
    expect(soloRoom.state.game.shield.active).toBe(true);

    const { room } = startGame();
    aimBulletAtHull(room);
    room.advanceGameStep();
    expect(room.state.game.shield.active).toBe(false);
  });

  it("publishes the preset's parallax background on the display state at run start", () => {
    const room = createRoom();
    const controllers = Array.from({ length: PLAYER_CAPACITY }, (_, index) =>
      joinController(room, index)
    );
    ready(room, controllerAt(controllers, 0));
    ready(room, controllerAt(controllers, 1));
    ready(room, controllerAt(controllers, 2));

    const background = internals(room).gameConfig.background;
    expect(room.state.game.display).toMatchObject({
      backgroundParallaxStrength: background.parallaxStrength,
      backgroundDriftSpeed: background.driftSpeed,
      backgroundNebulaAlpha: background.nebulaAlpha,
      backgroundNebulaPreset: background.nebulaPreset
    });
  });

  it("keeps every decorative landmark fully inside the circular arena", () => {
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
    for (const obstacle of obstacles) {
      const extent =
        obstacle.kind === "circle"
          ? obstacle.radius
          : Math.hypot(obstacle.width / 2, obstacle.height / 2);
      expect(Math.hypot(obstacle.x - centerX, obstacle.y - centerY) + extent).toBeLessThanOrEqual(
        room.state.game.arenaRadius
      );
    }
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
      runNumber: room.state.runNumber,
      sequence: 99,
      vector: { x: 1, y: 0 },
      mgFiring: false
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
      runNumber: room.state.runNumber,
      sequence: 1,
      vector: { x: -1, y: 0 },
      mgFiring: false
    });
    room.advanceGameStep();
    expect(room.state.game.spaceship.velocityX).toBe(-32);
  });

  it("rehydrates v13 geometry through reconnect without widening StateView visibility", async () => {
    const room = createRoom();
    const display = joinDisplay(room);
    const { controllers } = startGame(room);
    room.advanceGameStep();
    const waveDeadline = internals(room).waveDeadlineAtMs;
    const pilot = controllerAt(controllers, 0);
    const reconnect = vi.spyOn(room, "allowReconnection");

    reconnect.mockResolvedValueOnce(display.client);
    await room.onLeave(display.client, 1006);
    reconnect.mockResolvedValueOnce(pilot.client);
    await room.onLeave(pilot.client, 1006);

    const displayView = display.client.view;
    const controllerView = pilot.client.view;
    if (displayView === undefined || controllerView === undefined) {
      throw new Error("Expected reconnect StateViews.");
    }
    const displayProjection = decodeForView(room.state, displayView);
    const controllerProjection = decodeForView(room.state, controllerView);
    expect(displayProjection.game).toMatchObject({
      worldWidth: 4400,
      worldHeight: 4400,
      arenaRadius: 2200
    });
    expect(controllerProjection.game).toMatchObject({
      worldWidth: 4400,
      worldHeight: 4400,
      arenaRadius: 2200
    });
    expect(internals(room).waveDeadlineAtMs).toBe(waveDeadline);
    expect(room.state.game.encounter.waveSecondsRemaining).toBeGreaterThan(0);
    expect(
      displayProjection.game.display.enemyShips.size + displayProjection.game.display.asteroids.size
    ).toBeGreaterThan(0);
    expect(controllerProjection.game.display.enemyShips.size).toBe(0);
    expect(controllerProjection.game.display.asteroids.size).toBe(0);
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
      ready: false
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

describe("SpaceshipDefenderRoom v13 authoritative inputs", () => {
  it("rejects a v10 role command without mutating its watermark or the world", () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    const initialX = room.state.game.spaceship.x;

    room.handlePilotInput(pilot.client, {
      protocolVersion: LEGACY_PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: room.state.runNumber,
      sequence: 1,
      vector: { x: 1, y: 0 }
    });

    expect(countErrors(pilot, "protocol_mismatch")).toBe(1);
    expect(internals(room).sequenceWatermarks.get(pilot.client.sessionId)?.size).toBe(0);
    room.advanceGameStep();
    expect(room.state.game.spaceship.x).toBe(initialX);
  });

  it("moves the spaceship from fresh pilot input and ignores stale sequence", () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: room.state.runNumber
    } as const;
    room.handlePilotInput(pilot.client, {
      ...envelope,
      sequence: 2,
      vector: { x: 1, y: 0 },
      mgFiring: false
    });
    room.handlePilotInput(pilot.client, {
      ...envelope,
      sequence: 1,
      vector: { x: -1, y: 0 },
      mgFiring: false
    });
    room.advanceGameStep();
    expect(room.state.game.spaceship).toMatchObject({ x: 2201.6, velocityX: 32, velocityY: 0 });
  });

  it("rejects an unsafe sequence without advancing the connection watermark", () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: room.state.runNumber
    } as const;

    room.handlePilotInput(pilot.client, {
      ...envelope,
      sequence: Number.MAX_SAFE_INTEGER + 1,
      vector: { x: -1, y: 0 },
      mgFiring: false
    });
    room.handlePilotInput(pilot.client, {
      ...envelope,
      sequence: 1,
      vector: { x: 1, y: 0 },
      mgFiring: false
    });
    room.advanceGameStep();

    expect(countErrors(pilot, "invalid_message")).toBe(1);
    expect(room.state.game.spaceship).toMatchObject({ x: 2201.6, velocityX: 32, velocityY: 0 });
  });

  it("limits held gunner fire by simulation cooldown", () => {
    const { room, controllers } = startGame();
    const gunner = controllerAt(controllers, 1);
    room.handleGunnerInput(gunner.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: gunner.client.sessionId,
      runNumber: room.state.runNumber,
      sequence: 1,
      aim: { x: 0, y: -1 },
      firing: true
    });
    room.advanceGameStep();
    room.advanceGameStep();
    expect(room.state.game.display.friendlyProjectiles).toHaveLength(1);
    expect(room.state.game.turretAngle).toBeLessThan(0);
    expect(room.state.game.turretAngle).toBeGreaterThan(-Math.PI / 2);
    const firstProjectile = [...room.state.game.display.friendlyProjectiles.values()][0];
    if (firstProjectile === undefined) throw new Error("Expected a friendly projectile.");
    expect(Math.atan2(firstProjectile.velocityY, firstProjectile.velocityX)).toBeCloseTo(
      (-13 * Math.PI) / 6000
    );
    for (let index = 0; index < 2; index += 1) room.advanceGameStep();
    room.handleGunnerInput(gunner.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: gunner.client.sessionId,
      runNumber: room.state.runNumber,
      sequence: 2,
      aim: { x: 0, y: -1 },
      firing: true
    });
    for (let index = 0; index < 2; index += 1) room.advanceGameStep();
    expect(room.state.game.display.friendlyProjectiles).toHaveLength(2);
  });

  it("aims and activates the shield", () => {
    const { room, controllers } = startGame();
    const shield = controllerAt(controllers, 2);
    room.handleShieldInput(shield.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: shield.client.sessionId,
      runNumber: room.state.runNumber,
      sequence: 1,
      aim: { x: -1, y: 0 },
      active: true
    });
    raiseShield(room);
    expect(room.state.game.shield.active).toBe(true);
    expect(room.state.game.shield.energy).toBe(activeBalance().capacity - 1);
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
      runNumber: room.state.runNumber,
      sequence: 1,
      aim: { x: 0, y: -1 },
      active: false
    });

    room.advanceGameStep();
    const firstAngle = room.state.game.shield.angle;
    expect(room.state.game.shield).toMatchObject({
      active: false,
      energy: activeBalance().capacity
    });
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
      playerId: gunner.client.sessionId,
      runNumber: room.state.runNumber
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
      runNumber: room.state.runNumber,
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
      playerId: gunner.client.sessionId,
      runNumber: room.state.runNumber
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
      runNumber: room.state.runNumber,
      sequence: 1,
      aim: { x: 1, y: 0 },
      active: true
    } as const;
    room.handleShieldInput(shield.client, input);
    room.handleShieldInput(shield.client, input);
    expect(room.state.game.shield.energy).toBe(activeBalance().capacity);
    // Coming up spends nothing; the drain starts with the hold.
    raiseShield(room);
    expect(room.state.game.shield.energy).toBe(activeBalance().capacity - 1);
    room.advanceGameStep();
    expect(room.state.game.shield.energy).toBe(activeBalance().capacity - 2);
  });

  it("publishes depletion and re-arms itself once the battery is back", () => {
    const { room, controllers } = startGame();
    const shield = controllerAt(controllers, 2);
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: shield.client.sessionId,
      runNumber: room.state.runNumber
    } as const;
    room.handleShieldInput(shield.client, {
      ...envelope,
      sequence: 1,
      aim: { x: 1, y: 0 },
      active: true
    });
    // Stepped to the event, not to a round number of ticks: how long the
    // battery lasts is a balance number, and counting ticks here is what made
    // this test read a half-charged battery as a broken shield.
    const ticksToDepletion = advanceUntil(room, () => room.state.game.shield.rearmRequired);
    expect(ticksToDepletion).toBeGreaterThan(0);
    expect(room.state.game.shield).toMatchObject({
      active: false,
      energy: 0,
      capacity: activeBalance().capacity
    });

    // The button is never released and never pressed again: the old rule left
    // an operator holding a shield that refused for ever with nothing on the
    // panel saying why. The lock now clears on the re-arm mark by itself.
    const ticksToRearm = advanceUntil(room, () => !room.state.game.shield.rearmRequired);
    expect(ticksToRearm).toBeGreaterThan(0);
    expect(room.state.game.shield.energy).toBeGreaterThanOrEqual(25);
    // The engage window follows the mark, and the hold nobody released raises
    // the shield without a new command.
    const ticksToActive = advanceUntil(room, () => room.state.game.shield.active);
    expect(ticksToActive).toBeGreaterThan(0);
  });

  it("clears a queued gunner click on disconnect and reconnect", async () => {
    const { room, controllers } = startGame();
    const gunner = controllerAt(controllers, 1);
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: gunner.client.sessionId,
      runNumber: room.state.runNumber
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
    expect(room.state.game.display.friendlyProjectiles).toHaveLength(0);
  });

  it("rejects malformed, wrong-role, spoofed and lobby inputs without mutation", () => {
    const lobby = createRoom();
    const lobbyPilot = joinController(lobby, 0);
    lobby.handlePilotInput(lobbyPilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: lobby.roomId,
      playerId: lobbyPilot.client.sessionId,
      runNumber: lobby.state.runNumber,
      sequence: 1,
      vector: { x: 1, y: 0 }
    });
    expect(countErrors(lobbyPilot, "invalid_message")).toBe(1);

    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    room.handleGunnerInput(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: room.state.runNumber,
      sequence: 1,
      aim: { x: 1, y: 0 },
      firing: true
    });
    expect(countErrors(pilot, "role_mismatch")).toBe(1);
    room.handlePilotInput(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: "someone-else",
      runNumber: room.state.runNumber,
      sequence: 1,
      vector: { x: 1, y: 0 },
      mgFiring: false
    });
    expect(countErrors(pilot, "identity_mismatch")).toBe(1);
    room.handlePilotInput(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: room.state.runNumber,
      sequence: 1,
      vector: { x: 1, y: 0 },
      mgFiring: false,
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
      runNumber: room.state.runNumber,
      sequence: 1,
      aim: { x: 1, y: 0 },
      active: true
    });
    raiseShield(room);
    expect(room.state.game.shield.active).toBe(true);
    vi.spyOn(room, "allowReconnection").mockResolvedValue(shield.client);
    await room.onLeave(shield.client, 1006);
    expect(room.state.game.shield.active).toBe(false);
    expect(room.state.game.shield.energy).toBe(activeBalance().capacity - 1);
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

describe("SpaceshipDefenderRoom v15 combat projection and upgrades", () => {
  it("keeps the explicit run seed private and publishes the combat summary", () => {
    const { room } = startGame();

    expect("runSeed" in room.state.game).toBe(false);
    expect(room.state.game.spaceship).toMatchObject({
      hp: activeBalance().maxHp,
      maxHp: activeBalance().maxHp
    });
    expect(room.state.game.shield.arcHalfAngle).toBeCloseTo(Math.PI / 4);
    expect(room.state.game.encounter).toMatchObject({
      phase: "combat",
      waveNumber: 1,
      encounterTick: 0,
      phaseTicksRemaining: 0,
      waveSecondsRemaining: 300,
      score: 0
    });
  });

  it("resets the five-minute deadline only when the next combat wave starts", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      const { room } = startGame();
      const runtime = internals(room);
      expect(runtime.waveDeadlineAtMs).toBe(310_000);

      now.mockReturnValue(20_000);
      room.advanceGameStep();
      expect(runtime.waveDeadlineAtMs).toBe(310_000);
      expect(room.state.game.encounter.waveSecondsRemaining).toBe(290);

      forceIntermission(room);
      expect(runtime.waveDeadlineAtMs).toBeUndefined();
      expect(room.state.game.encounter.waveSecondsRemaining).toBe(0);
      for (let step = 0; step < runtime.gameConfig.intermissionTicks; step += 1) {
        room.advanceGameStep();
      }
      expect(room.state.game.encounter).toMatchObject({
        phase: "combat",
        waveNumber: 2,
        waveSecondsRemaining: 300
      });
      expect(runtime.waveDeadlineAtMs).toBe(320_000);
    } finally {
      now.mockRestore();
    }
  });

  it("turns an uncleared expired wave into a frozen timeout result with living hull", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      const { room } = startGame();
      const runtime = internals(room);
      const deadline = runtime.waveDeadlineAtMs;
      if (deadline === undefined) throw new Error("Expected a wave deadline.");
      now.mockReturnValue(deadline);

      const frozenTick = room.state.game.tick;
      room.advanceGameStep();
      expect(room.state.game.spaceship.hp).toBe(activeBalance().maxHp);
      expect(room.state.game.encounter).toMatchObject({
        phase: "result",
        outcome: "defeat",
        hasDefeatReason: true,
        defeatReason: "wave_timeout",
        waveSecondsRemaining: 0
      });
      expect(runtime.lifecycle.expiresAt("result_expired")).toBe(deadline + 600_000);
      expect(room.state.game.tick).toBe(frozenTick);
      room.advanceGameStep();
      expect(room.state.game.tick).toBe(frozenTick);
    } finally {
      now.mockRestore();
    }
  });

  it("rehydrates a frozen timeout result and keeps an existing rematch vote", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      const { room, controllers } = startGame();
      const runtime = internals(room);
      const game = runtime.gameState;
      const deadline = runtime.waveDeadlineAtMs;
      if (game === undefined || deadline === undefined) {
        throw new Error("Expected an active wave deadline.");
      }
      runtime.gameState = { ...game, score: 777 };
      now.mockReturnValue(deadline);
      room.advanceGameStep();

      const pilot = controllerAt(controllers, 0);
      ready(room, pilot);
      vi.spyOn(room, "allowReconnection").mockResolvedValueOnce(pilot.client);
      await room.onLeave(pilot.client, 1006);

      if (pilot.client.view === undefined) throw new Error("Expected a reconnect StateView.");
      expect(room.state.game.encounter).toMatchObject({
        phase: "result",
        outcome: "defeat",
        hasDefeatReason: true,
        defeatReason: "wave_timeout",
        score: 777,
        waveSecondsRemaining: 0
      });
      expect(room.state.players.get(pilot.client.sessionId)?.ready).toBe(true);
      expect(runtime.lifecycle.expiresAt("result_expired")).toBe(deadline + 600_000);
    } finally {
      now.mockRestore();
    }
  });

  it("accepts a wave-clearing step that starts immediately before the deadline", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      const { room } = startGame();
      const runtime = internals(room);
      const deadline = runtime.waveDeadlineAtMs;
      const game = runtime.gameState;
      if (deadline === undefined || game === undefined) {
        throw new Error("Expected an active wave deadline.");
      }
      runtime.gameState = {
        ...game,
        pendingSpawns: [],
        enemies: [],
        asteroids: [],
        hostileProjectiles: [],
        homingMissiles: [],
        projectiles: []
      };
      now.mockReturnValue(deadline - 1);

      room.advanceGameStep();

      expect(room.state.game.encounter.phase).toBe("intermission");
      expect(runtime.waveDeadlineAtMs).toBeUndefined();
    } finally {
      now.mockRestore();
    }
  });

  it("gives rematch wave one a fresh deadline without extending the room hard cap", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      const { room, controllers } = startGame();
      const runtime = internals(room);
      const hardCap = runtime.lifecycle.expiresAt("room_lifetime_expired");
      const firstDeadline = runtime.waveDeadlineAtMs;
      if (firstDeadline === undefined) throw new Error("Expected a wave deadline.");
      now.mockReturnValue(firstDeadline);
      runtime.expireWaveDeadlineIfDue(firstDeadline);

      now.mockReturnValue(firstDeadline + 1_000);
      controllers.forEach((controller) => {
        ready(room, controller);
      });
      expect(room.state.runNumber).toBe(2);
      expect(runtime.waveDeadlineAtMs).toBe(firstDeadline + 1_000 + 300_000);
      expect(runtime.lifecycle.expiresAt("room_lifetime_expired")).toBe(hardCap);
    } finally {
      now.mockRestore();
    }
  });

  it("ignores a stale wave timer after combat has entered intermission", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      const room = createRoom();
      const setTimeout = vi.spyOn(room.clock, "setTimeout");
      startGame(room);
      const staleCallback = setTimeout.mock.calls.find((call) => call[1] === 300_000)?.[0] as
        (() => void) | undefined;
      if (staleCallback === undefined) throw new Error("Expected a wave deadline callback.");

      forceIntermission(room);
      const generation = internals(room).waveDeadlineGeneration;
      now.mockReturnValue(310_000);
      staleCallback();
      expect(internals(room).waveDeadlineGeneration).toBe(generation);
      expect(room.state.game.encounter.phase).toBe("intermission");
    } finally {
      now.mockRestore();
    }
  });

  it("publishes circular geometry to both views while keeping mass entities display-only", () => {
    const room = createRoom();
    const display = joinDisplay(room);
    const { controllers } = startGame(room);
    room.advanceGameStep();
    const authoritativeEntityCount =
      room.state.game.display.enemyShips.size + room.state.game.display.asteroids.size;
    expect(authoritativeEntityCount).toBeGreaterThan(0);

    const displayView = display.client.view;
    const controllerView = controllerAt(controllers, 0).client.view;
    if (displayView === undefined || controllerView === undefined) {
      throw new Error("Expected display and controller StateViews.");
    }
    const displayProjection = decodeForView(room.state, displayView);
    const controllerProjection = decodeForView(room.state, controllerView);

    for (const projection of [displayProjection, controllerProjection]) {
      expect(projection.game).toMatchObject({
        worldWidth: 4400,
        worldHeight: 4400,
        arenaRadius: 2200
      });
    }
    expect(
      displayProjection.game.display.enemyShips.size + displayProjection.game.display.asteroids.size
    ).toBe(authoritativeEntityCount);
    expect(controllerProjection.game.display.enemyShips.size).toBe(0);
    expect(controllerProjection.game.display.asteroids.size).toBe(0);
  });

  it("reconciles mass entities by stable ID without recreating unchanged schema objects", () => {
    const { room } = startGame();
    room.advanceGameStep();
    const first =
      [...room.state.game.display.enemyShips.values()][0] ??
      [...room.state.game.display.asteroids.values()][0];
    if (first === undefined) throw new Error("Expected the first scheduled spawn.");
    const entityId = first.entityId;

    room.advanceGameStep();
    const retained =
      room.state.game.display.enemyShips.get(entityId) ??
      room.state.game.display.asteroids.get(entityId);
    expect(retained).toBe(first);
    expect(
      room.state.game.display.enemyShips.size + room.state.game.display.asteroids.size
    ).toBeLessThanOrEqual(56);
  });

  it("never projects either enemy ship kind outside its legal circular boundary", () => {
    const { room } = startGame();
    const runtime = internals(room);
    const fixture = createWorstCaseCombatFixture(runtime.gameConfig);
    runtime.gameState = {
      ...fixture,
      asteroids: [],
      hostileProjectiles: [],
      homingMissiles: [],
      projectiles: []
    };
    const kinds = new Set<string>();

    for (let tick = 0; tick < 80; tick += 1) {
      room.advanceGameStep();
      for (const enemy of room.state.game.display.enemyShips.values()) {
        kinds.add(enemy.kind);
        expect(
          Math.hypot(
            enemy.x - room.state.game.worldWidth / 2,
            enemy.y - room.state.game.worldHeight / 2
          ) + enemy.radius
        ).toBeLessThanOrEqual(room.state.game.arenaRadius + 1e-6);
      }
    }

    expect(kinds).toEqual(new Set(["gunship", "missileCarrier"]));
  });

  it("publishes one shared team upgrade to display and every controller", () => {
    const room = createRoom();
    const display = joinDisplay(room);
    const { controllers } = startGame(room);
    forceIntermission(room, 5);

    const upgrade = room.state.game.teamUpgrade;
    expect(upgrade.hasOffer).toBe(true);
    expect(upgrade.offer).toMatchObject({ waveNumber: 1, tier: 6 });
    // A tier of three owes all three seats, but not in any fixed slot order.
    expect(new Set([...upgrade.offer.cards].map(({ role }) => role))).toEqual(new Set(CREW_ROLES));
    expect(upgrade.offer.cards).toHaveLength(3);
    for (const card of upgrade.offer.cards) expect(card.effects.length).toBeGreaterThan(0);
    expect(display.client.view?.has(room.state.game)).toBe(true);
    for (const controller of controllers) expect(controller.client.view).toBeDefined();
    expect(room.state.game.display.enemyShips).toHaveLength(0);
    expect(room.state.game.display.asteroids).toHaveLength(0);
  });

  it("accepts a vote exactly once and detects an action ID collision", () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    forceIntermission(room, 5);
    const actionId = "11111111-1111-4111-8111-111111111111";
    // The five modules the helper pre-bought to widen the tier; a vote must not
    // add a sixth before the deadline.
    const purchased = [...room.state.game.display.purchasedModules];

    voteUpgrade(room, pilot, "pilot", actionId);
    expect([...room.state.game.display.purchasedModules]).toEqual(purchased);
    expect(room.state.game.teamUpgrade.votes.get("pilot")).toMatchObject({ revision: 1 });

    voteUpgrade(room, pilot, "pilot", actionId);
    expect([...room.state.game.display.purchasedModules]).toEqual(purchased);
    expect(countErrors(pilot, "stale_action")).toBe(0);

    voteUpgrade(room, pilot, "pilot", actionId, 1);
    expect(countErrors(pilot, "action_conflict")).toBe(1);
    expect([...room.state.game.display.purchasedModules]).toEqual(purchased);
  });

  it("rejects a legacy upgrade vote before journal or world mutation", () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    forceIntermission(room);
    const upgrade = room.state.game.teamUpgrade;
    if (!upgrade.hasOffer || upgrade.offer.cards.length === 0)
      throw new Error("Expected pilot offer.");
    const card = upgrade.offer.cards.at(0);
    const gameBefore = internals(room).gameState;
    const purchasedBefore = [...room.state.game.display.purchasedModules];

    room.handleUpgradeVote(pilot.client, {
      protocolVersion: LEGACY_PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: room.state.runNumber,
      actionId: "10101010-1010-4010-8010-101010101010",
      waveNumber: upgrade.offer.waveNumber,
      offerId: upgrade.offer.offerId,
      upgradeId: card.upgradeId,
      revision: 1
    });

    expect(countErrors(pilot, "protocol_mismatch")).toBe(1);
    expect(internals(room).upgradeJournals.has(pilot.client.sessionId)).toBe(false);
    expect(internals(room).gameState).toBe(gameBefore);
    expect([...room.state.game.display.purchasedModules]).toEqual(purchasedBefore);
    expect(room.state.game.teamUpgrade.votes.get("pilot")).toBeUndefined();
  });

  it("replays business errors and bounds each identity journal to 32 entries", () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    forceIntermission(room);
    const upgrade = room.state.game.teamUpgrade;
    if (!upgrade.hasOffer || upgrade.offer.cards.length === 0)
      throw new Error("Expected pilot offer.");
    const card = upgrade.offer.cards.at(0);

    for (let index = 0; index < 35; index += 1) {
      room.handleUpgradeVote(pilot.client, {
        protocolVersion: PROTOCOL_VERSION,
        roomId: room.roomId,
        playerId: pilot.client.sessionId,
        runNumber: room.state.runNumber,
        actionId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        waveNumber: 999,
        offerId: upgrade.offer.offerId,
        upgradeId: card.upgradeId,
        revision: index + 1
      });
    }

    expect(countErrors(pilot, "action_not_available")).toBe(35);
    expect(internals(room).upgradeJournals.get(pilot.client.sessionId)).toHaveLength(32);
    const newest = `00000000-0000-4000-8000-${String(34).padStart(12, "0")}`;
    room.handleUpgradeVote(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: room.state.runNumber,
      actionId: newest,
      waveNumber: 999,
      offerId: upgrade.offer.offerId,
      upgradeId: card.upgradeId,
      revision: 35
    });
    expect(countErrors(pilot, "action_not_available")).toBe(36);
    expect(internals(room).upgradeJournals.get(pilot.client.sessionId)).toHaveLength(32);
  });

  it("allows a role to vote for another role card without applying it early", () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    forceIntermission(room, 5);
    const upgrade = room.state.game.teamUpgrade;
    if (!upgrade.hasOffer || upgrade.offer.cards.length < 2)
      throw new Error("Expected gunner card.");
    const card = upgrade.offer.cards.at(1);

    room.handleUpgradeVote(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: room.state.runNumber,
      actionId: "22222222-2222-4222-8222-222222222222",
      waveNumber: upgrade.offer.waveNumber,
      offerId: upgrade.offer.offerId,
      upgradeId: card.upgradeId,
      revision: 1
    });

    expect(countErrors(pilot, "role_mismatch")).toBe(0);
    expect(room.state.game.teamUpgrade.votes.get("pilot")?.upgradeId).toBe(card.upgradeId);
    // Nothing is bought before the deadline; the five are what widened the tier.
    expect(room.state.game.display.purchasedModules).toHaveLength(5);
  });

  it("keeps an accepted journal across reconnect and ship stats across replacement", async () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    forceIntermission(room, 5);
    const actionId = "33333333-3333-4333-8333-333333333333";
    voteUpgrade(room, pilot, "pilot", actionId);
    const shipBefore = { ...internals(room).gameState?.ship };

    const allowReconnection = vi.spyOn(room, "allowReconnection").mockResolvedValue(pilot.client);
    await room.onLeave(pilot.client, 1006);
    voteUpgrade(room, pilot, "pilot", actionId);
    expect({ ...internals(room).gameState?.ship }).toEqual(shipBefore);

    const gunner = controllerAt(controllers, 1);
    voteUpgrade(room, gunner, "gunner", "44444444-4444-4444-8444-444444444444", 1);
    allowReconnection.mockRejectedValueOnce(new Error("expired"));
    await room.onLeave(gunner.client, 1006);
    const replacement = joinController(room, 9);
    expect(room.state.players.get(replacement.client.sessionId)?.role).toBe("gunner");
    expect(room.state.game.teamUpgrade.votes.get("gunner")).toBeDefined();
    voteUpgrade(room, replacement, "gunner", "55555555-5555-4555-8555-555555555555", 2);
    expect(countErrors(replacement, "stale_action")).toBe(0);
  });

  it("neutralizes intermission without consuming rejected input sequence", () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: room.state.runNumber
    } as const;
    room.handlePilotInput(pilot.client, {
      ...envelope,
      sequence: 1,
      vector: { x: 1, y: 0 },
      mgFiring: false
    });
    forceIntermission(room);
    expect(internals(room).gameState?.inputs.pilot?.vector).toEqual({ x: 0, y: 0 });

    room.handlePilotInput(pilot.client, {
      ...envelope,
      sequence: 99,
      vector: { x: 1, y: 0 },
      mgFiring: false
    });
    expect(countErrors(pilot, "invalid_phase")).toBe(1);
    for (let index = 0; index < internals(room).gameConfig.intermissionTicks; index += 1)
      room.advanceGameStep();
    expect(room.state.game.encounter).toMatchObject({ phase: "combat", waveNumber: 2 });
    room.handlePilotInput(pilot.client, {
      ...envelope,
      sequence: 2,
      vector: { x: -1, y: 0 },
      mgFiring: false
    });
    expect(internals(room).gameState?.inputs.pilot?.vector).toEqual({ x: -1, y: 0 });
  });

  it("keeps result identities reconnectable and admits a replacement after expiry", async () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    forceResult(room);

    const allowReconnection = vi
      .spyOn(room, "allowReconnection")
      .mockResolvedValueOnce(pilot.client);
    await room.onLeave(pilot.client, 1006);
    expect(room.state.players.get(pilot.client.sessionId)?.connected).toBe(true);

    const gunner = controllerAt(controllers, 1);
    allowReconnection.mockRejectedValueOnce(new Error("expired"));
    await room.onLeave(gunner.client, 1006);
    const replacement = joinController(room, 9);
    expect(room.state.players.get(replacement.client.sessionId)).toMatchObject({
      role: "gunner",
      ready: false
    });
  });
});

describe("SpaceshipDefenderRoom v15 rematch isolation", () => {
  it("rejects stale ready, input and upgrade before per-run mutation", () => {
    const { room, controllers } = startGame();
    const pilot = controllerAt(controllers, 0);
    const oldRunNumber = room.state.runNumber;
    forceResult(room);
    controllers.forEach((controller) => {
      ready(room, controller);
    });
    expect(room.state.runNumber).toBe(oldRunNumber + 1);

    const runtime = internals(room);
    const spaceshipX = room.state.game.spaceship.x;
    room.handlePilotInput(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: oldRunNumber,
      sequence: 999,
      vector: { x: 1, y: 0 },
      mgFiring: false
    });
    room.handleUpgradeVote(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: oldRunNumber,
      actionId: "99999999-9999-4999-8999-999999999999",
      waveNumber: 1,
      offerId: "old-offer",
      upgradeId: "afterburner",
      revision: 1
    });
    room.handleReady(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: oldRunNumber
    });

    expect(countErrors(pilot, "stale_run")).toBe(3);
    expect(runtime.sequenceWatermarks.get(pilot.client.sessionId)?.size).toBe(0);
    expect(runtime.upgradeJournals.get(pilot.client.sessionId)).toBeUndefined();
    expect(room.state.players.get(pilot.client.sessionId)?.ready).toBe(false);
    room.advanceGameStep();
    expect(room.state.game.spaceship.x).toBe(spaceshipX);
  });

  it("waits for three connected ready roles and treats duplicate ready idempotently", () => {
    const { room, controllers } = startGame();
    forceResult(room);
    const firstRun = room.state.runNumber;
    const pilot = controllerAt(controllers, 0);
    const gunner = controllerAt(controllers, 1);
    const shield = controllerAt(controllers, 2);

    ready(room, pilot);
    ready(room, pilot);
    ready(room, gunner);
    expect(room.state.runNumber).toBe(firstRun);
    const shieldState = room.state.players.get(shield.client.sessionId);
    if (shieldState === undefined) throw new Error("Expected shield roster entry.");
    shieldState.connected = false;
    ready(room, shield);
    expect(room.state.runNumber).toBe(firstRun);

    shieldState.connected = true;
    ready(room, shield);
    expect(room.state.runNumber).toBe(firstRun + 1);
  });

  it("starts one clean run while preserving identities and roles", () => {
    const { room, controllers } = startGame();
    const setSimulationInterval = vi.spyOn(room, "setSimulationInterval");
    const pilot = controllerAt(controllers, 0);
    room.handlePilotInput(pilot.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: pilot.client.sessionId,
      runNumber: room.state.runNumber,
      sequence: 7,
      vector: { x: 1, y: 0 },
      mgFiring: false
    });
    forceIntermission(room);
    voteUpgrade(room, pilot, "pilot", "77777777-7777-4777-8777-777777777777");
    const previousSeed = internals(room).gameState?.runSeed;
    const roster = [...room.state.players.values()].map(({ playerId, playerName, role }) => ({
      playerId,
      playerName,
      role
    }));
    forceResult(room);

    controllers.forEach((controller) => {
      ready(room, controller);
    });

    const next = internals(room).gameState;
    expect(room.state.runNumber).toBe(2);
    expect(next?.runSeed).not.toBe(previousSeed);
    expect(
      [...room.state.players.values()].map(({ playerId, playerName, role }) => ({
        playerId,
        playerName,
        role
      }))
    ).toEqual(roster);
    expect([...room.state.players.values()].every(({ ready }) => !ready)).toBe(true);
    expect(room.state.game).toMatchObject({ tick: 0, elapsedMs: 0 });
    expect(room.state.game.spaceship).toMatchObject({
      hp: activeBalance().maxHp,
      maxHp: activeBalance().maxHp
    });
    expect(room.state.game.encounter).toMatchObject({
      phase: "combat",
      hasOutcome: false,
      outcome: "defeat",
      waveNumber: 1,
      score: 0
    });
    expect(room.state.game.display.enemyShips).toHaveLength(0);
    expect(room.state.game.display.asteroids).toHaveLength(0);
    expect(room.state.game.teamUpgrade.hasOffer).toBe(false);
    expect(room.state.game.teamUpgrade.votes).toHaveLength(0);
    expect(internals(room).sequenceWatermarks.get(pilot.client.sessionId)?.size).toBe(0);
    expect(internals(room).upgradeJournals.size).toBe(0);
    // The rematch arms the loop exactly once, whatever it stopped on the way.
    expect(armedLoops(setSimulationInterval)).toEqual([10]);
  });

  it("preserves terminal readiness over reconnect and starts after the crew returns", async () => {
    const { room, controllers } = startGame();
    forceResult(room);
    const pilot = controllerAt(controllers, 0);
    ready(room, pilot);
    vi.spyOn(room, "allowReconnection").mockResolvedValueOnce(pilot.client);
    await room.onLeave(pilot.client, 1006);
    expect(room.state.players.get(pilot.client.sessionId)).toMatchObject({
      connected: true,
      ready: true
    });
    ready(room, controllerAt(controllers, 1));
    ready(room, controllerAt(controllers, 2));
    expect(room.state.runNumber).toBe(2);
  });
});

describe("SpaceshipDefenderRoom v15 disposal and operations metadata", () => {
  it("closes the whole room only when the display leaves explicitly", async () => {
    const room = createRoom();
    const display = joinDisplay(room);
    joinController(room, 0);
    const broadcast = vi.spyOn(room, "broadcast");
    const disconnect = vi.spyOn(room, "disconnect").mockResolvedValue(undefined);

    await room.onLeave(display.client, CloseCode.CONSENTED);

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith(serverMessage.roomClosing, {
      reason: "display_left"
    });
    expect(roomClosingSchema.safeParse(broadcast.mock.calls.at(-1)?.[1]).success).toBe(true);
  });

  it("keeps a transport-loss display reconnectable without disposing the room", async () => {
    const room = createRoom();
    const display = joinDisplay(room);
    vi.spyOn(room, "allowReconnection").mockResolvedValue(display.client);
    const disconnect = vi.spyOn(room, "disconnect").mockResolvedValue(undefined);

    await room.onLeave(display.client, 1006);

    expect(disconnect).not.toHaveBeenCalled();
    expect(room.state.displayConnected).toBe(true);
    expect(internals(room).lifecycle.has("display_reconnect_expired")).toBe(false);
  });

  it("arms fixed lobby, result, zero-controller, display and absolute deadlines", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      const room = createRoom();
      const runtime = internals(room);
      expect(runtime.lifecycle.expiresAt("lobby_expired")).toBe(910_000);
      expect(runtime.lifecycle.expiresAt("room_lifetime_expired")).toBe(43_210_000);
      expect(runtime.lifecycle.has("controllers_expired")).toBe(false);

      const controller = joinController(room, 0);
      await room.onLeave(controller.client, CloseCode.CONSENTED);
      expect(runtime.lifecycle.expiresAt("controllers_expired")).toBe(310_000);

      const active = startGame().room;
      forceResult(active);
      expect(internals(active).lifecycle.expiresAt("result_expired")).toBe(610_000);

      const withDisplay = createRoom();
      const display = joinDisplay(withDisplay);
      let rejectReconnect: ((reason: Error) => void) | undefined;
      vi.spyOn(withDisplay, "allowReconnection").mockImplementation(
        () =>
          new Promise<Client>((_resolve, reject) => {
            rejectReconnect = reject;
          }) as never
      );
      vi.spyOn(withDisplay, "disconnect").mockResolvedValue(undefined);
      const leave = withDisplay.onLeave(display.client, 1006);
      expect(internals(withDisplay).lifecycle.expiresAt("display_reconnect_expired")).toBe(40_000);
      rejectReconnect?.(new Error("expired"));
      await leave;
    } finally {
      now.mockRestore();
    }
  });

  it.each([
    "display_reconnect_expired",
    "lobby_expired",
    "result_expired",
    "controllers_expired",
    "room_lifetime_expired"
  ] as const)("disposes once when the %s deadline expires", async (reason) => {
    const now = vi.spyOn(Date, "now").mockReturnValue(30_000);
    try {
      const room = new SpaceshipDefenderRoom();
      room.roomId = "ROOM123";
      const setTimeout = vi.spyOn(room.clock, "setTimeout");
      const disconnect = vi.spyOn(room, "disconnect").mockResolvedValue(undefined);
      const broadcast = vi.spyOn(room, "broadcast");
      room.onCreate({ role: "display", protocolVersion: PROTOCOL_VERSION, crewSize: 3 });
      internals(room).lifecycle.set(reason, 30_010);
      const callback = setTimeout.mock.calls.at(-1)?.[0] as (() => void) | undefined;
      if (callback === undefined) throw new Error("Expected lifecycle callback.");

      now.mockReturnValue(30_011);
      callback();
      await vi.waitFor(() => {
        expect(disconnect).toHaveBeenCalledTimes(1);
      });

      expect(broadcast).toHaveBeenCalledWith(serverMessage.roomClosing, { reason });
    } finally {
      now.mockRestore();
    }
  });

  it("ignores stale timer generations and uses stable earliest-deadline priority", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(20_000);
    try {
      const room = new SpaceshipDefenderRoom();
      room.roomId = "ROOM123";
      const setTimeout = vi.spyOn(room.clock, "setTimeout");
      room.onCreate({ role: "display", protocolVersion: PROTOCOL_VERSION, crewSize: 3 });
      const staleCallback = setTimeout.mock.calls.at(-1)?.[0] as (() => void) | undefined;
      const runtime = internals(room);
      runtime.lifecycle.set("result_expired", 20_100);
      runtime.lifecycle.set("room_lifetime_expired", 20_100);
      const currentCallback = setTimeout.mock.calls.at(-1)?.[0] as (() => void) | undefined;
      if (staleCallback === undefined || currentCallback === undefined) {
        throw new Error("Expected lifecycle callbacks.");
      }
      const disconnect = vi.spyOn(room, "disconnect").mockResolvedValue(undefined);
      const broadcast = vi.spyOn(room, "broadcast");

      now.mockReturnValue(20_101);
      staleCallback();
      expect(disconnect).not.toHaveBeenCalled();
      currentCallback();
      await vi.waitFor(() => {
        expect(disconnect).toHaveBeenCalledTimes(1);
      });
      expect(broadcast).toHaveBeenCalledWith(serverMessage.roomClosing, {
        reason: "room_lifetime_expired"
      });
    } finally {
      now.mockRestore();
    }
  });

  it("publishes only anonymous compact metadata and coalesces ordered writes", async () => {
    let releaseFirstWrite: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const room = new SpaceshipDefenderRoom();
    room.roomId = "SECRET-ROOM-CODE";
    const setMetadata = vi
      .spyOn(room, "setMetadata")
      .mockImplementationOnce(() => firstWrite)
      .mockResolvedValue(undefined);
    room.onCreate({ role: "display", protocolVersion: PROTOCOL_VERSION, crewSize: 3 });
    joinDisplay(room);
    joinController(room, 0);
    joinController(room, 1);
    expect(setMetadata).toHaveBeenCalledTimes(1);

    releaseFirstWrite?.();
    await vi.waitFor(() => {
      expect(setMetadata).toHaveBeenCalledTimes(2);
    });
    const metadata = setMetadata.mock.calls.at(-1)?.[0];
    expect(metadata).toMatchObject({
      status: "lobby",
      connectedPlayers: 2,
      reservedPlayers: 0,
      capacity: 3,
      displayConnected: true
    });
    expect(Object.keys(metadata ?? {}).sort()).toEqual([
      "capacity",
      "connectedPlayers",
      "createdAtMs",
      "displayConnected",
      "expiresAtMs",
      "reservedPlayers",
      "statsId",
      "status",
      "statusChangedAtMs"
    ]);
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain("SECRET-ROOM-CODE");
    expect(serialized).not.toContain("Player 1");
    expect(serialized).not.toContain("player-1");
  });

  it("isolates metadata write failures from gameplay", async () => {
    const room = new SpaceshipDefenderRoom();
    room.roomId = "ROOM123";
    vi.spyOn(room, "setMetadata").mockImplementation(() => {
      throw new Error("driver unavailable");
    });
    room.onCreate({ role: "display", protocolVersion: PROTOCOL_VERSION, crewSize: 3 });
    const controllers = Array.from({ length: PLAYER_CAPACITY }, (_, index) =>
      joinController(room, index)
    );
    controllers.forEach((controller) => {
      ready(room, controller);
    });
    await vi.waitFor(() => {
      expect(internals(room).metadataWritePromise).toBeUndefined();
    });
    expect(room.state.phase).toBe("active");
    expect(room.state.runNumber).toBe(1);
  });
});

describe("SpaceshipDefenderRoom v13 latency telemetry", () => {
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

  it("rejects malformed, v10 and wrong-room pongs with stable actor-only errors and no mutation", () => {
    const room = createRoom();
    const controller = joinController(room, 0);
    const probeBefore = internals(room).latency.pendingProbe(controller.client.sessionId);

    room.handleLatencyPong(controller.client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: "probe",
      playerId: "spoofed"
    });
    room.handleLatencyPong(controller.client, {
      protocolVersion: LEGACY_PROTOCOL_VERSION,
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
    expect(room.state.players.get(controller.client.sessionId)?.latencyMs).toBe(-1);
    expect(internals(room).latency.pendingProbe(controller.client.sessionId)?.probeId).toBe(
      probeBefore?.probeId
    );
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

function decodeForView(source: SpaceshipDefenderState, view: StateView): SpaceshipDefenderState {
  const encoder = new Encoder(source);
  const target = new SpaceshipDefenderState();
  const decoder = new Decoder(target);
  const iterator = { offset: 0 };
  encoder.encodeAll(iterator);
  decoder.decode(encoder.encodeAllView(view, iterator.offset, iterator));
  return target;
}

describe("maintenance window", () => {
  afterEach(() => {
    getMaintenanceWindow().cancel();
  });

  it("refuses a new room while a window is announced", () => {
    getMaintenanceWindow().announce(3_600, Date.now());
    const room = new SpaceshipDefenderRoom();
    room.roomId = "ROOM999";
    expect(() => {
      room.onCreate({ role: "display", protocolVersion: PROTOCOL_VERSION, crewSize: 3 });
    }).toThrow(ROOM_REFUSED_FOR_MAINTENANCE);
  });

  it("takes rooms again once the window is cancelled", () => {
    getMaintenanceWindow().announce(3_600, Date.now());
    getMaintenanceWindow().cancel();
    const room = createRoom();
    expect(room.state.roomId).toBe("ROOM123");
  });

  it("keeps a ready lobby from starting a run", () => {
    const room = createRoom();
    joinDisplay(room);
    getMaintenanceWindow().announce(3_600, Date.now());
    const controllers = Array.from({ length: PLAYER_CAPACITY }, (_, index) =>
      joinController(room, index)
    );
    controllers.forEach((controller) => {
      ready(room, controller);
    });
    // The crew is complete and ready, and still nothing starts: a run begun now
    // is a run the window would interrupt.
    expect(room.state.phase).toBe("lobby");
    expect(internals(room).gameState).toBeUndefined();
  });

  it("lets a run that already started play on to its result", () => {
    const { room } = startGame();
    joinDisplay(room);
    expect(internals(room).gameState).toBeDefined();
    getMaintenanceWindow().announce(3_600, Date.now());
    room.advanceGameStep();
    // The simulation is untouched: interrupting a wave mid-flight is the very
    // thing the window exists to avoid.
    expect(room.state.phase).toBe("active");
    expect(internals(room).gameState).toBeDefined();
    expect(room.state.game.encounter.phase).not.toBe("result");
  });

  it("closes the room at the result instead of offering a rematch", () => {
    const { room, controllers } = startGame();
    joinDisplay(room);
    const broadcast = vi.spyOn(room, "broadcast");
    vi.spyOn(room, "disconnect").mockResolvedValue(undefined);
    getMaintenanceWindow().announce(3_600, Date.now());
    forceResult(room);
    expect(broadcast).toHaveBeenCalledWith(serverMessage.roomClosing, {
      reason: "maintenance_window"
    });
    controllers.forEach((controller) => {
      ready(room, controller);
    });
    expect(room.state.game.encounter.phase).toBe("result");
  });

  it("publishes the countdown into room state and takes it away again", () => {
    const room = createRoom();
    expect(room.state.maintenanceActive).toBe(false);
    expect(room.state.maintenanceSecondsRemaining).toBe(0);

    getMaintenanceWindow().announce(600, Date.now());
    internals(room).syncMaintenance();
    expect(room.state.maintenanceActive).toBe(true);
    expect(room.state.maintenanceSecondsRemaining).toBeGreaterThan(0);
    expect(room.state.maintenanceSecondsRemaining).toBeLessThanOrEqual(600);

    getMaintenanceWindow().cancel();
    internals(room).syncMaintenance();
    expect(room.state.maintenanceActive).toBe(false);
    expect(room.state.maintenanceSecondsRemaining).toBe(0);
  });
});
