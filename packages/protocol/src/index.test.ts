import { describe, expect, it } from "vitest";

import {
  COMBAT_ENTITY_CAPS,
  CREW_ROLES,
  INTERMISSION_DURATION_TICKS,
  MAX_WAVE_TTL_SECONDS,
  PLAYER_CAPACITY,
  PROJECTILE_WORLD_PADDING,
  CREW_SIZES,
  PROTOCOL_VERSION,
  ROOM_TYPE,
  WAVE_TTL_SECONDS,
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
  publicTeamUpgradeViewSchema,
  publicEncounterViewSchema,
  publicTeamUpgradeOfferSchema,
  readyCommandSchema,
  roomClosingSchema,
  serverErrorSchema,
  serverLatencyProbeSchema,
  serverMessage,
  shieldInputCommandSchema,
  upgradeVoteCommandSchema,
  vector2Schema,
  type ControllerRoomView,
  type DisplayRoomView,
  type PublicTeamUpgradeView,
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

/** Everything a controller snapshot carries except the helm the display lacks. */
function withoutHelm(game: NonNullable<ControllerRoomView["game"]>) {
  const { helm, ...rest } = game;
  void helm;
  return rest;
}

function controllerRoom(): ControllerRoomView {
  return {
    roomId: ROOM_ID,
    phase: "active",
    runNumber: 1,
    crewSize: 3,
    assignedRole: "pilot",
    displayConnected: true,
    displayLatencyMs: 18,
    players: players(),
    game: {
      tick: 10,
      elapsedMs: 500,
      worldWidth: 4400,
      worldHeight: 4400,
      arenaRadius: 2200,
      spaceship: {
        x: 2200,
        y: 2200,
        velocityX: 100,
        velocityY: 0,
        radius: 52,
        hp: 900,
        maxHp: 1000,
        heading: Math.PI / 4
      },
      turretAngle: 0,
      shield: {
        angle: Math.PI,
        rearmRequired: false,
        active: true,
        energy: 75,
        capacity: 100,
        arcHalfAngle: Math.PI / 4
      },
      cannon: { heat: 20, capacity: 100, overheated: false },
      machineGun: { heat: 40, capacity: 100, overheated: false },
      encounter: {
        phase: "combat",
        outcome: null,
        defeatReason: null,
        waveNumber: 1,
        encounterTick: 10,
        phaseTicksRemaining: 0,
        waveSecondsRemaining: WAVE_TTL_SECONDS,
        score: 100
      },
      roleModifiers: roleModifiers(),
      credits: 0,
      helm: {
        scheme: "tank",
        headingLeadRadians: 0.5,
        stopDampening: 1,
        rotateInPlaceThrottle: 0.02,
        hullAngularBrakingPerSecondSquared: 50
      },
      teamUpgrade: {
        offer: null,
        votes: { pilot: null, gunner: null, shield: null },
        selection: null
      }
    }
  };
}

function displayRoom(): DisplayRoomView {
  const controller = controllerRoom();
  if (controller.game === null) throw new Error("Expected active game.");
  // The helm rides on the controller snapshot only; the display never sees it.
  const controllerGame = withoutHelm(controller.game);
  return {
    roomId: ROOM_ID,
    phase: "active",
    runNumber: controller.runNumber,
    crewSize: 3,
    displayConnected: true,
    displayLatencyMs: 18,
    players: players(),
    game: {
      ...controllerGame,
      rimBandWidth: 260,
      shieldPhase: "down",
      cameraViewWidth: 1600,
      background: {
        parallaxStrength: 1,
        driftSpeed: 1,
        nebulaAlpha: 0.72,
        nebulaPreset: "blue"
      },
      enemyCatalogue: [],
      asteroidVisual: null,
      spaceshipVisual: null,
      turretVisual: null,
      shieldRadius: 104,
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
          origin: "wave",
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
          radius: 12,
          visual: null
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
    radius: 8,
    visual: null
  };
}

function teamUpgrade(): PublicTeamUpgradeView {
  return {
    offer: {
      offerId: "team-1",
      waveNumber: 1,
      cards: [
        {
          upgradeId: "pilot_speed",
          role: "pilot",
          label: "Maximum speed +10%",
          value: 0.1,
          price: 5
        },
        { upgradeId: "gunner_damage", role: "gunner", label: "Damage +15%", value: 0.15, price: 5 },
        { upgradeId: "shield_capacity", role: "shield", label: "Capacity +20", value: 20, price: 5 }
      ]
    },
    votes: { pilot: null, gunner: null, shield: null },
    selection: null
  };
}

function intermissionController(): ControllerRoomView {
  const room = controllerRoom();
  if (room.game === null) throw new Error("Expected active game.");
  room.game.encounter = {
    phase: "intermission",
    outcome: null,
    defeatReason: null,
    waveNumber: 1,
    encounterTick: 40,
    phaseTicksRemaining: INTERMISSION_DURATION_TICKS,
    waveSecondsRemaining: 0,
    score: 500
  };
  room.game.shield.active = false;
  room.game.teamUpgrade = teamUpgrade();
  return room;
}

describe("protocol v33 handshake and messages", () => {
  it("publishes the fixed crew and v35", () => {
    expect(PROTOCOL_VERSION).toBe(35);
    expect(ROOM_TYPE).toBe("spaceship_defender");
    expect(PLAYER_CAPACITY).toBe(3);
    expect(CREW_ROLES).toEqual(["pilot", "gunner", "shield"]);
  });

  it("accepts v35 create/join and rejects v34 and unknown fields", () => {
    expect(
      displayCreateOptionsSchema.safeParse({ role: "display", protocolVersion: 35, crewSize: 3 })
        .success
    ).toBe(true);
    expect(
      displayCreateOptionsSchema.safeParse({ role: "display", protocolVersion: 34, crewSize: 3 })
        .success
    ).toBe(false);
    expect(
      controllerJoinOptionsSchema.parse({
        role: "controller",
        protocolVersion: 35,
        playerName: "  Ada  "
      }).playerName
    ).toBe("Ada");
    expect(
      controllerJoinOptionsSchema.safeParse({
        role: "controller",
        protocolVersion: 34,
        playerName: "Ada"
      }).success
    ).toBe(false);
    expect(
      joinOptionsSchema.safeParse({
        role: "controller",
        protocolVersion: 35,
        playerName: "Ada",
        requestedRole: "pilot"
      }).success
    ).toBe(false);
  });

  it("requires a known crew size when a display creates a room", () => {
    for (const crewSize of CREW_SIZES) {
      expect(
        displayCreateOptionsSchema.safeParse({
          role: "display",
          protocolVersion: PROTOCOL_VERSION,
          crewSize
        }).success
      ).toBe(true);
    }
    expect(
      displayCreateOptionsSchema.safeParse({
        role: "display",
        protocolVersion: PROTOCOL_VERSION
      }).success
    ).toBe(false);
    expect(
      displayCreateOptionsSchema.safeParse({
        role: "display",
        protocolVersion: PROTOCOL_VERSION,
        crewSize: 4
      }).success
    ).toBe(false);
  });

  it("keeps continuous role messages strict on v35 and the active run", () => {
    const envelope = {
      protocolVersion: 35,
      roomId: ROOM_ID,
      playerId: PLAYER_ID,
      runNumber: 2
    } as const;
    expect(
      pilotInputCommandSchema.safeParse({
        ...envelope,
        sequence: 1,
        vector: { x: 1, y: 0 },
        mgFiring: true
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
      gunnerInputCommandSchema.safeParse({
        ...envelope,
        protocolVersion: 12,
        sequence: 2,
        aim: { x: 0, y: -1 },
        firing: true
      }).success
    ).toBe(false);
    expect(
      shieldInputCommandSchema.safeParse({
        ...envelope,
        protocolVersion: 12,
        sequence: 3,
        aim: { x: -1, y: 0 },
        active: true
      }).success
    ).toBe(false);
    expect(
      pilotInputCommandSchema.safeParse({
        ...envelope,
        protocolVersion: 12,
        sequence: 1,
        vector: { x: 1, y: 0 },
        mgFiring: false
      }).success
    ).toBe(false);
    expect(
      pilotInputCommandSchema.safeParse({
        ...envelope,
        runNumber: 0,
        sequence: 1,
        vector: { x: 1, y: 0 },
        mgFiring: false
      }).success
    ).toBe(false);
    expect(
      pilotInputCommandSchema.safeParse({
        protocolVersion: 34,
        roomId: ROOM_ID,
        playerId: PLAYER_ID,
        sequence: 1,
        vector: { x: 1, y: 0 },
        mgFiring: false
      }).success
    ).toBe(false);
  });

  it("requires the machine gun trigger on v35 pilot input", () => {
    const envelope = {
      protocolVersion: 35,
      roomId: ROOM_ID,
      playerId: PLAYER_ID,
      runNumber: 2,
      sequence: 1,
      vector: { x: 0.5, y: -0.5 }
    } as const;
    expect(pilotInputCommandSchema.safeParse({ ...envelope, mgFiring: true }).success).toBe(true);
    expect(pilotInputCommandSchema.safeParse({ ...envelope, mgFiring: false }).success).toBe(true);
    expect(pilotInputCommandSchema.safeParse(envelope).success).toBe(false);
    expect(pilotInputCommandSchema.safeParse({ ...envelope, mgFiring: "true" }).success).toBe(
      false
    );
  });

  it("carries an optional turn intent on pilot input", () => {
    const envelope = {
      protocolVersion: 35,
      roomId: ROOM_ID,
      playerId: PLAYER_ID,
      runNumber: 2,
      sequence: 1,
      vector: { x: 0, y: 0 },
      mgFiring: false
    } as const;
    // A stick command carries no intent at all, and must stay valid.
    expect(pilotInputCommandSchema.safeParse(envelope).success).toBe(true);
    expect(pilotInputCommandSchema.safeParse({ ...envelope, turn: -1, thrust: 1 }).success).toBe(
      true
    );
    expect(pilotInputCommandSchema.safeParse({ ...envelope, turn: 0, thrust: -1 }).success).toBe(
      true
    );
    expect(pilotInputCommandSchema.safeParse({ ...envelope, turn: 1.5 }).success).toBe(false);
    expect(pilotInputCommandSchema.safeParse({ ...envelope, thrust: -2 }).success).toBe(false);
    expect(pilotInputCommandSchema.safeParse({ ...envelope, turn: "left" }).success).toBe(false);
  });

  it("allows ready for lobby run zero and positive terminal runs", () => {
    const envelope = { protocolVersion: 35, roomId: ROOM_ID, playerId: PLAYER_ID } as const;
    expect(readyCommandSchema.safeParse({ ...envelope, runNumber: 0 }).success).toBe(true);
    expect(readyCommandSchema.safeParse({ ...envelope, runNumber: 3 }).success).toBe(true);
    expect(
      readyCommandSchema.safeParse({ ...envelope, protocolVersion: 34, runNumber: 0 }).success
    ).toBe(false);
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
      upgradeVote: "upgrade:vote",
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

describe("upgrade:vote", () => {
  const command = {
    protocolVersion: 35,
    roomId: ROOM_ID,
    playerId: PLAYER_ID,
    runNumber: 1,
    actionId: ACTION_ID,
    waveNumber: 1,
    offerId: "team-1",
    upgradeId: "pilot_speed",
    revision: 1
  } as const;

  it("requires the complete strict resource-spending envelope", () => {
    expect(upgradeVoteCommandSchema.safeParse(command).success).toBe(true);
    for (const invalid of [
      { ...command, actionId: "not-a-uuid" },
      { ...command, waveNumber: 0 },
      { ...command, offerId: "" },
      { ...command, protocolVersion: 12 },
      { ...command, runNumber: 0 },
      { ...command, revision: 0 },
      { ...command, selectedIndex: 0 }
    ]) {
      expect(upgradeVoteCommandSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("exposes typed idempotency and availability errors", () => {
    for (const code of [
      "action_conflict",
      "action_not_available",
      "stale_action",
      "stale_run"
    ] as const) {
      expect(serverErrorSchema.safeParse({ code, message: "Rejected." }).success).toBe(true);
    }
    expect(
      serverErrorSchema.safeParse({ code: "legacy_action_error", message: "No." }).success
    ).toBe(false);
    expect(
      serverErrorSchema.safeParse({ code: "stale_action", message: "Rejected.", offerId: "x" })
        .success
    ).toBe(false);
  });
});

describe("shared team upgrade projection", () => {
  it("requires three distinct cards in stable role order", () => {
    expect(publicTeamUpgradeViewSchema.safeParse(teamUpgrade()).success).toBe(true);
    const wrongRole = teamUpgrade();
    if (wrongRole.offer === null) throw new Error("offer");
    wrongRole.offer.cards[0] = { ...item(wrongRole.offer.cards, 0), role: "gunner" };
    expect(publicTeamUpgradeViewSchema.safeParse(wrongRole).success).toBe(false);

    const duplicate = teamUpgrade();
    if (duplicate.offer === null) throw new Error("offer");
    duplicate.offer.cards[1] = { ...item(duplicate.offer.cards, 0), role: "gunner" };
    expect(publicTeamUpgradeViewSchema.safeParse(duplicate).success).toBe(false);
  });

  it("publishes role-owned votes and a paid selection", () => {
    const selected = teamUpgrade();
    if (selected.offer === null) throw new Error("offer");
    const firstCard = item(selected.offer.cards, 0);
    selected.votes.pilot = { role: "pilot", upgradeId: firstCard.upgradeId, revision: 1 };
    selected.selection = {
      offerId: selected.offer.offerId,
      waveNumber: 1,
      upgradeId: firstCard.upgradeId,
      role: "pilot",
      price: 5
    };
    expect(publicTeamUpgradeViewSchema.safeParse(selected).success).toBe(true);
  });

  it("rejects an upgrade ID assigned to another role", () => {
    expect(
      publicTeamUpgradeOfferSchema.safeParse({
        offerId: "wrong",
        waveNumber: 1,
        cards: [
          { upgradeId: "shield_capacity", role: "pilot", label: "Wrong", value: 1, price: 5 },
          { upgradeId: "gunner_damage", role: "gunner", label: "Damage", value: 0.1, price: 5 },
          { upgradeId: "shield_arc", role: "shield", label: "Arc", value: 0.1, price: 5 }
        ]
      }).success
    ).toBe(false);
  });
});

describe("strict v33 room projections", () => {
  it("accepts valid combat display and compact controller views", () => {
    expect(controllerRoomViewSchema.safeParse(controllerRoom()).success).toBe(true);
    expect(displayRoomViewSchema.safeParse(displayRoom()).success).toBe(true);
  });

  it("publishes the machine gun view in both snapshots with heat inside capacity", () => {
    const controller = controllerRoom();
    if (controller.game === null) throw new Error("Expected active game.");
    expect(controller.game.machineGun).toEqual({ heat: 40, capacity: 100, overheated: false });

    const display = displayRoom();
    if (display.game === null) throw new Error("Expected active game.");
    expect(display.game.machineGun).toEqual({ heat: 40, capacity: 100, overheated: false });

    const overheated = controllerRoom();
    if (overheated.game === null) throw new Error("Expected active game.");
    overheated.game.machineGun = { heat: 100, capacity: 100, overheated: true };
    expect(controllerRoomViewSchema.safeParse(overheated).success).toBe(true);

    const overCapacity = controllerRoom();
    if (overCapacity.game === null) throw new Error("Expected active game.");
    overCapacity.game.machineGun = { heat: 101, capacity: 100, overheated: true };
    expect(controllerRoomViewSchema.safeParse(overCapacity).success).toBe(false);

    const missing = controllerRoom() as unknown as Record<string, unknown>;
    delete (missing.game as Record<string, unknown>).machineGun;
    expect(controllerRoomViewSchema.safeParse(missing).success).toBe(false);
  });

  it("holds no more players than the crew size", () => {
    const solo = controllerRoom();
    solo.crewSize = 1;
    expect(controllerRoomViewSchema.safeParse(solo).success).toBe(false);

    solo.players = solo.players.slice(0, 1);
    expect(controllerRoomViewSchema.safeParse(solo).success).toBe(true);
  });

  it("keeps the spaceship heading strict and present", () => {
    const room = controllerRoom();
    if (room.game === null) throw new Error("Expected active game.");
    room.game.spaceship.heading = -Math.PI;
    expect(controllerRoomViewSchema.safeParse(room).success).toBe(true);

    const missing = controllerRoom() as unknown as Record<string, unknown>;
    delete (missing.game as { spaceship: Record<string, unknown> }).spaceship.heading;
    expect(controllerRoomViewSchema.safeParse(missing).success).toBe(false);
  });

  it("accepts optional projectile source for friendly and hostile bodies", () => {
    const display = displayRoom();
    if (display.game === null) throw new Error("Expected active game.");
    item(display.game.friendlyProjectiles, 0).source = "machineGun";
    expect(displayRoomViewSchema.safeParse(display).success).toBe(true);

    const cannon = displayRoom();
    if (cannon.game === null) throw new Error("Expected active game.");
    item(cannon.game.friendlyProjectiles, 0).source = "cannon";
    expect(displayRoomViewSchema.safeParse(cannon).success).toBe(true);

    const hostileWithoutSource = displayRoom();
    if (hostileWithoutSource.game === null) throw new Error("Expected active game.");
    expect(displayRoomViewSchema.safeParse(hostileWithoutSource).success).toBe(true);

    const invalidSource = displayRoom();
    if (invalidSource.game === null) throw new Error("Expected active game.");
    item(invalidSource.game.friendlyProjectiles, 0).source = "laser" as never;
    expect(displayRoomViewSchema.safeParse(invalidSource).success).toBe(false);
  });

  it("omits mass entities and obstacles from controllers", () => {
    expect(controllerRoomViewSchema.safeParse(displayRoom()).success).toBe(false);
    expect(displayRoomViewSchema.safeParse(controllerRoom()).success).toBe(false);
    expect(Object.keys(controllerRoom().game ?? {})).not.toContain("enemyShips");
  });

  it("publishes the same team offer regardless of assigned role", () => {
    const room = intermissionController();
    expect(controllerRoomViewSchema.safeParse(room).success).toBe(true);
    room.assignedRole = "gunner";
    expect(controllerRoomViewSchema.safeParse(room).success).toBe(true);
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
    defeat.game.encounter.defeatReason = "spaceship_destroyed";
    defeat.game.encounter.waveSecondsRemaining = 0;
    defeat.game.spaceship.hp = 0;
    expect(displayRoomViewSchema.safeParse(defeat).success).toBe(true);
    defeat.game.spaceship.hp = 1;
    expect(displayRoomViewSchema.safeParse(defeat).success).toBe(false);

    const timeout = displayRoom();
    if (timeout.game === null) throw new Error("Expected active game.");
    timeout.game.encounter.phase = "result";
    timeout.game.encounter.outcome = "defeat";
    timeout.game.encounter.defeatReason = "wave_timeout";
    timeout.game.encounter.waveSecondsRemaining = 0;
    expect(displayRoomViewSchema.safeParse(timeout).success).toBe(true);
    timeout.game.spaceship.hp = 0;
    expect(displayRoomViewSchema.safeParse(timeout).success).toBe(false);

    const victory = displayRoom();
    if (victory.game === null) throw new Error("Expected active game.");
    victory.game.encounter.phase = "result";
    victory.game.encounter.outcome = "victory";
    victory.game.encounter.waveSecondsRemaining = 0;
    expect(displayRoomViewSchema.safeParse(victory).success).toBe(true);
    victory.game.spaceship.hp = 0;
    expect(displayRoomViewSchema.safeParse(victory).success).toBe(false);

    const missingOutcome = displayRoom();
    if (missingOutcome.game === null) throw new Error("Expected active game.");
    missingOutcome.game.encounter.phase = "result";
    missingOutcome.game.encounter.waveSecondsRemaining = 0;
    expect(displayRoomViewSchema.safeParse(missingOutcome).success).toBe(false);

    const prematureOutcome = displayRoom();
    if (prematureOutcome.game === null) throw new Error("Expected active game.");
    prematureOutcome.game.encounter.outcome = "victory";
    expect(displayRoomViewSchema.safeParse(prematureOutcome).success).toBe(false);
  });

  it("enforces the configured combat countdown range", () => {
    const room = controllerRoom();
    if (room.game === null) throw new Error("Expected active game.");
    room.game.encounter.waveSecondsRemaining = 1;
    expect(controllerRoomViewSchema.safeParse(room).success).toBe(true);
    room.game.encounter.waveSecondsRemaining = MAX_WAVE_TTL_SECONDS;
    expect(controllerRoomViewSchema.safeParse(room).success).toBe(true);
    room.game.encounter.waveSecondsRemaining = 0;
    expect(controllerRoomViewSchema.safeParse(room).success).toBe(false);
    room.game.encounter.waveSecondsRemaining = MAX_WAVE_TTL_SECONDS + 1;
    expect(controllerRoomViewSchema.safeParse(room).success).toBe(false);
  });

  it("requires square arena geometry in controller and display projections", () => {
    const controller = controllerRoom();
    if (controller.game === null) throw new Error("Expected active game.");
    controller.game.arenaRadius = 2199;
    expect(controllerRoomViewSchema.safeParse(controller).success).toBe(false);

    const display = displayRoom();
    if (display.game === null) throw new Error("Expected active game.");
    display.game.worldHeight += 0.5e-6;
    expect(displayRoomViewSchema.safeParse(display).success).toBe(false);

    const missing = controllerRoom() as unknown as Record<string, unknown>;
    const game = missing.game as Record<string, unknown>;
    delete game.arenaRadius;
    expect(controllerRoomViewSchema.safeParse(missing).success).toBe(false);
  });

  it("keeps complete spaceship and enemy bodies inside the arena with tiny noise tolerance", () => {
    const spaceshipEdge = controllerRoom();
    if (spaceshipEdge.game === null) throw new Error("Expected active game.");
    spaceshipEdge.game.spaceship.x =
      spaceshipEdge.game.worldWidth / 2 +
      spaceshipEdge.game.arenaRadius -
      spaceshipEdge.game.spaceship.radius +
      0.5e-6;
    expect(controllerRoomViewSchema.safeParse(spaceshipEdge).success).toBe(true);
    // A whole unit, not a millionth: the tolerance now covers the float32 the
    // wire publishes in, and a body actually outside is still outside.
    spaceshipEdge.game.spaceship.x += 1;
    expect(controllerRoomViewSchema.safeParse(spaceshipEdge).success).toBe(false);

    const enemyEdge = displayRoom();
    if (enemyEdge.game === null) throw new Error("Expected active game.");
    const enemy = item(enemyEdge.game.enemyShips, 0);
    enemy.x = enemyEdge.game.worldWidth / 2 + enemyEdge.game.arenaRadius - enemy.radius + 0.5e-6;
    enemy.y = enemyEdge.game.worldHeight / 2;
    expect(displayRoomViewSchema.safeParse(enemyEdge).success).toBe(true);
    enemy.x += 1;
    expect(displayRoomViewSchema.safeParse(enemyEdge).success).toBe(false);
  });

  it("takes a body pinned to the rim through the float32 the wire publishes", () => {
    const room = displayRoom();
    if (room.game === null) throw new Error("Expected active game.");
    const enemy = item(room.game.enemyShips, 0);
    const centre = room.game.worldWidth / 2;
    // Exactly where the simulation clamps a pinned enemy, rounded the way the
    // wire publishes it. On this bearing the rounding alone lands 1.3e-4
    // outside, which a double-precision tolerance rejects — and a rejected
    // snapshot stops the client's view dead. Of a full turn sampled every
    // hundredth of a radian, 304 bearings out of 629 land outside.
    const legal = room.game.arenaRadius - enemy.radius;
    enemy.x = Math.fround(centre + Math.cos(0.1) * legal);
    enemy.y = Math.fround(centre + Math.sin(0.1) * legal);
    expect(displayRoomViewSchema.safeParse(room).success).toBe(true);

    // Still a guard: a body a whole unit out is out, at any world size.
    enemy.x = centre + Math.cos(0.1) * (legal + 1);
    enemy.y = centre + Math.sin(0.1) * (legal + 1);
    expect(displayRoomViewSchema.safeParse(room).success).toBe(false);
  });

  it("requires every transient body to remain in the padded circular envelope", () => {
    const mutations: ((room: DisplayRoomView, outsideOffset: number) => void)[] = [
      (room, outsideOffset) => {
        if (room.game === null) throw new Error("Expected active game.");
        const entity = item(room.game.asteroids, 0);
        entity.x =
          room.game.worldWidth / 2 +
          room.game.arenaRadius +
          PROJECTILE_WORLD_PADDING -
          entity.radius +
          outsideOffset;
        entity.y = room.game.worldHeight / 2;
      },
      (room, outsideOffset) => {
        if (room.game === null) throw new Error("Expected active game.");
        const entity = item(room.game.friendlyProjectiles, 0);
        entity.x =
          room.game.worldWidth / 2 +
          room.game.arenaRadius +
          PROJECTILE_WORLD_PADDING -
          entity.radius +
          outsideOffset;
        entity.y = room.game.worldHeight / 2;
      },
      (room, outsideOffset) => {
        if (room.game === null) throw new Error("Expected active game.");
        const entity = item(room.game.hostileProjectiles, 0);
        entity.x =
          room.game.worldWidth / 2 +
          room.game.arenaRadius +
          PROJECTILE_WORLD_PADDING -
          entity.radius +
          outsideOffset;
        entity.y = room.game.worldHeight / 2;
      },
      (room, outsideOffset) => {
        if (room.game === null) throw new Error("Expected active game.");
        const entity = item(room.game.homingMissiles, 0);
        entity.x =
          room.game.worldWidth / 2 +
          room.game.arenaRadius +
          PROJECTILE_WORLD_PADDING -
          entity.radius +
          outsideOffset;
        entity.y = room.game.worldHeight / 2;
      }
    ];

    for (const mutate of mutations) {
      const edge = displayRoom();
      mutate(edge, 0.5e-6);
      expect(displayRoomViewSchema.safeParse(edge).success).toBe(true);

      const outside = displayRoom();
      mutate(outside, 1);
      expect(displayRoomViewSchema.safeParse(outside).success).toBe(false);
    }
  });

  it("enforces countdown and upgrade phase invariants", () => {
    expect(controllerRoomViewSchema.safeParse(intermissionController()).success).toBe(true);
    const combatOffer = controllerRoom();
    if (combatOffer.game === null) throw new Error("Expected active game.");
    combatOffer.game.teamUpgrade = teamUpgrade();
    expect(controllerRoomViewSchema.safeParse(combatOffer).success).toBe(false);
    expect(
      publicEncounterViewSchema.safeParse({
        phase: "combat",
        outcome: null,
        defeatReason: null,
        waveNumber: 1,
        encounterTick: 1,
        phaseTicksRemaining: 10,
        waveSecondsRemaining: WAVE_TTL_SECONDS,
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
    room.game.encounter.waveSecondsRemaining = 0;
    room.game.teamUpgrade = teamUpgrade();
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

describe("v33 latency diagnostics", () => {
  it("retains strict server probes and client pongs without client telemetry", () => {
    expect(
      serverLatencyProbeSchema.safeParse({ protocolVersion: 35, probeId: "probe-1" }).success
    ).toBe(true);
    expect(
      clientLatencyPongSchema.safeParse({
        protocolVersion: 35,
        roomId: ROOM_ID,
        probeId: "probe-1"
      }).success
    ).toBe(true);
    expect(
      clientLatencyPongSchema.safeParse({
        protocolVersion: 35,
        roomId: ROOM_ID,
        probeId: "probe-1",
        latencyMs: 10
      }).success
    ).toBe(false);
    expect(
      clientLatencyPongSchema.safeParse({
        protocolVersion: 34,
        roomId: ROOM_ID,
        probeId: "probe-1"
      }).success
    ).toBe(false);
    expect(
      serverLatencyProbeSchema.safeParse({ protocolVersion: 34, probeId: "probe-1" }).success
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
