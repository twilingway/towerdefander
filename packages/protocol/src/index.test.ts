import { describe, expect, it } from "vitest";
import {
  CREW_ROLES,
  PLAYER_CAPACITY,
  PROJECTILE_WORLD_PADDING,
  PROTOCOL_VERSION,
  clientMessage,
  controllerJoinOptionsSchema,
  controllerRoomViewSchema,
  displayCreateOptionsSchema,
  displayJoinOptionsSchema,
  displayRoomViewSchema,
  gunnerInputCommandSchema,
  joinOptionsSchema,
  pilotInputCommandSchema,
  publicObstacleViewSchema,
  publicShieldViewSchema,
  readyCommandSchema,
  serverErrorSchema,
  shieldInputCommandSchema,
  vector2Schema,
  type ControllerRoomView,
  type DisplayRoomView,
  type PublicPlayerView
} from "./index.js";

const ROOM_ID = "ROOM01";
const PLAYER_ID = "player-1";

function makePlayers(): PublicPlayerView[] {
  return CREW_ROLES.map((role, index) => ({
    playerId: `player-${String(index + 1)}`,
    playerName: `Player ${String(index + 1)}`,
    role,
    ready: true,
    connected: true
  }));
}

function makeControllerRoom(): ControllerRoomView {
  return {
    roomId: ROOM_ID,
    phase: "active",
    displayConnected: true,
    players: makePlayers(),
    game: {
      tick: 10,
      elapsedMs: 500,
      worldWidth: 2400,
      worldHeight: 1600,
      castle: {
        x: 1200,
        y: 800,
        velocityX: 100,
        velocityY: 0,
        radius: 52
      },
      turretAngle: 0,
      shield: { angle: Math.PI, active: true, energy: 75, capacity: 100 }
    }
  };
}

function makeDisplayRoom(): DisplayRoomView {
  const compact = makeControllerRoom();
  if (compact.game === null) {
    throw new Error("Expected an active game snapshot.");
  }

  return {
    ...compact,
    game: {
      ...compact.game,
      obstacles: [
        {
          obstacleId: "rock-1",
          kind: "circle",
          x: 400,
          y: 300,
          radius: 70
        },
        {
          obstacleId: "ruin-1",
          kind: "rectangle",
          x: 1800,
          y: 1200,
          width: 180,
          height: 100
        }
      ],
      projectiles: [
        {
          projectileId: "projectile-1",
          x: 1300,
          y: 800,
          velocityX: 720,
          velocityY: 0,
          radius: 8
        }
      ]
    }
  };
}

function requireControllerGame(room: ControllerRoomView) {
  if (room.game === null) {
    throw new Error("Expected an active controller game snapshot.");
  }
  return room.game;
}

function requireDisplayGame(room: DisplayRoomView) {
  if (room.game === null) {
    throw new Error("Expected an active display game snapshot.");
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

describe("protocol v6 handshakes and crew", () => {
  it("publishes a fixed three-role protocol", () => {
    expect(PROTOCOL_VERSION).toBe(6);
    expect(PLAYER_CAPACITY).toBe(3);
    expect(CREW_ROLES).toEqual(["pilot", "gunner", "shield"]);
  });

  it("uses the same strict display shape for create and reconnect", () => {
    const options = { role: "display", protocolVersion: 6 };

    expect(displayCreateOptionsSchema.safeParse(options).success).toBe(true);
    expect(displayJoinOptionsSchema.safeParse(options).success).toBe(true);
    expect(displayCreateOptionsSchema.safeParse({ ...options, playerCapacity: 3 }).success).toBe(
      false
    );
    expect(
      displayCreateOptionsSchema.safeParse({ role: "display", protocolVersion: 5 }).success
    ).toBe(false);
  });

  it("trims controller names and rejects requested roles and v5", () => {
    expect(
      controllerJoinOptionsSchema.parse({
        role: "controller",
        protocolVersion: 6,
        playerName: "  Ada  "
      }).playerName
    ).toBe("Ada");
    expect(
      controllerJoinOptionsSchema.safeParse({
        role: "controller",
        protocolVersion: 6,
        playerName: "Ada",
        requestedRole: "pilot"
      }).success
    ).toBe(false);
    expect(
      controllerJoinOptionsSchema.safeParse({
        role: "controller",
        protocolVersion: 5,
        playerName: "Ada"
      }).success
    ).toBe(false);
  });

  it("accepts only the two v6 join variants", () => {
    expect(joinOptionsSchema.safeParse({ role: "display", protocolVersion: 6 }).success).toBe(true);
    expect(
      joinOptionsSchema.safeParse({
        role: "controller",
        protocolVersion: 6,
        playerName: "Ada"
      }).success
    ).toBe(true);
    expect(
      joinOptionsSchema.safeParse({
        role: "controller",
        protocolVersion: 6,
        playerName: "Ada",
        playerCapacity: 3
      }).success
    ).toBe(false);

    expect(joinOptionsSchema.safeParse({ role: "display", protocolVersion: 5 }).success).toBe(
      false
    );
    expect(
      joinOptionsSchema.safeParse({
        role: "controller",
        protocolVersion: 5,
        playerName: "Ada"
      }).success
    ).toBe(false);
  });
});

describe("strict v6 controller intents", () => {
  const envelope = {
    protocolVersion: 6,
    roomId: ROOM_ID,
    playerId: PLAYER_ID
  } as const;

  it("requires an authenticated ready envelope without legacy toggle state", () => {
    expect(readyCommandSchema.safeParse(envelope).success).toBe(true);
    expect(readyCommandSchema.safeParse({ protocolVersion: 6 }).success).toBe(false);
    expect(readyCommandSchema.safeParse({ ...envelope, ready: true }).success).toBe(false);
    expect(readyCommandSchema.safeParse({ ...envelope, protocolVersion: 5 }).success).toBe(false);
  });

  it("accepts strict role-specific input shapes", () => {
    expect(
      pilotInputCommandSchema.safeParse({
        ...envelope,
        sequence: 1,
        vector: { x: 1, y: 0 }
      }).success
    ).toBe(true);
    expect(
      gunnerInputCommandSchema.safeParse({
        ...envelope,
        sequence: 2,
        aim: { x: 0, y: -1 },
        firing: true
      }).success
    ).toBe(true);
    expect(
      shieldInputCommandSchema.safeParse({
        ...envelope,
        sequence: 3,
        aim: { x: -1, y: 0 },
        active: true
      }).success
    ).toBe(true);
  });

  it("rejects missing flags, extra fields, and invalid sequences", () => {
    expect(
      gunnerInputCommandSchema.safeParse({
        ...envelope,
        sequence: 1,
        aim: { x: 1, y: 0 }
      }).success
    ).toBe(false);
    expect(
      shieldInputCommandSchema.safeParse({
        ...envelope,
        sequence: 1,
        aim: { x: 1, y: 0 },
        active: true,
        firing: true
      }).success
    ).toBe(false);

    for (const sequence of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        pilotInputCommandSchema.safeParse({
          ...envelope,
          sequence,
          vector: { x: 0, y: 0 }
        }).success
      ).toBe(false);
    }
  });

  it("rejects every v5 command envelope", () => {
    const v5Envelope = { ...envelope, protocolVersion: 5 };

    expect(readyCommandSchema.safeParse(v5Envelope).success).toBe(false);
    expect(
      pilotInputCommandSchema.safeParse({
        ...v5Envelope,
        sequence: 1,
        vector: { x: 1, y: 0 }
      }).success
    ).toBe(false);
    expect(
      gunnerInputCommandSchema.safeParse({
        ...v5Envelope,
        sequence: 1,
        aim: { x: 1, y: 0 },
        firing: true
      }).success
    ).toBe(false);
    expect(
      shieldInputCommandSchema.safeParse({
        ...v5Envelope,
        sequence: 1,
        aim: { x: 1, y: 0 },
        active: true
      }).success
    ).toBe(false);
  });

  it("rejects non-finite and out-of-range vectors", () => {
    expect(vector2Schema.safeParse({ x: 1, y: -1 }).success).toBe(true);

    for (const vector of [
      { x: Number.NaN, y: 0 },
      { x: Number.POSITIVE_INFINITY, y: 0 },
      { x: 0, y: Number.NEGATIVE_INFINITY },
      { x: 1.01, y: 0 },
      { x: 0, y: -1.01 }
    ]) {
      expect(vector2Schema.safeParse(vector).success).toBe(false);
    }
  });

  it("publishes stable message names", () => {
    expect(clientMessage).toEqual({
      ready: "controller:ready",
      pilotInput: "pilot:input",
      gunnerInput: "gunner:input",
      shieldInput: "shield:input"
    });
  });
});

describe("strict full and compact room projections", () => {
  it("accepts valid active controller and display projections", () => {
    expect(controllerRoomViewSchema.safeParse(makeControllerRoom()).success).toBe(true);
    expect(displayRoomViewSchema.safeParse(makeDisplayRoom()).success).toBe(true);
  });

  it("publishes the same strict shield shape to controller and display", () => {
    expect(
      publicShieldViewSchema.safeParse({
        angle: 0,
        active: false,
        energy: 50,
        capacity: 100
      }).success
    ).toBe(true);

    const controller = makeControllerRoom();
    const display = makeDisplayRoom();
    expect(requireControllerGame(controller).shield).toEqual(requireDisplayGame(display).shield);

    for (const room of [controller, display]) {
      const game = room.game;
      if (game === null) {
        throw new Error("Expected an active game snapshot.");
      }
      expect(
        (room === controller ? controllerRoomViewSchema : displayRoomViewSchema).safeParse({
          ...room,
          game: {
            ...game,
            shield: { ...game.shield, internalRechargeRate: 10 }
          }
        }).success
      ).toBe(false);
    }
  });

  it("rejects non-finite and out-of-range shield energy in both projections", () => {
    for (const shield of [
      { angle: 0, active: false, energy: -1, capacity: 100 },
      { angle: 0, active: false, energy: 101, capacity: 100 },
      { angle: 0, active: false, energy: Number.NaN, capacity: 100 },
      { angle: 0, active: false, energy: 50, capacity: Number.POSITIVE_INFINITY }
    ]) {
      expect(publicShieldViewSchema.safeParse(shield).success).toBe(false);

      const controller = makeControllerRoom();
      requireControllerGame(controller).shield = shield;
      expect(controllerRoomViewSchema.safeParse(controller).success).toBe(false);

      const display = makeDisplayRoom();
      requireDisplayGame(display).shield = shield;
      expect(displayRoomViewSchema.safeParse(display).success).toBe(false);
    }
  });

  it("accepts a partial crew only in a lobby without a game snapshot", () => {
    expect(
      controllerRoomViewSchema.safeParse({
        roomId: ROOM_ID,
        phase: "lobby",
        displayConnected: true,
        players: [makePlayers()[0]],
        game: null
      }).success
    ).toBe(true);

    expect(
      controllerRoomViewSchema.safeParse({ ...makeControllerRoom(), phase: "lobby" }).success
    ).toBe(false);
    expect(
      controllerRoomViewSchema.safeParse({ ...makeControllerRoom(), game: null }).success
    ).toBe(false);
  });

  it("excludes display-only obstacles and projectiles from controller views", () => {
    expect(controllerRoomViewSchema.safeParse(makeDisplayRoom()).success).toBe(false);
    expect(displayRoomViewSchema.safeParse(makeControllerRoom()).success).toBe(false);
  });

  it("enforces unique player identities and crew roles", () => {
    const duplicateId = makeControllerRoom();
    duplicateId.players[1] = {
      ...requireItem(duplicateId.players, 1),
      playerId: requireItem(duplicateId.players, 0).playerId
    };

    const duplicateRole = makeControllerRoom();
    duplicateRole.players[1] = {
      ...requireItem(duplicateRole.players, 1),
      role: requireItem(duplicateRole.players, 0).role
    };

    const tooMany = makeControllerRoom();
    tooMany.players.push({
      playerId: "player-4",
      playerName: "Player 4",
      role: "pilot",
      ready: true,
      connected: true
    });

    expect(controllerRoomViewSchema.safeParse(duplicateId).success).toBe(false);
    expect(controllerRoomViewSchema.safeParse(duplicateRole).success).toBe(false);
    expect(controllerRoomViewSchema.safeParse(tooMany).success).toBe(false);
  });

  it("requires the castle radius to remain inside finite world bounds", () => {
    const outside = makeControllerRoom();
    requireControllerGame(outside).castle.x = 30;
    expect(controllerRoomViewSchema.safeParse(outside).success).toBe(false);

    const impossibleRadius = makeControllerRoom();
    requireControllerGame(impossibleRadius).castle.radius = 900;
    expect(controllerRoomViewSchema.safeParse(impossibleRadius).success).toBe(false);

    const nonFinite = makeControllerRoom();
    requireControllerGame(nonFinite).turretAngle = Number.NaN;
    expect(controllerRoomViewSchema.safeParse(nonFinite).success).toBe(false);
  });

  it("rejects duplicate or excessively out-of-bounds projectiles", () => {
    const duplicate = makeDisplayRoom();
    requireDisplayGame(duplicate).projectiles.push({
      ...requireItem(requireDisplayGame(duplicate).projectiles, 0)
    });
    expect(displayRoomViewSchema.safeParse(duplicate).success).toBe(false);

    const outside = makeDisplayRoom();
    requireItem(requireDisplayGame(outside).projectiles, 0).x =
      requireDisplayGame(outside).worldWidth + PROJECTILE_WORLD_PADDING + 1;
    expect(displayRoomViewSchema.safeParse(outside).success).toBe(false);

    const atPadding = makeDisplayRoom();
    requireItem(requireDisplayGame(atPadding).projectiles, 0).x = -PROJECTILE_WORLD_PADDING;
    expect(displayRoomViewSchema.safeParse(atPadding).success).toBe(true);
  });

  it("rejects duplicate or off-world obstacle centers", () => {
    const duplicate = makeDisplayRoom();
    requireDisplayGame(duplicate).obstacles.push({
      obstacleId: "rock-1",
      kind: "circle",
      x: 200,
      y: 200,
      radius: 20
    });
    expect(displayRoomViewSchema.safeParse(duplicate).success).toBe(false);

    const outside = makeDisplayRoom();
    requireItem(requireDisplayGame(outside).obstacles, 0).x =
      requireDisplayGame(outside).worldWidth + 1;
    expect(displayRoomViewSchema.safeParse(outside).success).toBe(false);
  });

  it("keeps obstacle unions strict by shape", () => {
    expect(
      publicObstacleViewSchema.safeParse({
        obstacleId: "rock-1",
        kind: "circle",
        x: 100,
        y: 100,
        radius: 30,
        width: 50
      }).success
    ).toBe(false);
    expect(
      publicObstacleViewSchema.safeParse({
        obstacleId: "wall-1",
        kind: "rectangle",
        x: 100,
        y: 100,
        width: 50,
        height: 40,
        radius: 10
      }).success
    ).toBe(false);
  });

  it("rejects legacy defense fields in v6 projections", () => {
    expect(
      displayRoomViewSchema.safeParse({ ...makeDisplayRoom(), playerCapacity: 3 }).success
    ).toBe(false);

    const room = makeDisplayRoom();
    expect(
      displayRoomViewSchema.safeParse({
        ...room,
        game: { ...room.game, treasury: 50, sectors: [] }
      }).success
    ).toBe(false);
  });
});

describe("server errors", () => {
  it("includes role mismatch and keeps payloads strict", () => {
    expect(
      serverErrorSchema.safeParse({
        code: "role_mismatch",
        message: "Only the pilot can move the castle."
      }).success
    ).toBe(true);
    expect(
      serverErrorSchema.safeParse({
        code: "role_mismatch",
        message: "Only the pilot can move the castle.",
        role: "shield"
      }).success
    ).toBe(false);
    expect(
      serverErrorSchema.safeParse({ code: "action_not_available", message: "Legacy." }).success
    ).toBe(false);
  });
});
