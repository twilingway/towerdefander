import {
  advanceSpaceshipSimulation,
  applyGunnerInput,
  applyPilotInput,
  applyShieldInput,
  cancelGunnerControl,
  cancelPilotControl,
  cancelShieldControl,
  chooseRoleUpgrade,
  createCleanSpaceshipRun,
  createSpaceshipSimulationConfig,
  failWaveByTimeout,
  type AsteroidState as CoreAsteroidState,
  type CombatEnemyState,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState,
  type HomingMissileState as CoreHomingMissileState,
  type HostileProjectileState,
  type ProjectileState as CoreProjectileState,
  type RoleModifiers,
  type RoleUpgradeOffer,
  type RoleUpgradeSelection
} from "@spaceship-defender/game-core";
import {
  CREW_ROLES,
  PLAYER_CAPACITY,
  PROTOCOL_VERSION,
  clientMessage,
  clientLatencyPongSchema,
  displayCreateOptionsSchema,
  gunnerInputCommandSchema,
  joinOptionsSchema,
  pilotInputCommandSchema,
  readyCommandSchema,
  serverMessage,
  shieldInputCommandSchema,
  upgradeChooseCommandSchema,
  type CrewRole,
  type GunnerInputCommand,
  type PilotInputCommand,
  type RoomClosingReason,
  type ServerErrorCode,
  type ShieldInputCommand,
  type UpgradeChooseCommand
} from "@spaceship-defender/protocol";
import { StateView } from "@colyseus/schema";
import { CloseCode, Room, ServerError, type Client } from "colyseus";
import { randomInt, randomUUID } from "node:crypto";

import { readServerConfig } from "../config.js";
import type { RoomStatsMetadata, RoomStatsStatus } from "../stats/types.js";
import {
  AsteroidState,
  ControllerUpgradeState,
  EnemyState,
  HomingMissileState,
  ObstacleState,
  PlayerState,
  ProjectileState,
  SpaceshipDefenderState,
  UpgradeCardState
} from "./SpaceshipDefenderState.js";

type ConnectionRole = "display" | "controller";
type InputMessageType =
  | typeof clientMessage.pilotInput
  | typeof clientMessage.gunnerInput
  | typeof clientMessage.shieldInput;

interface RuntimeSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

interface RoomTimer {
  clear(): void;
}

interface OutstandingLatencyProbe {
  readonly probeId: string;
  readonly sentAt: number;
  readonly timeout: RoomTimer;
}

interface UpgradeJournalEntry {
  readonly actionId: string;
  readonly fingerprint: string;
  readonly outcome: "accepted" | "already_chosen" | "action_not_available";
}

type LifecycleDeadlineReason = Exclude<RoomClosingReason, "display_left">;

interface LifecycleDeadline {
  readonly reason: LifecycleDeadlineReason;
  readonly expiresAtMs: number;
}

const LATENCY_PROBE_INTERVAL_MS = 2_000;
const LATENCY_PROBE_TIMEOUT_MS = 5_000;
const MAX_LATENCY_SAMPLE_MS = 5_000;
const MAX_LATENCY_SAMPLES = 5;
const MAX_UPGRADE_JOURNAL_ENTRIES = 32;
const UINT32_EXCLUSIVE_MAX = 0x1_0000_0000;

const {
  reconnectionGraceSeconds,
  lobbyTtlSeconds,
  resultTtlSeconds,
  zeroControllerTtlSeconds,
  waveTtlSeconds,
  absoluteTtlSeconds
} = readServerConfig();
const spaceshipSimulationConfig = createSpaceshipSimulationConfig();

const DECORATIVE_OBSTACLES = [
  { obstacleId: "island-northwest", kind: "circle" as const, x: 760, y: 760, radius: 105 },
  {
    obstacleId: "ruins-north",
    kind: "rectangle" as const,
    x: 2200,
    y: 390,
    width: 250,
    height: 120
  },
  {
    obstacleId: "cloud-northeast",
    kind: "rectangle" as const,
    x: 3650,
    y: 850,
    width: 330,
    height: 150
  },
  { obstacleId: "island-west", kind: "circle" as const, x: 850, y: 1740, radius: 135 },
  {
    obstacleId: "ruins-center-west",
    kind: "rectangle" as const,
    x: 1980,
    y: 1420,
    width: 220,
    height: 180
  },
  { obstacleId: "island-center-east", kind: "circle" as const, x: 2820, y: 1840, radius: 90 },
  { obstacleId: "island-southwest", kind: "circle" as const, x: 900, y: 2700, radius: 120 },
  {
    obstacleId: "cloud-southeast",
    kind: "rectangle" as const,
    x: 4040,
    y: 2600,
    width: 300,
    height: 140
  },
  {
    obstacleId: "ruins-south",
    kind: "rectangle" as const,
    x: 2500,
    y: 2760,
    width: 240,
    height: 170
  }
] as const;

export class SpaceshipDefenderRoom extends Room<{
  state: SpaceshipDefenderState;
  metadata: RoomStatsMetadata;
}> {
  override maxClients = PLAYER_CAPACITY + 2;
  override maxMessagesPerSecond = 25;
  override state = new SpaceshipDefenderState();

  private readonly connectionRoles = new Map<string, ConnectionRole>();
  private readonly sequenceWatermarks = new Map<string, Map<InputMessageType, number>>();
  private readonly connectionClients = new Map<string, Client>();
  private readonly latencySamples = new Map<string, number[]>();
  private readonly outstandingLatencyProbes = new Map<string, OutstandingLatencyProbe>();
  private readonly scheduledLatencyProbes = new Map<string, RoomTimer>();
  private readonly upgradeJournals = new Map<string, UpgradeJournalEntry[]>();
  private displaySessionId: string | undefined;
  private gameConfig: SpaceshipSimulationConfig = spaceshipSimulationConfig;
  private gameState: SpaceshipSimulationState | undefined;
  private simulationTimer: RoomTimer | undefined;
  private lifecycleTimer: RoomTimer | undefined;
  private lifecycleGeneration = 0;
  private readonly lifecycleDeadlines = new Map<LifecycleDeadlineReason, number>();
  private waveDeadlineTimer: RoomTimer | undefined;
  private waveDeadlineAtMs: number | undefined;
  private waveDeadlineGeneration = 0;
  private createdAtMs = 0;
  private status: RoomStatsStatus = "lobby";
  private statusChangedAtMs = 0;
  private firstControllerJoined = false;
  private disposing = false;
  private statsId = "";
  private pendingMetadata: RoomStatsMetadata | undefined;
  private metadataWritePromise: Promise<void> | undefined;
  private nextLatencyProbeSequence = 1;

  override messages = {
    [clientMessage.ready]: (client: Client, payload: unknown) => {
      this.handleReady(client, payload);
    },
    [clientMessage.pilotInput]: (client: Client, payload: unknown) => {
      this.handlePilotInput(client, payload);
    },
    [clientMessage.gunnerInput]: (client: Client, payload: unknown) => {
      this.handleGunnerInput(client, payload);
    },
    [clientMessage.shieldInput]: (client: Client, payload: unknown) => {
      this.handleShieldInput(client, payload);
    },
    [clientMessage.upgradeChoose]: (client: Client, payload: unknown) => {
      this.handleUpgradeChoose(client, payload);
    },
    [clientMessage.latencyPong]: (client: Client, payload: unknown) => {
      this.handleLatencyPong(client, payload);
    }
  };

  override onCreate(unsafeOptions: unknown): void {
    if (this.hasProtocolMismatch(unsafeOptions)) {
      throw new ServerError(4000, "protocol_mismatch");
    }
    if (!displayCreateOptionsSchema.safeParse(unsafeOptions).success) {
      throw new ServerError(4000, "invalid_message");
    }
    this.state.roomId = this.roomId;
    const now = Date.now();
    this.createdAtMs = now;
    this.statusChangedAtMs = now;
    this.statsId = randomUUID();
    this.lifecycleDeadlines.set("lobby_expired", now + lobbyTtlSeconds * 1_000);
    this.lifecycleDeadlines.set("room_lifetime_expired", now + absoluteTtlSeconds * 1_000);
    this.rescheduleLifecycle();
    this.queueMetadataUpdate();
  }

  override onJoin(client: Client, unsafeOptions: unknown): void {
    if (this.disposing) {
      throw new ServerError(4001, "invalid_phase");
    }
    const result = joinOptionsSchema.safeParse(unsafeOptions);
    if (!result.success) {
      throw new ServerError(
        4000,
        this.hasProtocolMismatch(unsafeOptions) ? "protocol_mismatch" : "invalid_message"
      );
    }

    if (result.data.role === "display") {
      this.joinDisplay(client);
      this.registerLatencyConnection(client);
      this.clearLifecycleDeadline("display_reconnect_expired");
      this.updateStatusFromRoom();
      this.queueMetadataUpdate();
      return;
    }

    if (this.state.players.size >= PLAYER_CAPACITY) {
      throw new ServerError(4001, "room_full");
    }
    const role = this.findAvailableRole();
    if (role === undefined) {
      throw new ServerError(4001, "room_full");
    }

    client.view = new StateView();
    const player = new PlayerState();
    player.playerId = client.sessionId;
    player.playerName = result.data.playerName;
    player.role = role;
    player.ready = false;
    this.connectionRoles.set(client.sessionId, "controller");
    this.sequenceWatermarks.set(client.sessionId, new Map());
    this.state.players.set(client.sessionId, player);
    this.firstControllerJoined = true;
    this.clearLifecycleDeadline("controllers_expired");
    this.attachControllerUpgradeView(client, role);
    this.registerLatencyConnection(client);
    this.queueMetadataUpdate();
  }

  override async onLeave(client: Client, code: number): Promise<void> {
    const connectionRole = this.connectionRoles.get(client.sessionId);
    this.clearLatencyConnection(client.sessionId);
    if (connectionRole === "display") {
      this.state.displayConnected = false;
      this.setLifecycleDeadline(
        "display_reconnect_expired",
        Date.now() + reconnectionGraceSeconds * 1_000
      );
      this.updateStatus("display_grace");
      this.queueMetadataUpdate();
      if (code === CloseCode.CONSENTED) {
        this.disposeOnce("display_left");
        return;
      }
      try {
        const reconnected = await this.allowReconnection(client, reconnectionGraceSeconds);
        if (this.disposing) return;
        this.connectionRoles.set(reconnected.sessionId, "display");
        this.displaySessionId = reconnected.sessionId;
        this.state.displayConnected = true;
        this.clearLifecycleDeadline("display_reconnect_expired");
        this.registerLatencyConnection(reconnected);
        this.updateStatusFromRoom();
        this.queueMetadataUpdate();
      } catch {
        this.disposeOnce("display_reconnect_expired");
      }
      return;
    }

    if (connectionRole !== "controller") {
      return;
    }
    this.neutralizeRole(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (player === undefined) {
      return;
    }
    player.connected = false;
    this.queueMetadataUpdate();
    if (code === CloseCode.CONSENTED) {
      this.removeController(client.sessionId);
      return;
    }

    try {
      const reconnected = await this.allowReconnection(client, reconnectionGraceSeconds);
      if (this.disposing) return;
      player.connected = true;
      this.connectionRoles.set(reconnected.sessionId, "controller");
      this.sequenceWatermarks.set(reconnected.sessionId, new Map());
      this.attachControllerUpgradeView(reconnected, player.role);
      this.registerLatencyConnection(reconnected);
      this.clearLifecycleDeadline("controllers_expired");
      this.queueMetadataUpdate();
      this.tryStartRun();
    } catch {
      this.removeController(client.sessionId);
    }
  }

  override onDispose(): void {
    this.disposing = true;
    this.cleanupResources();
  }

  handleReady(client: Client, unsafePayload: unknown): void {
    const command = this.parseControllerCommand(client, unsafePayload, readyCommandSchema);
    if (command === undefined) {
      return;
    }
    const acceptsReady =
      this.state.phase === "lobby" || this.gameState?.encounterPhase === "result";
    if (!acceptsReady) {
      this.sendError(client, "invalid_phase", "Ready requires the lobby or a run result.");
      return;
    }
    const player = this.state.players.get(client.sessionId);
    if (player === undefined) {
      this.sendError(client, "identity_mismatch", "Player identity does not match connection.");
      return;
    }
    player.ready = true;
    this.tryStartRun();
  }

  handlePilotInput(client: Client, unsafePayload: unknown): void {
    const command = this.parseRoleInput(
      client,
      unsafePayload,
      pilotInputCommandSchema,
      "pilot",
      clientMessage.pilotInput
    );
    if (command === undefined || this.gameState === undefined) {
      return;
    }
    this.gameState = applyPilotInput(this.gameState, {
      vector: command.vector,
      mgFiring: command.mgFiring,
      receivedTick: this.gameState.clock.tick
    });
  }

  handleGunnerInput(client: Client, unsafePayload: unknown): void {
    const command = this.parseRoleInput(
      client,
      unsafePayload,
      gunnerInputCommandSchema,
      "gunner",
      clientMessage.gunnerInput
    );
    if (command === undefined || this.gameState === undefined) {
      return;
    }
    this.gameState = applyGunnerInput(this.gameState, {
      vector: command.aim,
      firing: command.firing,
      receivedTick: this.gameState.clock.tick
    });
  }

  handleShieldInput(client: Client, unsafePayload: unknown): void {
    const command = this.parseRoleInput(
      client,
      unsafePayload,
      shieldInputCommandSchema,
      "shield",
      clientMessage.shieldInput
    );
    if (command === undefined || this.gameState === undefined) {
      return;
    }
    this.gameState = applyShieldInput(this.gameState, {
      vector: command.aim,
      active: command.active,
      receivedTick: this.gameState.clock.tick
    });
  }

  handleUpgradeChoose(client: Client, unsafePayload: unknown): void {
    const command = this.parseControllerCommand(client, unsafePayload, upgradeChooseCommandSchema);
    if (command === undefined || this.gameState === undefined) {
      return;
    }

    const fingerprint = upgradeFingerprint(command);
    const journal = this.upgradeJournals.get(client.sessionId) ?? [];
    const previous = journal.find(({ actionId }) => actionId === command.actionId);
    if (previous !== undefined) {
      if (previous.fingerprint !== fingerprint) {
        this.sendError(
          client,
          "action_conflict",
          "Action ID was already used for another command."
        );
      } else if (previous.outcome !== "accepted") {
        this.sendError(client, previous.outcome, upgradeErrorMessage(previous.outcome));
      }
      return;
    }

    const player = this.state.players.get(client.sessionId);
    if (player === undefined) {
      this.sendError(client, "identity_mismatch", "Player identity does not match connection.");
      return;
    }
    if (this.gameState.encounterPhase !== "intermission") {
      this.sendError(client, "invalid_phase", "Upgrade choice requires an intermission.");
      return;
    }

    const offerOwner = CREW_ROLES.find(
      (role) => this.gameState?.roleOffers[role]?.offerId === command.offerId
    );
    if (offerOwner !== undefined && offerOwner !== player.role) {
      this.sendError(client, "role_mismatch", "Upgrade offer belongs to another role.");
      return;
    }

    const result = chooseRoleUpgrade(this.gameState, {
      role: player.role,
      waveNumber: command.waveNumber,
      offerId: command.offerId,
      upgradeId: command.upgradeId
    });
    this.storeUpgradeOutcome(client.sessionId, {
      actionId: command.actionId,
      fingerprint,
      outcome: result.status
    });
    if (result.status !== "accepted") {
      this.sendError(client, result.status, upgradeErrorMessage(result.status));
      return;
    }

    this.gameState = result.state;
    this.syncGameState();
  }

  handleLatencyPong(client: Client, unsafePayload: unknown, receivedAt = performance.now()): void {
    if (this.hasProtocolMismatch(unsafePayload)) {
      this.sendError(client, "protocol_mismatch", "Protocol version does not match server.");
      return;
    }
    const result = clientLatencyPongSchema.safeParse(unsafePayload);
    if (!result.success) {
      this.sendError(client, "invalid_message", "Message does not match the strict schema.");
      return;
    }
    if (!this.connectionClients.has(client.sessionId)) {
      this.sendError(client, "identity_mismatch", "Connection is not a member of this room.");
      return;
    }
    if (result.data.roomId !== this.roomId) {
      this.sendError(client, "identity_mismatch", "Room identity does not match connection.");
      return;
    }

    const outstanding = this.outstandingLatencyProbes.get(client.sessionId);
    if (outstanding?.probeId !== result.data.probeId) return;

    outstanding.timeout.clear();
    this.outstandingLatencyProbes.delete(client.sessionId);
    const roundTripTimeMs = Math.round(
      Math.min(MAX_LATENCY_SAMPLE_MS, Math.max(0, receivedAt - outstanding.sentAt))
    );
    const samples = [...(this.latencySamples.get(client.sessionId) ?? []), roundTripTimeMs].slice(
      -MAX_LATENCY_SAMPLES
    );
    this.latencySamples.set(client.sessionId, samples);
    this.publishLatency(client.sessionId, median(samples));
    this.scheduleLatencyProbe(client, LATENCY_PROBE_INTERVAL_MS);
  }

  advanceGameStep(): void {
    if (this.state.phase !== "active" || this.gameState === undefined) {
      return;
    }
    if (this.expireWaveDeadlineIfDue(Date.now())) {
      return;
    }
    const previousEncounterPhase = this.gameState.encounterPhase;
    const projectionWasResult = this.state.game.encounter.phase === "result";
    this.gameState = advanceSpaceshipSimulation(this.gameState, this.gameConfig);
    if (previousEncounterPhase === "combat" && this.gameState.encounterPhase !== "combat") {
      this.clearWaveDeadline();
      this.neutralizeAllRoles();
    } else if (previousEncounterPhase !== "combat" && this.gameState.encounterPhase === "combat") {
      this.armWaveDeadline();
    }
    this.syncGameState();
    if (
      previousEncounterPhase !== this.gameState.encounterPhase ||
      (this.gameState.encounterPhase === "result" && !projectionWasResult)
    ) {
      if (this.gameState.encounterPhase === "result") {
        this.enterTerminalResultLifecycle();
      }
      this.updateStatusFromRoom();
      this.queueMetadataUpdate();
    }
  }

  private parseRoleInput<T extends PilotInputCommand | GunnerInputCommand | ShieldInputCommand>(
    client: Client,
    unsafePayload: unknown,
    schema: RuntimeSchema<T>,
    role: CrewRole,
    messageType: InputMessageType
  ): T | undefined {
    const command = this.parseControllerCommand(client, unsafePayload, schema, role);
    if (command === undefined) {
      return undefined;
    }
    if (this.state.phase !== "active" || this.gameState?.encounterPhase !== "combat") {
      this.sendError(client, "invalid_phase", "Gameplay input requires combat.");
      return undefined;
    }
    const watermarks =
      this.sequenceWatermarks.get(client.sessionId) ?? new Map<InputMessageType, number>();
    const previous = watermarks.get(messageType) ?? 0;
    if (command.sequence <= previous) {
      return undefined;
    }
    watermarks.set(messageType, command.sequence);
    this.sequenceWatermarks.set(client.sessionId, watermarks);
    return command;
  }

  private parseControllerCommand<T>(
    client: Client,
    unsafePayload: unknown,
    schema: RuntimeSchema<T>,
    expectedRole?: CrewRole
  ): T | undefined {
    if (this.hasProtocolMismatch(unsafePayload)) {
      this.sendError(client, "protocol_mismatch", "Protocol version does not match server.");
      return undefined;
    }
    const result = schema.safeParse(unsafePayload);
    if (!result.success) {
      this.sendError(client, "invalid_message", "Message does not match the strict schema.");
      return undefined;
    }
    if (this.connectionRoles.get(client.sessionId) !== "controller") {
      this.sendError(client, "not_controller", "Only controllers may send gameplay messages.");
      return undefined;
    }
    const envelope = result.data as { roomId: string; playerId: string; runNumber: number };
    if (envelope.roomId !== this.roomId || envelope.playerId !== client.sessionId) {
      this.sendError(
        client,
        "identity_mismatch",
        "Room or player identity does not match connection."
      );
      return undefined;
    }
    const player = this.state.players.get(client.sessionId);
    if (this.connectionClients.get(client.sessionId) !== client || player === undefined) {
      this.sendError(client, "identity_mismatch", "Controller connection is not active.");
      return undefined;
    }
    if (expectedRole !== undefined && player.role !== expectedRole) {
      this.sendError(client, "role_mismatch", `Only ${expectedRole} may send this input.`);
      return undefined;
    }
    if (envelope.runNumber !== this.state.runNumber) {
      this.sendError(client, "stale_run", "Command belongs to another run.");
      return undefined;
    }
    return result.data;
  }

  private tryStartRun(): void {
    const canStart = this.state.phase === "lobby" || this.gameState?.encounterPhase === "result";
    if (!canStart || this.state.players.size !== PLAYER_CAPACITY || this.disposing) {
      return;
    }
    const players = [...this.state.players.values()];
    if (!players.every((player) => player.connected && player.ready)) {
      return;
    }
    const previousSeed = this.gameState?.runSeed;
    this.gameConfig = createSpaceshipSimulationConfig();
    this.gameState = createCleanSpaceshipRun(this.gameConfig, createRunSeed(previousSeed));
    this.state.runNumber += 1;
    this.state.phase = "active";
    this.state.hasGame = true;
    for (const player of players) player.ready = false;
    this.sequenceWatermarks.clear();
    for (const player of players) this.sequenceWatermarks.set(player.playerId, new Map());
    this.upgradeJournals.clear();
    this.lifecycleDeadlines.delete("lobby_expired");
    this.lifecycleDeadlines.delete("result_expired");
    this.rescheduleLifecycle();
    this.initializeDecorations();
    this.armWaveDeadline();
    this.syncGameState();
    this.startSimulation();
    this.updateStatus("combat");
    this.queueMetadataUpdate();
  }

  private initializeDecorations(): void {
    this.state.game.display.obstacles.clear();
    for (const obstacle of DECORATIVE_OBSTACLES) {
      const state = new ObstacleState();
      state.obstacleId = obstacle.obstacleId;
      state.kind = obstacle.kind;
      state.x = obstacle.x;
      state.y = obstacle.y;
      state.width = "width" in obstacle ? obstacle.width : 0;
      state.height = "height" in obstacle ? obstacle.height : 0;
      state.radius = "radius" in obstacle ? obstacle.radius : 0;
      state.rotation = 0;
      this.state.game.display.obstacles.push(state);
    }
  }

  private syncGameState(): void {
    const game = this.gameState;
    if (game === undefined) {
      return;
    }
    const target = this.state.game;
    target.tick = game.clock.tick;
    target.elapsedMs = game.clock.elapsedMs;
    target.worldWidth = this.gameConfig.worldWidth;
    target.worldHeight = this.gameConfig.worldHeight;
    target.arenaRadius = this.gameConfig.arenaRadius;
    target.spaceship.x = game.spaceship.x;
    target.spaceship.y = game.spaceship.y;
    target.spaceship.velocityX = game.spaceship.velocity.x;
    target.spaceship.velocityY = game.spaceship.velocity.y;
    target.spaceship.radius = this.gameConfig.spaceshipRadius;
    target.spaceship.hp = game.spaceshipHp;
    target.spaceship.maxHp = game.spaceshipMaxHp;
    target.spaceship.heading = game.spaceshipHeading;
    target.turretAngle = game.turretAngle;
    target.shield.angle = game.shieldAngle;
    target.shield.active = game.shieldActive;
    target.shield.energy = game.shieldEnergy;
    target.shield.capacity =
      this.gameConfig.shieldCapacity + game.roleModifiers.shield.capacityBonus;
    target.shield.arcHalfAngle =
      Math.min(
        Math.PI * 2,
        this.gameConfig.shieldArcRadians + game.roleModifiers.shield.arcWidthBonus
      ) / 2;
    target.machineGun.heat = game.mgHeat;
    target.machineGun.capacity = this.gameConfig.mgHeatCapacity;
    target.machineGun.overheated = game.mgOverheated;
    target.encounter.phase = game.encounterPhase;
    target.encounter.hasOutcome = game.outcome !== null;
    target.encounter.outcome = game.outcome ?? "defeat";
    target.encounter.hasDefeatReason = game.defeatReason !== null;
    target.encounter.defeatReason = game.defeatReason ?? "spaceship_destroyed";
    target.encounter.waveNumber = game.waveNumber;
    target.encounter.encounterTick = game.encounterTick;
    target.encounter.phaseTicksRemaining =
      game.encounterPhase === "intermission"
        ? Math.max(0, this.gameConfig.intermissionTicks - game.encounterTick)
        : 0;
    target.encounter.waveSecondsRemaining =
      game.encounterPhase === "combat" && this.waveDeadlineAtMs !== undefined
        ? Math.max(1, Math.ceil((this.waveDeadlineAtMs - Date.now()) / 1_000))
        : 0;
    target.encounter.score = game.score;
    syncRoleModifiers(target.roleModifiers, game.roleModifiers);

    reconcileKeyed(target.display.enemyShips, game.enemies, () => new EnemyState(), syncEnemy);
    reconcileKeyed(
      target.display.asteroids,
      game.asteroids,
      () => new AsteroidState(),
      syncAsteroid
    );
    reconcileKeyed(
      target.display.friendlyProjectiles,
      game.projectiles,
      () => new ProjectileState(),
      (state, projectile) => {
        syncProjectile(state, projectile, "friendly");
      }
    );
    reconcileKeyed(
      target.display.hostileProjectiles,
      game.hostileProjectiles,
      () => new ProjectileState(),
      (state, projectile) => {
        syncProjectile(state, projectile, "hostile");
      }
    );
    reconcileKeyed(
      target.display.homingMissiles,
      game.homingMissiles,
      () => new HomingMissileState(),
      syncHomingMissile
    );
    this.syncUpgradeViews();
  }

  private syncUpgradeViews(): void {
    const game = this.gameState;
    const target = this.state.game.upgrade;
    if (game?.encounterPhase !== "intermission") {
      target.clear();
      return;
    }

    for (const role of CREW_ROLES) {
      const offer = game.roleOffers[role];
      if (offer === null) continue;
      let upgrade = target.get(role);
      if (upgrade === undefined) {
        upgrade = new ControllerUpgradeState();
        target.set(role, upgrade);
      }
      syncControllerUpgrade(upgrade, offer, game.roleSelections[role]);
    }
    this.refreshControllerUpgradeViews();
  }

  private refreshControllerUpgradeViews(): void {
    for (const [sessionId, client] of this.connectionClients) {
      if (this.connectionRoles.get(sessionId) !== "controller") continue;
      const role = this.state.players.get(sessionId)?.role;
      if (role !== undefined) this.attachControllerUpgradeView(client, role);
    }
  }

  private attachControllerUpgradeView(client: Client, role: CrewRole): void {
    const upgrade = this.state.game.upgrade.get(role);
    if (upgrade !== undefined) client.view?.add(upgrade, 2);
  }

  private neutralizeRole(playerId: string): void {
    if (this.gameState === undefined) {
      return;
    }
    const role = this.state.players.get(playerId)?.role;
    if (role === "pilot") {
      this.gameState = cancelPilotControl(this.gameState);
    } else if (role === "gunner") {
      this.gameState = cancelGunnerControl(this.gameState);
    } else if (role === "shield") {
      this.gameState = cancelShieldControl(this.gameState);
    }
    this.syncGameState();
  }

  private neutralizeAllRoles(): void {
    if (this.gameState === undefined) return;
    this.gameState = cancelPilotControl(this.gameState);
    this.gameState = cancelGunnerControl(this.gameState);
    this.gameState = cancelShieldControl(this.gameState);
  }

  private storeUpgradeOutcome(playerId: string, entry: UpgradeJournalEntry): void {
    const journal = this.upgradeJournals.get(playerId) ?? [];
    journal.push(entry);
    if (journal.length > MAX_UPGRADE_JOURNAL_ENTRIES) {
      journal.splice(0, journal.length - MAX_UPGRADE_JOURNAL_ENTRIES);
    }
    this.upgradeJournals.set(playerId, journal);
  }

  private joinDisplay(client: Client): void {
    if (this.displaySessionId !== undefined) {
      throw new ServerError(4001, "display_already_connected");
    }
    client.view = new StateView();
    client.view.add(this.state.game, 1);
    this.displaySessionId = client.sessionId;
    this.connectionRoles.set(client.sessionId, "display");
    this.state.displayConnected = true;
  }

  private registerLatencyConnection(client: Client): void {
    this.clearLatencyConnection(client.sessionId);
    this.connectionClients.set(client.sessionId, client);
    this.publishLatency(client.sessionId, -1);
    this.sendLatencyProbe(client);
  }

  private sendLatencyProbe(client: Client): void {
    if (this.connectionClients.get(client.sessionId) !== client) return;
    const probeId = `latency-${String(this.nextLatencyProbeSequence)}`;
    this.nextLatencyProbeSequence += 1;
    const sentAt = performance.now();
    client.send(serverMessage.latencyProbe, { protocolVersion: PROTOCOL_VERSION, probeId });
    const timeout = this.clock.setTimeout(() => {
      const outstanding = this.outstandingLatencyProbes.get(client.sessionId);
      if (outstanding?.probeId !== probeId) return;
      this.outstandingLatencyProbes.delete(client.sessionId);
      this.publishLatency(client.sessionId, -1);
      this.sendLatencyProbe(client);
    }, LATENCY_PROBE_TIMEOUT_MS);
    this.outstandingLatencyProbes.set(client.sessionId, { probeId, sentAt, timeout });
  }

  private scheduleLatencyProbe(client: Client, delayMs: number): void {
    this.scheduledLatencyProbes.get(client.sessionId)?.clear();
    const timer = this.clock.setTimeout(() => {
      this.scheduledLatencyProbes.delete(client.sessionId);
      this.sendLatencyProbe(client);
    }, delayMs);
    this.scheduledLatencyProbes.set(client.sessionId, timer);
  }

  private clearLatencyConnection(sessionId: string): void {
    this.scheduledLatencyProbes.get(sessionId)?.clear();
    this.scheduledLatencyProbes.delete(sessionId);
    this.outstandingLatencyProbes.get(sessionId)?.timeout.clear();
    this.outstandingLatencyProbes.delete(sessionId);
    this.latencySamples.delete(sessionId);
    this.connectionClients.delete(sessionId);
    this.publishLatency(sessionId, -1);
  }

  private clearAllLatencyConnections(): void {
    for (const timer of this.scheduledLatencyProbes.values()) timer.clear();
    for (const probe of this.outstandingLatencyProbes.values()) probe.timeout.clear();
    this.scheduledLatencyProbes.clear();
    this.outstandingLatencyProbes.clear();
    this.latencySamples.clear();
    this.connectionClients.clear();
    this.state.displayLatencyMs = -1;
    for (const player of this.state.players.values()) player.latencyMs = -1;
  }

  private publishLatency(sessionId: string, latencyMs: number): void {
    if (sessionId === this.displaySessionId) {
      this.state.displayLatencyMs = latencyMs;
      return;
    }
    const player = this.state.players.get(sessionId);
    if (player !== undefined) player.latencyMs = latencyMs;
  }

  private findAvailableRole(): CrewRole | undefined {
    const occupied = new Set([...this.state.players.values()].map((player) => player.role));
    return CREW_ROLES.find((role) => !occupied.has(role));
  }

  private removeController(playerId: string): void {
    this.clearLatencyConnection(playerId);
    this.state.players.delete(playerId);
    this.connectionRoles.delete(playerId);
    this.sequenceWatermarks.delete(playerId);
    this.upgradeJournals.delete(playerId);
    if (this.firstControllerJoined && this.state.players.size === 0 && !this.disposing) {
      this.setLifecycleDeadline(
        "controllers_expired",
        Date.now() + zeroControllerTtlSeconds * 1_000
      );
    }
    this.queueMetadataUpdate();
  }

  private startSimulation(): void {
    this.stopSimulation();
    this.simulationTimer = this.clock.setInterval(() => {
      this.advanceGameStep();
    }, this.gameConfig.fixedStepMs);
  }

  private stopSimulation(): void {
    this.simulationTimer?.clear();
    this.simulationTimer = undefined;
  }

  private armWaveDeadline(now = Date.now()): void {
    this.clearWaveDeadline();
    if (this.state.phase !== "active" || this.gameState?.encounterPhase !== "combat") return;
    this.waveDeadlineAtMs = now + waveTtlSeconds * 1_000;
    this.scheduleWaveDeadline(this.waveDeadlineGeneration);
  }

  private scheduleWaveDeadline(generation: number): void {
    const deadline = this.waveDeadlineAtMs;
    if (deadline === undefined || generation !== this.waveDeadlineGeneration || this.disposing) {
      return;
    }
    this.waveDeadlineTimer = this.clock.setTimeout(
      () => {
        if (generation !== this.waveDeadlineGeneration || this.disposing) return;
        this.waveDeadlineTimer = undefined;
        if (!this.expireWaveDeadlineIfDue(Date.now())) {
          this.scheduleWaveDeadline(generation);
        }
      },
      Math.max(1, deadline - Date.now())
    );
  }

  private expireWaveDeadlineIfDue(now: number): boolean {
    const deadline = this.waveDeadlineAtMs;
    if (deadline === undefined || now < deadline) return false;
    if (this.state.phase !== "active" || this.gameState?.encounterPhase !== "combat") {
      this.clearWaveDeadline();
      return false;
    }
    this.gameState = failWaveByTimeout(this.gameState);
    this.clearWaveDeadline();
    this.neutralizeAllRoles();
    this.syncGameState();
    this.enterTerminalResultLifecycle();
    this.updateStatusFromRoom();
    this.queueMetadataUpdate();
    return true;
  }

  private clearWaveDeadline(): void {
    this.waveDeadlineGeneration += 1;
    this.waveDeadlineTimer?.clear();
    this.waveDeadlineTimer = undefined;
    this.waveDeadlineAtMs = undefined;
  }

  private enterTerminalResultLifecycle(): void {
    this.stopSimulation();
    for (const player of this.state.players.values()) player.ready = false;
    this.setLifecycleDeadline("result_expired", Date.now() + resultTtlSeconds * 1_000);
  }

  private setLifecycleDeadline(reason: LifecycleDeadlineReason, expiresAtMs: number): void {
    this.lifecycleDeadlines.set(reason, expiresAtMs);
    this.rescheduleLifecycle();
  }

  private clearLifecycleDeadline(reason: LifecycleDeadlineReason): void {
    if (!this.lifecycleDeadlines.delete(reason)) return;
    this.rescheduleLifecycle();
  }

  private rescheduleLifecycle(): void {
    this.lifecycleGeneration += 1;
    const generation = this.lifecycleGeneration;
    this.lifecycleTimer?.clear();
    this.lifecycleTimer = undefined;
    if (this.disposing) return;
    const next = this.nextLifecycleDeadline();
    if (next === undefined) return;
    this.lifecycleTimer = this.clock.setTimeout(
      () => {
        if (this.disposing || generation !== this.lifecycleGeneration) return;
        this.lifecycleTimer = undefined;
        const expired = this.nextLifecycleDeadline(Date.now());
        if (expired === undefined) {
          this.rescheduleLifecycle();
          return;
        }
        this.disposeOnce(expired.reason);
      },
      Math.max(1, next.expiresAtMs - Date.now())
    );
  }

  private nextLifecycleDeadline(expiredAtOrBeforeMs?: number): LifecycleDeadline | undefined {
    const deadlines = [...this.lifecycleDeadlines].map(([reason, expiresAtMs]) => ({
      reason,
      expiresAtMs
    }));
    const eligible =
      expiredAtOrBeforeMs === undefined
        ? deadlines
        : deadlines.filter(({ expiresAtMs }) => expiresAtMs <= expiredAtOrBeforeMs);
    return eligible.sort(compareLifecycleDeadlines)[0];
  }

  private disposeOnce(reason: RoomClosingReason): void {
    if (this.disposing) return;
    this.disposing = true;
    this.updateStatus("closing");
    this.queueMetadataUpdate();
    this.broadcast(serverMessage.roomClosing, { reason });
    this.cleanupResources();
    // `onLeave()` is part of Colyseus' disconnect lifecycle. Awaiting the
    // room-wide disconnect from inside that callback deadlocks on the client
    // that initiated the consented leave, so initiate it and let onLeave return.
    void this.disconnect();
  }

  private cleanupResources(): void {
    this.lifecycleGeneration += 1;
    this.lifecycleTimer?.clear();
    this.lifecycleTimer = undefined;
    this.lifecycleDeadlines.clear();
    this.clearWaveDeadline();
    this.stopSimulation();
    this.clearAllLatencyConnections();
    this.sequenceWatermarks.clear();
    this.upgradeJournals.clear();
    this.connectionClients.clear();
    this.connectionRoles.clear();
    this.displaySessionId = undefined;
  }

  private updateStatusFromRoom(): void {
    if (this.disposing) {
      this.updateStatus("closing");
    } else if (this.lifecycleDeadlines.has("display_reconnect_expired")) {
      this.updateStatus("display_grace");
    } else if (this.state.phase === "lobby") {
      this.updateStatus("lobby");
    } else {
      this.updateStatus(this.gameState?.encounterPhase ?? "combat");
    }
  }

  private updateStatus(status: RoomStatsStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusChangedAtMs = Date.now();
  }

  private queueMetadataUpdate(): void {
    if (this.statsId.length === 0) return;
    this.pendingMetadata = this.createStatsMetadata();
    if (this.metadataWritePromise !== undefined) return;
    const write = this.flushMetadataWrites();
    this.metadataWritePromise = write;
    void write.then(() => {
      if (this.metadataWritePromise !== write) return;
      this.metadataWritePromise = undefined;
      if (this.pendingMetadata !== undefined) this.queueMetadataUpdate();
    });
  }

  private async flushMetadataWrites(): Promise<void> {
    while (this.pendingMetadata !== undefined) {
      const metadata = this.pendingMetadata;
      this.pendingMetadata = undefined;
      try {
        await this.setMetadata(metadata);
      } catch {
        // Statistics are operational diagnostics and must never affect gameplay.
      }
    }
  }

  private createStatsMetadata(): RoomStatsMetadata {
    let connectedPlayers = 0;
    let reservedPlayers = 0;
    for (const player of this.state.players.values()) {
      if (player.connected) connectedPlayers += 1;
      else reservedPlayers += 1;
    }
    return {
      statsId: this.statsId,
      status: this.status,
      connectedPlayers,
      reservedPlayers,
      capacity: PLAYER_CAPACITY,
      displayConnected: this.state.displayConnected,
      createdAtMs: this.createdAtMs,
      statusChangedAtMs: this.statusChangedAtMs,
      expiresAtMs: this.nextLifecycleDeadline()?.expiresAtMs ?? null
    };
  }

  private hasProtocolMismatch(payload: unknown): boolean {
    return (
      typeof payload === "object" &&
      payload !== null &&
      "protocolVersion" in payload &&
      (payload as { protocolVersion?: unknown }).protocolVersion !== PROTOCOL_VERSION
    );
  }

  private sendError(client: Client, code: ServerErrorCode, message: string): void {
    client.send(serverMessage.error, { code, message });
  }
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const upper = ordered[middle];
  if (upper === undefined) return -1;
  if (ordered.length % 2 === 1) return upper;
  const lower = ordered[middle - 1];
  return lower === undefined ? upper : Math.round((lower + upper) / 2);
}

function compareLifecycleDeadlines(left: LifecycleDeadline, right: LifecycleDeadline): number {
  if (left.expiresAtMs !== right.expiresAtMs) return left.expiresAtMs - right.expiresAtMs;
  return lifecycleReasonPriority(left.reason) - lifecycleReasonPriority(right.reason);
}

function lifecycleReasonPriority(reason: LifecycleDeadlineReason): number {
  if (reason === "display_reconnect_expired") return 0;
  if (reason === "room_lifetime_expired") return 1;
  if (reason === "lobby_expired" || reason === "result_expired") return 2;
  return 3;
}

function createRunSeed(excluded?: number): number {
  let seed = randomInt(1, UINT32_EXCLUSIVE_MAX);
  while (seed === excluded) seed = randomInt(1, UINT32_EXCLUSIVE_MAX);
  return seed;
}

function upgradeFingerprint(command: UpgradeChooseCommand): string {
  return [
    command.protocolVersion,
    command.roomId,
    command.playerId,
    command.runNumber,
    command.waveNumber,
    command.offerId,
    command.upgradeId
  ].join("\u001f");
}

function upgradeErrorMessage(outcome: Exclude<UpgradeJournalEntry["outcome"], "accepted">): string {
  return outcome === "already_chosen"
    ? "This role already selected an upgrade."
    : "Upgrade offer is no longer available.";
}

interface KeyedSchemaCollection<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): unknown;
  delete(key: string): boolean;
  keys(): IterableIterator<string>;
}

function reconcileKeyed<TCore extends { readonly id: string }, TState>(
  target: KeyedSchemaCollection<TState>,
  source: readonly TCore[],
  create: () => TState,
  update: (target: TState, source: TCore) => void
): void {
  const liveIds = new Set(source.map(({ id }) => id));
  for (const entityId of [...target.keys()]) {
    if (!liveIds.has(entityId)) target.delete(entityId);
  }
  for (const entity of source) {
    let state = target.get(entity.id);
    if (state === undefined) {
      state = create();
      target.set(entity.id, state);
    }
    update(state, entity);
  }
}

function syncRoleModifiers(
  target: SpaceshipDefenderState["game"]["roleModifiers"],
  source: RoleModifiers
) {
  target.pilot.speedMultiplier = source.pilot.speedMultiplier;
  target.pilot.accelerationMultiplier = source.pilot.accelerationMultiplier;
  target.pilot.maxHpBonus = source.pilot.maxHpBonus;
  target.gunner.damageMultiplier = source.gunner.damageMultiplier;
  target.gunner.cooldownMultiplier = source.gunner.cooldownMultiplier;
  target.gunner.projectileSpeedMultiplier = source.gunner.projectileSpeedMultiplier;
  target.shield.capacityBonus = source.shield.capacityBonus;
  target.shield.rechargeMultiplier = source.shield.rechargeMultiplier;
  target.shield.arcWidthBonus = source.shield.arcWidthBonus;
}

function syncEnemy(target: EnemyState, source: CombatEnemyState): void {
  target.entityId = source.id;
  target.spawnSequence = source.spawnSequence;
  target.kind = source.kind;
  target.x = source.x;
  target.y = source.y;
  target.velocityX = source.velocity.x;
  target.velocityY = source.velocity.y;
  target.radius = source.radius;
  target.heading = source.heading;
  target.hp = source.hp;
  target.maxHp = source.maxHp;
}

function syncAsteroid(target: AsteroidState, source: CoreAsteroidState): void {
  target.entityId = source.id;
  target.spawnSequence = source.spawnSequence;
  target.x = source.x;
  target.y = source.y;
  target.velocityX = source.velocity.x;
  target.velocityY = source.velocity.y;
  target.radius = source.radius;
  target.hp = source.hp;
  target.maxHp = source.maxHp;
}

function syncProjectile(
  target: ProjectileState,
  source: CoreProjectileState | HostileProjectileState,
  kind: "friendly" | "hostile"
): void {
  target.entityId = source.id;
  target.spawnSequence = source.spawnSequence;
  target.kind = kind;
  target.x = source.x;
  target.y = source.y;
  target.velocityX = source.velocity.x;
  target.velocityY = source.velocity.y;
  target.radius = source.radius;
  target.source = kind === "friendly" ? (source as CoreProjectileState).source : "";
}

function syncHomingMissile(target: HomingMissileState, source: CoreHomingMissileState): void {
  target.entityId = source.id;
  target.spawnSequence = source.spawnSequence;
  target.x = source.x;
  target.y = source.y;
  target.velocityX = source.velocity.x;
  target.velocityY = source.velocity.y;
  target.radius = source.radius;
  target.heading = source.heading;
}

function syncControllerUpgrade(
  target: ControllerUpgradeState,
  offer: RoleUpgradeOffer,
  selection: RoleUpgradeSelection | null
): void {
  target.status = selection === null ? "available" : "selected";
  target.offer.offerId = offer.offerId;
  target.offer.role = offer.role;
  target.offer.waveNumber = offer.waveNumber;
  for (const [index, source] of offer.cards.entries()) {
    while (target.offer.cards.length <= index) target.offer.cards.push(new UpgradeCardState());
    const card = target.offer.cards.at(index);
    card.upgradeId = source.upgradeId;
    card.label = source.label;
    card.value = source.value;
  }
  while (target.offer.cards.length > offer.cards.length) target.offer.cards.pop();
  target.hasSelection = selection !== null;
  if (selection !== null) {
    target.selection.offerId = selection.offerId;
    target.selection.upgradeId = selection.upgradeId;
    target.selection.role = selection.role;
    target.selection.source = selection.source;
  }
}
