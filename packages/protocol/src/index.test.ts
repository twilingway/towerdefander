import { describe, expect, it } from "vitest";
import {
  MAX_PLAYER_CAPACITY,
  MIN_PLAYER_CAPACITY,
  PROTOCOL_VERSION,
  airstrikeCommandSchema,
  airstrikeTargetSectorIdsSchema,
  controllerJoinOptionsSchema,
  controllerRoomViewSchema,
  displayCreateOptionsSchema,
  displayJoinOptionsSchema,
  displayRoomViewSchema,
  getAirstrikeTargetSectorIds,
  joinOptionsSchema,
  playerCapacitySchema,
  publicPlayerViewSchema,
  readyCommandSchema,
  resourceActionCommandSchema,
  sectorIdSchema,
  serverErrorSchema,
  type ControllerGameSnapshot,
  type ControllerRoomView,
  type DisplayGameSnapshot,
  type DisplayRoomView,
  type PlayerCapacity,
  type PublicPlayerView,
  type PublicSectorView,
  type SectorId
} from "./index.js";

const ACTION_ID = "11111111-1111-4111-8111-111111111111";

function makePlayer(
  playerCapacity: PlayerCapacity,
  sectorId: SectorId,
  playerId = `player-${String(sectorId)}`
): PublicPlayerView {
  return {
    playerId,
    playerName: `Player ${String(sectorId)}`,
    ready: true,
    connected: true,
    sectorId,
    airstrikeTargetSectorIds: getAirstrikeTargetSectorIds(sectorId, playerCapacity)
  };
}

function makeSectors(
  playerCapacity: PlayerCapacity,
  players: PublicPlayerView[]
): PublicSectorView[] {
  return Array.from({ length: playerCapacity }, (_, sectorId) => ({
    sectorId: sectorId as SectorId,
    assignedPlayerId: players.find((player) => player.sectorId === sectorId)?.playerId ?? null,
    gateHealth: 100,
    gateMaxHealth: 100,
    defenseLevel: 1,
    defenseDamage: 3,
    nextUpgradeCost: 20,
    enemyCount: sectorId === 0 ? 1 : 0,
    airstrikeTargetAvailable: sectorId === 0
  }));
}

function makeControllerRoom(playerCapacity: PlayerCapacity = 2): ControllerRoomView {
  const players = [makePlayer(playerCapacity, 0), makePlayer(playerCapacity, 1)];

  return {
    roomId: "ROOM01",
    phase: "active",
    displayConnected: true,
    playerCapacity,
    players,
    game: {
      tick: 10,
      elapsedMs: 500,
      treasury: 50,
      pathLength: 700,
      repairCost: 20,
      result: "in_progress",
      waveNumber: 1,
      totalWaves: 5,
      stage: "combat",
      intermissionRemainingSeconds: 0,
      airstrikeCharge: 100,
      airstrikeChargeRequired: 100,
      airstrikeDamage: 40,
      sectors: makeSectors(playerCapacity, players)
    }
  };
}

function makeDisplayRoom(playerCapacity: PlayerCapacity = 2): DisplayRoomView {
  const controllerRoom = makeControllerRoom(playerCapacity);
  const game = requireControllerGame(controllerRoom);

  return {
    ...controllerRoom,
    game: {
      ...game,
      lastAirstrikeEffect: null,
      enemies: [
        {
          enemyId: "enemy-1",
          sectorId: 0,
          enemyType: "balanced",
          health: 20,
          maxHealth: 20,
          progress: 10
        }
      ]
    }
  };
}

function requireControllerGame(room: ControllerRoomView): ControllerGameSnapshot {
  if (room.game === null) {
    throw new Error("Expected a controller game snapshot.");
  }
  return room.game;
}

function requireDisplayGame(room: DisplayRoomView): DisplayGameSnapshot {
  if (room.game === null) {
    throw new Error("Expected a display game snapshot.");
  }
  return room.game;
}

function requireItem<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Expected item at index ${String(index)}.`);
  }
  return item;
}

describe("protocol v4 bounds", () => {
  it("publishes capacity 2-6 and global sector IDs 0-5", () => {
    expect(PROTOCOL_VERSION).toBe(4);
    expect(MIN_PLAYER_CAPACITY).toBe(2);
    expect(MAX_PLAYER_CAPACITY).toBe(6);

    for (const capacity of [2, 3, 4, 5, 6]) {
      expect(playerCapacitySchema.safeParse(capacity).success).toBe(true);
    }
    for (const capacity of [1, 7, 2.5]) {
      expect(playerCapacitySchema.safeParse(capacity).success).toBe(false);
    }
    for (const sectorId of [0, 1, 2, 3, 4, 5]) {
      expect(sectorIdSchema.safeParse(sectorId).success).toBe(true);
    }
    for (const sectorId of [-1, 6, 1.5]) {
      expect(sectorIdSchema.safeParse(sectorId).success).toBe(false);
    }
  });

  it("derives ordered and deduplicated ring targets", () => {
    expect(getAirstrikeTargetSectorIds(0, 2)).toEqual([0, 1]);
    expect(getAirstrikeTargetSectorIds(0, 6)).toEqual([0, 5, 1]);
    expect(getAirstrikeTargetSectorIds(2, 6)).toEqual([2, 1, 3]);
    expect(() => getAirstrikeTargetSectorIds(5, 2)).toThrow(RangeError);
    expect(airstrikeTargetSectorIdsSchema.safeParse([0, 0]).success).toBe(false);
  });
});

describe("strict v4 options and existing command envelopes", () => {
  it("separates display create from display join", () => {
    expect(
      displayCreateOptionsSchema.safeParse({
        role: "display",
        protocolVersion: 4,
        playerCapacity: 4
      }).success
    ).toBe(true);
    expect(
      displayCreateOptionsSchema.safeParse({
        role: "display",
        protocolVersion: 4
      }).success
    ).toBe(false);
    expect(
      displayJoinOptionsSchema.safeParse({
        role: "display",
        protocolVersion: 4
      }).success
    ).toBe(true);
    expect(
      displayJoinOptionsSchema.safeParse({
        role: "display",
        protocolVersion: 4,
        playerCapacity: 4
      }).success
    ).toBe(false);
  });

  it("trims controller names and forbids controller capacity", () => {
    expect(
      controllerJoinOptionsSchema.parse({
        role: "controller",
        protocolVersion: 4,
        playerName: "  Ada  "
      }).playerName
    ).toBe("Ada");
    expect(
      controllerJoinOptionsSchema.safeParse({
        role: "controller",
        protocolVersion: 4,
        playerName: "Ada",
        playerCapacity: 4
      }).success
    ).toBe(false);
  });

  it("accepts all join shapes and rejects v3", () => {
    for (const options of [
      { role: "display", protocolVersion: 4, playerCapacity: 6 },
      { role: "display", protocolVersion: 4 },
      { role: "controller", protocolVersion: 4, playerName: "Ada" }
    ]) {
      expect(joinOptionsSchema.safeParse(options).success).toBe(true);
    }
    expect(
      joinOptionsSchema.safeParse({
        role: "display",
        protocolVersion: 3
      }).success
    ).toBe(false);
  });

  it("preserves ready, resource, and airstrike payload semantics", () => {
    expect(
      readyCommandSchema.safeParse({
        protocolVersion: 4,
        ready: true
      }).success
    ).toBe(true);
    expect(
      resourceActionCommandSchema.safeParse({
        protocolVersion: 4,
        roomId: "ROOM01",
        playerId: "player-0",
        actionId: ACTION_ID
      }).success
    ).toBe(true);
    expect(
      airstrikeCommandSchema.safeParse({
        protocolVersion: 4,
        roomId: "ROOM01",
        playerId: "player-0",
        actionId: ACTION_ID,
        targetSectorId: 5
      }).success
    ).toBe(true);
  });

  it("keeps action commands strict and rejects v3", () => {
    expect(
      resourceActionCommandSchema.safeParse({
        protocolVersion: 4,
        roomId: "ROOM01",
        playerId: "player-0",
        actionId: ACTION_ID,
        sectorId: 0
      }).success
    ).toBe(false);
    expect(
      airstrikeCommandSchema.safeParse({
        protocolVersion: 3,
        roomId: "ROOM01",
        playerId: "player-0",
        actionId: ACTION_ID,
        targetSectorId: 0
      }).success
    ).toBe(false);
  });

  it("preserves the strict server error payload", () => {
    expect(
      serverErrorSchema.safeParse({
        code: "action_not_available",
        message: "No active target."
      }).success
    ).toBe(true);
    expect(
      serverErrorSchema.safeParse({
        code: "action_not_available",
        message: "No active target.",
        actionId: ACTION_ID
      }).success
    ).toBe(false);
  });
});

describe("strict display and controller room projections", () => {
  it("requires non-null player sectors and target IDs", () => {
    expect(publicPlayerViewSchema.safeParse(makePlayer(6, 0)).success).toBe(true);
    expect(
      publicPlayerViewSchema.safeParse({
        ...makePlayer(6, 0),
        sectorId: null
      }).success
    ).toBe(false);
    const player = makePlayer(6, 0);
    const withoutTargets = {
      playerId: player.playerId,
      playerName: player.playerName,
      ready: player.ready,
      connected: player.connected,
      sectorId: player.sectorId
    };
    expect(publicPlayerViewSchema.safeParse(withoutTargets).success).toBe(false);
  });

  it("accepts a controller lobby without game data", () => {
    const capacity = 3;
    expect(
      controllerRoomViewSchema.safeParse({
        roomId: "ROOM01",
        phase: "lobby",
        displayConnected: true,
        playerCapacity: capacity,
        players: [makePlayer(capacity, 0)],
        game: null
      }).success
    ).toBe(true);
  });

  it("accepts dynamic six-sector controller data", () => {
    expect(controllerRoomViewSchema.safeParse(makeControllerRoom(6)).success).toBe(true);
  });

  it("excludes enemies and effects from controller views", () => {
    expect(controllerRoomViewSchema.safeParse(makeDisplayRoom()).success).toBe(false);
  });

  it("requires enemies and effects in display views", () => {
    expect(displayRoomViewSchema.safeParse(makeDisplayRoom(6)).success).toBe(true);
    expect(displayRoomViewSchema.safeParse(makeControllerRoom(6)).success).toBe(false);
  });

  it("allows a historical effect actor absent from the roster", () => {
    const room = makeDisplayRoom(6);
    requireDisplayGame(room).lastAirstrikeEffect = {
      sequence: 1,
      actionId: ACTION_ID,
      playerId: "departed-player",
      targetSectorId: 5,
      appliedTick: 9
    };

    expect(displayRoomViewSchema.safeParse(room).success).toBe(true);
  });

  it("enforces phase-to-game consistency", () => {
    expect(
      controllerRoomViewSchema.safeParse({
        ...makeControllerRoom(),
        game: null
      }).success
    ).toBe(false);
    expect(
      controllerRoomViewSchema.safeParse({
        ...makeControllerRoom(),
        phase: "lobby"
      }).success
    ).toBe(false);
  });

  it("enforces capacity and unique roster assignments", () => {
    const tooManyPlayers = makeControllerRoom(2);
    tooManyPlayers.players.push(makePlayer(2, 0, "player-2"));

    const duplicatePlayerId = makeControllerRoom(3);
    duplicatePlayerId.players.push(makePlayer(3, 2, "player-0"));
    requireControllerGame(duplicatePlayerId).sectors = makeSectors(3, duplicatePlayerId.players);

    expect(controllerRoomViewSchema.safeParse(tooManyPlayers).success).toBe(false);
    expect(controllerRoomViewSchema.safeParse(duplicatePlayerId).success).toBe(false);
  });

  it("enforces room-specific player sector and target order", () => {
    const outsideCapacity = makeControllerRoom(2);
    outsideCapacity.players[0] = {
      ...requireItem(outsideCapacity.players, 0),
      sectorId: 5,
      airstrikeTargetSectorIds: [5, 0, 1]
    };

    const wrongOrder = makeControllerRoom(6);
    requireItem(wrongOrder.players, 0).airstrikeTargetSectorIds = [0, 1, 5];

    expect(controllerRoomViewSchema.safeParse(outsideCapacity).success).toBe(false);
    expect(controllerRoomViewSchema.safeParse(wrongOrder).success).toBe(false);
  });

  it("enforces exact ordered sectors and roster ownership", () => {
    const wrongCount = makeControllerRoom(3);
    requireControllerGame(wrongCount).sectors.pop();

    const wrongOrder = makeControllerRoom(3);
    requireItem(requireControllerGame(wrongOrder).sectors, 1).sectorId = 2;

    const wrongOwner = makeControllerRoom(3);
    requireItem(requireControllerGame(wrongOwner).sectors, 0).assignedPlayerId = null;

    expect(controllerRoomViewSchema.safeParse(wrongCount).success).toBe(false);
    expect(controllerRoomViewSchema.safeParse(wrongOrder).success).toBe(false);
    expect(controllerRoomViewSchema.safeParse(wrongOwner).success).toBe(false);
  });

  it("enforces target availability from enemy count", () => {
    const room = makeControllerRoom();
    requireItem(requireControllerGame(room).sectors, 0).airstrikeTargetAvailable = false;
    expect(controllerRoomViewSchema.safeParse(room).success).toBe(false);
  });

  it("rejects display enemy and effect sectors outside room capacity", () => {
    const invalidEnemy = makeDisplayRoom(2);
    requireItem(requireDisplayGame(invalidEnemy).enemies, 0).sectorId = 5;

    const invalidEffect = makeDisplayRoom(2);
    requireDisplayGame(invalidEffect).lastAirstrikeEffect = {
      sequence: 1,
      actionId: ACTION_ID,
      playerId: "departed-player",
      targetSectorId: 5,
      appliedTick: 9
    };

    expect(displayRoomViewSchema.safeParse(invalidEnemy).success).toBe(false);
    expect(displayRoomViewSchema.safeParse(invalidEffect).success).toBe(false);
  });

  it("allows free sectors after roster expiry in a finished room", () => {
    const room = makeControllerRoom();
    room.phase = "finished";
    requireControllerGame(room).result = "victory";
    room.players = [];
    requireControllerGame(room).sectors = makeSectors(2, []);

    expect(controllerRoomViewSchema.safeParse(room).success).toBe(true);
  });
});
