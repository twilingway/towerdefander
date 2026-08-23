import { describe, expect, it } from "vitest";

import {
  COMBAT_ENTITY_CAPS,
  CREW_ROLES,
  INTERMISSION_DURATION_TICKS,
  PLAYER_CAPACITY,
  PROTOCOL_VERSION,
  ROOM_TYPE,
  clientLatencyPongSchema,
  clientMessage,
  controllerJoinOptionsSchema,
  controllerRoomViewSchema,
  displayCreateOptionsSchema,
  displayRoomViewSchema,
  gunnerInputCommandSchema,
  joinOptionsSchema,
  latencyMsSchema,
  pilotInputCommandSchema,
  publicControllerUpgradeViewSchema,
  publicEncounterViewSchema,
  publicUpgradeOfferSchema,
  readyCommandSchema,
  roomClosingSchema,
  serverErrorSchema,
  serverLatencyProbeSchema,
  serverMessage,
  shieldInputCommandSchema,
  upgradeChooseCommandSchema,
  vector2Schema,
  type ControllerRoomView,
  type DisplayRoomView,
  type PublicControllerUpgradeView,
  type PublicPlayerView
} from "./index.js";

const ROOM_ID = "ROOM01";
const PLAYER_ID = "player-1";
const ACTION_ID = "2d976d54-6686-4f80-b737-6ea427a2c839";

function players(): PublicPlayerView[] {
  return CREW_ROLES.map((role, index) => ({
    playerId: `player-${String(index + 1)}`,
    playerName: `Player ${String(index + 1)}`,
    role,
    ready: true,
    connected: true,
    latencyMs: 20 + index
  }));
}

function item<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Expected item ${String(index)}.`);
  return value;
}

function roleModifiers() {
  return {
    pilot: { speedMultiplier: 1, accelerationMultiplier: 1, maxHpBonus: 0 },
    gunner: { damageMultiplier: 1, cooldownMultiplier: 1, projectileSpeedMultiplier: 1 },
    shield: { capacityBonus: 0, rechargeMultiplier: 1, arcWidthBonus: 0 }
  };
}

function controllerRoom(): ControllerRoomView {
  return {
    roomId: ROOM_ID,
    phase: "active",
    runNumber: 1,
    assignedRole: "pilot",
    displayConnected: true,
    displayLatencyMs: 18,
    players: players(),
    game: {
      tick: 10,
      elapsedMs: 500,
      worldWidth: 4800,
      worldHeight: 3200,
      spaceship: {
        x: 2400,
        y: 1600,
        velocityX: 100,
        velocityY: 0,
        radius: 52,
        hp: 900,
        maxHp: 1000
      },
      turretAngle: 0,
      shield: {
        angle: Math.PI,
        active: true,
        energy: 75,
        capacity: 100,
        arcHalfAngle: Math.PI / 4
      },
      encounter: {
        phase: "combat",
        outcome: null,
        waveNumber: 1,
        encounterTick: 10,
        phaseTicksRemaining: 0,
        score: 100
      },
      roleModifiers: roleModifiers(),
      upgrade: null
    }
  };
}

function displayRoom(): DisplayRoomView {
  const controller = controllerRoom();
  if (controller.game === null) throw new Error("Expected active game.");
  const { upgrade, ...sharedGame } = controller.game;
  void upgrade;
  return {
    roomId: ROOM_ID,
    phase: "active",
    runNumber: controller.runNumber,
    displayConnected: true,
    displayLatencyMs: 18,
    players: players(),
    game: {
      ...sharedGame,
      obstacles: [{ obstacleId: "rock", kind: "circle", x: 400, y: 300, radius: 70 }],
      enemyShips: [
        {
          entityId: "enemy-1",
          spawnSequence: 1,
          kind: "gunship",
          x: 1000,
          y: 800,
          velocityX: 10,
          velocityY: 0,
          heading: 0,
          radius: 30,
          hp: 40,
          maxHp: 40
        }
      ],
      asteroids: [
        {
          entityId: "asteroid-1",
          spawnSequence: 2,
          x: 1200,
          y: 900,
          velocityX: -20,
          velocityY: 5,
          radius: 45,
          hp: 60,
          maxHp: 60
        }
      ],
      friendlyProjectiles: [projectile("friendly-1", 3, "friendly")],
      hostileProjectiles: [projectile("hostile-1", 4, "hostile")],
      homingMissiles: [
        {
          entityId: "missile-1",
          spawnSequence: 5,
          x: 1500,
          y: 1000,
          velocityX: 100,
          velocityY: 10,
          heading: 0.1,
          radius: 12
        }
      ]
    }
  };
}

function projectile(entityId: string, spawnSequence: number, kind: "friendly" | "hostile") {
  return {
    entityId,
    spawnSequence,
    kind,
    x: 1300,
    y: 800,
    velocityX: 720,
    velocityY: 0,
    radius: 8
  };
}

function pilotUpgrade(): PublicControllerUpgradeView {
  return {
    status: "available",
    offer: {
      offerId: "pilot-1",
      waveNumber: 1,
      role: "pilot",
      cards: [
        { upgradeId: "pilot_speed", label: "Maximum speed +10%", value: 0.1 },
        { upgradeId: "pilot_acceleration", label: "Acceleration +10%", value: 0.1 },
        { upgradeId: "pilot_hull", label: "Hull and repair +100", value: 100 }
      ]
    },
    selection: null
  };
}

function intermissionController(): ControllerRoomView {
  const room = controllerRoom();
  if (room.game === null) throw new Error("Expected active game.");
  room.game.encounter = {
    phase: "intermission",
    outcome: null,
    waveNumber: 1,
    encounterTick: 40,
    phaseTicksRemaining: INTERMISSION_DURATION_TICKS,
    score: 500
  };
  room.game.shield.active = false;
  room.game.upgrade = pilotUpgrade();
  return room;
}

describe("protocol v10 handshake and messages", () => {
  it("publishes the fixed crew and v9", () => {
    expect(PROTOCOL_VERSION).toBe(10);
    expect(ROOM_TYPE).toBe("spaceship_defender");
    expect(PLAYER_CAPACITY).toBe(3);
    expect(CREW_ROLES).toEqual(["pilot", "gunner", "shield"]);
  });

  it("accepts v9 create/join and rejects v8 and unknown fields", () => {
    expect(
      displayCreateOptionsSchema.safeParse({ role: "display", protocolVersion: 10 }).success
    ).toBe(true);
    expect(
      displayCreateOptionsSchema.safeParse({ role: "display", protocolVersion: 9 }).success
    ).toBe(false);
    expect(
      controllerJoinOptionsSchema.parse({
        role: "controller",
        protocolVersion: 10,
        playerName: "  Ada  "
      }).playerName
    ).toBe("Ada");
    expect(
      joinOptionsSchema.safeParse({
        role: "controller",
        protocolVersion: 10,
        playerName: "Ada",
        requestedRole: "pilot"
      }).success
    ).toBe(false);
  });

  it("keeps continuous role messages strict on v9 and the active run", () => {
    const envelope = {
      protocolVersion: 10,
      roomId: ROOM_ID,
      playerId: PLAYER_ID,
      runNumber: 2
    } as const;
    expect(
      pilotInputCommandSchema.safeParse({ ...envelope, sequence: 1, vector: { x: 1, y: 0 } })
        .success
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
    expect(
      shieldInputCommandSchema.safeParse({
        ...envelope,
        sequence: 3,
        aim: { x: -1, y: 0 },
        active: true,
        firing: true
      }).success
    ).toBe(false);
    expect(
      pilotInputCommandSchema.safeParse({
        ...envelope,
        protocolVersion: 9,
        sequence: 1,
        vector: { x: 1, y: 0 }
      }).success
    ).toBe(false);
    expect(
      pilotInputCommandSchema.safeParse({
        ...envelope,
        runNumber: 0,
        sequence: 1,
        vector: { x: 1, y: 0 }
      }).success
    ).toBe(false);
    expect(
      pilotInputCommandSchema.safeParse({
        protocolVersion: 10,
        roomId: ROOM_ID,
        playerId: PLAYER_ID,
        sequence: 1,
        vector: { x: 1, y: 0 }
      }).success
    ).toBe(false);
  });

  it("allows ready for lobby run zero and positive terminal runs", () => {
    const envelope = { protocolVersion: 10, roomId: ROOM_ID, playerId: PLAYER_ID } as const;
    expect(readyCommandSchema.safeParse({ ...envelope, runNumber: 0 }).success).toBe(true);
    expect(readyCommandSchema.safeParse({ ...envelope, runNumber: 3 }).success).toBe(true);
    for (const runNumber of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(readyCommandSchema.safeParse({ ...envelope, runNumber }).success).toBe(false);
    }
  });

  it("publishes the upgrade message name", () => {
    expect(clientMessage).toEqual({
      ready: "controller:ready",
      pilotInput: "pilot:input",
      gunnerInput: "gunner:input",
      shieldInput: "shield:input",
      upgradeChoose: "upgrade:choose",
      latencyPong: "client:latency-pong"
    });
    expect(serverMessage).toEqual({
      error: "server:error",
      latencyProbe: "server:latency-probe",
      roomClosing: "room:closing"
    });
  });

  it("keeps room closing reasons typed and strict", () => {
    for (const reason of [
      "display_left",
      "display_reconnect_expired",
      "lobby_expired",
      "result_expired",
      "controllers_expired",
      "room_lifetime_expired"
    ] as const) {
      expect(roomClosingSchema.safeParse({ reason }).success).toBe(true);
    }
    expect(roomClosingSchema.safeParse({ reason: "unknown" }).success).toBe(false);
    expect(roomClosingSchema.safeParse({ reason: "display_left", roomId: ROOM_ID }).success).toBe(
      false
    );
  });
});

describe("upgrade:choose", () => {
  const command = {
    protocolVersion: 10,
    roomId: ROOM_ID,
    playerId: PLAYER_ID,
    runNumber: 1,
    actionId: ACTION_ID,
    waveNumber: 1,
    offerId: "pilot-1",
    upgradeId: "pilot_speed"
  } as const;

  it("requires the complete strict resource-spending envelope", () => {
    expect(upgradeChooseCommandSchema.safeParse(command).success).toBe(true);
    for (const invalid of [
      { ...command, actionId: "not-a-uuid" },
      { ...command, waveNumber: 0 },
      { ...command, offerId: "" },
      { ...command, protocolVersion: 9 },
      { ...command, runNumber: 0 },
      { ...command, selectedIndex: 0 }
    ]) {
      expect(upgradeChooseCommandSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("exposes typed idempotency and availability errors", () => {
    for (const code of [
      "action_conflict",
      "already_chosen",
      "action_not_available",
      "stale_run"
    ] as const) {
      expect(serverErrorSchema.safeParse({ code, message: "Rejected." }).success).toBe(true);
    }
    expect(
      serverErrorSchema.safeParse({ code: "legacy_action_error", message: "No." }).success
    ).toBe(false);
    expect(
      serverErrorSchema.safeParse({ code: "already_chosen", message: "Rejected.", offerId: "x" })
        .success
    ).toBe(false);
  });
});

describe("personalized upgrade projection", () => {
  it("requires three distinct role-owned offers", () => {
    expect(publicControllerUpgradeViewSchema.safeParse(pilotUpgrade()).success).toBe(true);
    const wrongRole = {
      ...pilotUpgrade(),
      offer: { ...pilotUpgrade().offer, role: "gunner" }
    };
    expect(publicControllerUpgradeViewSchema.safeParse(wrongRole).success).toBe(false);

    const duplicate = pilotUpgrade();
    duplicate.offer.cards[1] = { ...item(duplicate.offer.cards, 0) };
    expect(publicControllerUpgradeViewSchema.safeParse(duplicate).success).toBe(false);
  });

  it("requires selection to match one offered card", () => {
    const selected = pilotUpgrade();
    const firstCard = item(selected.offer.cards, 0);
    selected.status = "selected";
    selected.selection = {
      offerId: selected.offer.offerId,
      upgradeId: firstCard.upgradeId,
      role: "pilot",
      source: "player"
    };
    expect(publicControllerUpgradeViewSchema.safeParse(selected).success).toBe(true);
    selected.selection.offerId = "expired-offer";
    expect(publicControllerUpgradeViewSchema.safeParse(selected).success).toBe(false);
  });

  it("rejects an upgrade ID assigned to another role", () => {
    expect(
      publicUpgradeOfferSchema.safeParse({
        offerId: "wrong",
        role: "pilot",
        waveNumber: 1,
        cards: [
          { upgradeId: "shield_capacity", label: "Wrong", value: 1 },
          { upgradeId: "pilot_acceleration", label: "Acceleration", value: 0.1 },
          { upgradeId: "pilot_hull", label: "Hull", value: 25 }
        ]
      }).success
    ).toBe(false);
  });
});

describe("strict v9 room projections", () => {
  it("accepts valid combat display and compact controller views", () => {
    expect(controllerRoomViewSchema.safeParse(controllerRoom()).success).toBe(true);
    expect(displayRoomViewSchema.safeParse(displayRoom()).success).toBe(true);
  });

  it("omits mass entities and obstacles from controllers", () => {
    expect(controllerRoomViewSchema.safeParse(displayRoom()).success).toBe(false);
    expect(displayRoomViewSchema.safeParse(controllerRoom()).success).toBe(false);
    expect(Object.keys(controllerRoom().game ?? {})).not.toContain("enemyShips");
  });

  it("requires own assigned role for controller offers", () => {
    const room = intermissionController();
    expect(controllerRoomViewSchema.safeParse(room).success).toBe(true);
    room.assignedRole = "gunner";
    expect(controllerRoomViewSchema.safeParse(room).success).toBe(false);
  });

  it("enforces lobby/active run epochs", () => {
    const lobby = controllerRoom();
    lobby.phase = "lobby";
    lobby.runNumber = 0;
    lobby.game = null;
    expect(controllerRoomViewSchema.safeParse(lobby).success).toBe(true);
    lobby.runNumber = 1;
    expect(controllerRoomViewSchema.safeParse(lobby).success).toBe(false);

    const active = displayRoom();
    active.runNumber = 0;
    expect(displayRoomViewSchema.safeParse(active).success).toBe(false);
  });

  it("enforces terminal outcome and spaceship HP invariants", () => {
    const defeat = displayRoom();
    if (defeat.game === null) throw new Error("Expected active game.");
    defeat.game.encounter.phase = "result";
    defeat.game.encounter.outcome = "defeat";
    defeat.game.spaceship.hp = 0;
    expect(displayRoomViewSchema.safeParse(defeat).success).toBe(true);
    defeat.game.spaceship.hp = 1;
    expect(displayRoomViewSchema.safeParse(defeat).success).toBe(false);

    const victory = displayRoom();
    if (victory.game === null) throw new Error("Expected active game.");
    victory.game.encounter.phase = "result";
    victory.game.encounter.outcome = "victory";
    expect(displayRoomViewSchema.safeParse(victory).success).toBe(true);
    victory.game.spaceship.hp = 0;
    expect(displayRoomViewSchema.safeParse(victory).success).toBe(false);

    const missingOutcome = displayRoom();
    if (missingOutcome.game === null) throw new Error("Expected active game.");
    missingOutcome.game.encounter.phase = "result";
    expect(displayRoomViewSchema.safeParse(missingOutcome).success).toBe(false);

    const prematureOutcome = displayRoom();
    if (prematureOutcome.game === null) throw new Error("Expected active game.");
    prematureOutcome.game.encounter.outcome = "victory";
    expect(displayRoomViewSchema.safeParse(prematureOutcome).success).toBe(false);
  });

  it("enforces countdown and upgrade phase invariants", () => {
    expect(controllerRoomViewSchema.safeParse(intermissionController()).success).toBe(true);
    const combatOffer = controllerRoom();
    if (combatOffer.game === null) throw new Error("Expected active game.");
    combatOffer.game.upgrade = pilotUpgrade();
    expect(controllerRoomViewSchema.safeParse(combatOffer).success).toBe(false);
    expect(
      publicEncounterViewSchema.safeParse({
        phase: "combat",
        outcome: null,
        waveNumber: 1,
        encounterTick: 1,
        phaseTicksRemaining: 10,
        score: 0
      }).success
    ).toBe(false);
  });

  it("requires HP and shield energy inside authoritative ranges", () => {
    const hp = controllerRoom();
    if (hp.game === null) throw new Error("Expected active game.");
    hp.game.spaceship.hp = hp.game.spaceship.maxHp + 1;
    expect(controllerRoomViewSchema.safeParse(hp).success).toBe(false);

    const shield = controllerRoom();
    if (shield.game === null) throw new Error("Expected active game.");
    shield.game.shield.energy = shield.game.shield.capacity + 1;
    expect(controllerRoomViewSchema.safeParse(shield).success).toBe(false);
  });

  it("requires globally unique entity IDs and spawn sequences", () => {
    const duplicateId = displayRoom();
    if (duplicateId.game === null) throw new Error("Expected active game.");
    item(duplicateId.game.homingMissiles, 0).entityId = item(
      duplicateId.game.enemyShips,
      0
    ).entityId;
    expect(displayRoomViewSchema.safeParse(duplicateId).success).toBe(false);

    const duplicateSequence = displayRoom();
    if (duplicateSequence.game === null) throw new Error("Expected active game.");
    item(duplicateSequence.game.homingMissiles, 0).spawnSequence = 1;
    expect(displayRoomViewSchema.safeParse(duplicateSequence).success).toBe(false);
  });

  it("requires spawn ordering, projectile ownership, bounds, and type caps", () => {
    const ordering = displayRoom();
    if (ordering.game === null) throw new Error("Expected active game.");
    ordering.game.friendlyProjectiles.push(projectile("friendly-2", 2, "friendly"));
    expect(displayRoomViewSchema.safeParse(ordering).success).toBe(false);

    const ownership = displayRoom();
    if (ownership.game === null) throw new Error("Expected active game.");
    item(ownership.game.friendlyProjectiles, 0).kind = "hostile";
    expect(displayRoomViewSchema.safeParse(ownership).success).toBe(false);

    const outside = displayRoom();
    if (outside.game === null) throw new Error("Expected active game.");
    item(outside.game.enemyShips, 0).x = outside.game.worldWidth + 257;
    expect(displayRoomViewSchema.safeParse(outside).success).toBe(false);

    const capped = displayRoom();
    if (capped.game === null) throw new Error("Expected active game.");
    capped.game.friendlyProjectiles = Array.from(
      { length: COMBAT_ENTITY_CAPS.friendlyProjectiles + 1 },
      (_, index) => projectile(`friendly-${String(index)}`, index + 10, "friendly")
    );
    expect(displayRoomViewSchema.safeParse(capped).success).toBe(false);
  });

  it("requires intermission display collections to be empty", () => {
    const room = displayRoom();
    if (room.game === null) throw new Error("Expected active game.");
    room.game.encounter.phase = "intermission";
    room.game.encounter.phaseTicksRemaining = 200;
    expect(displayRoomViewSchema.safeParse(room).success).toBe(false);
    room.game.enemyShips = [];
    room.game.asteroids = [];
    room.game.friendlyProjectiles = [];
    room.game.hostileProjectiles = [];
    room.game.homingMissiles = [];
    expect(displayRoomViewSchema.safeParse(room).success).toBe(true);
  });

  it("keeps player identity/role and latency strict", () => {
    const duplicate = controllerRoom();
    duplicate.players[1] = { ...item(duplicate.players, 1), role: item(duplicate.players, 0).role };
    expect(controllerRoomViewSchema.safeParse(duplicate).success).toBe(false);
    for (const value of [null, 0, 5000])
      expect(latencyMsSchema.safeParse(value).success).toBe(true);
    for (const value of [-1, 0.5, 5001])
      expect(latencyMsSchema.safeParse(value).success).toBe(false);
  });
});

describe("v9 latency diagnostics", () => {
  it("retains strict server probes and client pongs without client telemetry", () => {
    expect(
      serverLatencyProbeSchema.safeParse({ protocolVersion: 10, probeId: "probe-1" }).success
    ).toBe(true);
    expect(
      clientLatencyPongSchema.safeParse({
        protocolVersion: 10,
        roomId: ROOM_ID,
        probeId: "probe-1"
      }).success
    ).toBe(true);
    expect(
      clientLatencyPongSchema.safeParse({
        protocolVersion: 10,
        roomId: ROOM_ID,
        probeId: "probe-1",
        latencyMs: 10
      }).success
    ).toBe(false);
    expect(
      serverLatencyProbeSchema.safeParse({ protocolVersion: 9, probeId: "probe-1" }).success
    ).toBe(false);
  });

  it("rejects non-finite and out-of-range vectors", () => {
    expect(vector2Schema.safeParse({ x: 1, y: -1 }).success).toBe(true);
    for (const vector of [
      { x: Number.NaN, y: 0 },
      { x: Number.POSITIVE_INFINITY, y: 0 },
      { x: 1.01, y: 0 }
    ]) {
      expect(vector2Schema.safeParse(vector).success).toBe(false);
    }
  });
});
