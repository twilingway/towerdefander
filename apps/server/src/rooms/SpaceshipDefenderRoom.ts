/**
 * Over the 500-line ceiling on purpose. What could move out has moved: the state
 * mirror, latency, lifecycle deadlines, the upgrade journal, decorations and the
 * run seed all live in sibling modules. What is left is one Colyseus surface -
 * the lifecycle hooks, the message table and the handlers behind it - and those
 * share `this.clock`, `this.state` and `this.disposing` too closely to split
 * without turning the room into objects that call each other back. Splitting it
 * further would move authority around rather than clarify it.
 */
import {
  advanceSpaceshipSimulation,
  applyGunnerInput,
  applyPilotInput,
  applyShieldInput,
  cancelGunnerControl,
  cancelPilotControl,
  cancelShieldControl,
  createCleanSpaceshipRun,
  createSpaceshipSimulationConfig,
  failWaveByTimeout,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState,
  voteForTeamUpgrade
} from "@spaceship-defender/game-core";
import {
  CREW_ROLES,
  PLAYER_CAPACITY,
  PROTOCOL_VERSION,
  ROOM_REFUSED_AT_CAPACITY,
  clientMessage,
  clientLatencyPongSchema,
  displayCreateOptionsSchema,
  gunnerInputCommandSchema,
  joinOptionsSchema,
  pilotInputCommandSchema,
  readyCommandSchema,
  serverMessage,
  shieldInputCommandSchema,
  upgradeVoteCommandSchema,
  type CrewRole,
  type GunnerInputCommand,
  type PilotInputCommand,
  type RoomClosingReason,
  type ServerErrorCode,
  type ShieldInputCommand
} from "@spaceship-defender/protocol";
import { StateView } from "@colyseus/schema";
import { CloseCode, ErrorCode, Room, ServerError, matchMaker, type Client } from "colyseus";
import { randomUUID } from "node:crypto";

import { getBalanceStore } from "../balance/index.js";
import { readServerConfig } from "../config.js";
import type { RoomStatsMetadata, RoomStatsStatus } from "../stats/types.js";
import { DECORATIVE_OBSTACLES } from "./decorations.js";
import { createRunSeed } from "./runSeed.js";
import { LatencyTracker, type RoomTimer } from "./latencyTracker.js";
import { LifecycleSchedule } from "./lifecycleSchedule.js";
import { nextShieldIntent } from "./shieldAutopilot.js";
import { projectGameState } from "./stateProjection.js";
import {
  upgradeErrorMessage,
  upgradeFingerprint,
  type UpgradeJournalEntry
} from "./upgradeJournal.js";
import {
  EnemyVisualState,
  ObstacleState,
  PlayerState,
  SpaceshipDefenderState
} from "./SpaceshipDefenderState.js";

type ConnectionRole = "display" | "controller";
type InputMessageType =
  | typeof clientMessage.pilotInput
  | typeof clientMessage.gunnerInput
  | typeof clientMessage.shieldInput;

interface RuntimeSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

const MAX_UPGRADE_JOURNAL_ENTRIES = 32;

const {
  reconnectionGraceSeconds,
  lobbyTtlSeconds,
  resultTtlSeconds,
  zeroControllerTtlSeconds,
  waveTtlSeconds,
  absoluteTtlSeconds,
  maxConcurrentRooms
} = readServerConfig();

const spaceshipSimulationConfig = createSpaceshipSimulationConfig();

/**
 * One continuous stream is capped at 20 messages per second on the client, so a
 * crew of one — who drives the ship and the turret from a single connection —
 * legitimately sends twice that. Colyseus force-closes a client that crosses
 * this ceiling, so the limit follows the number of streams a seat can own,
 * plus room for ready, votes and latency pongs.
 */
const CREW_MESSAGE_CEILING = 25;
const SOLO_MESSAGE_CEILING = 50;

export class SpaceshipDefenderRoom extends Room<{
  state: SpaceshipDefenderState;
  metadata: RoomStatsMetadata;
}> {
  override maxClients = PLAYER_CAPACITY + 2;
  override maxMessagesPerSecond = CREW_MESSAGE_CEILING;
  override state = new SpaceshipDefenderState();

  private readonly connectionRoles = new Map<string, ConnectionRole>();
  private readonly sequenceWatermarks = new Map<string, Map<InputMessageType, number>>();
  private readonly connectionClients = new Map<string, Client>();
  private readonly latency = new LatencyTracker({
    sendProbe: (sessionId, probeId) => {
      this.connectionClients
        .get(sessionId)
        ?.send(serverMessage.latencyProbe, { protocolVersion: PROTOCOL_VERSION, probeId });
    },
    schedule: (callback, delayMs) => this.clock.setTimeout(callback, delayMs),
    publish: (sessionId, latencyMs) => {
      this.publishLatency(sessionId, latencyMs);
    },
    now: () => performance.now()
  });
  private readonly upgradeJournals = new Map<string, UpgradeJournalEntry[]>();
  private displaySessionId: string | undefined;
  private gameConfig: SpaceshipSimulationConfig = spaceshipSimulationConfig;
  private gameState: SpaceshipSimulationState | undefined;
  private simulationTimer: RoomTimer | undefined;
  private readonly lifecycle = new LifecycleSchedule({
    schedule: (callback, delayMs) => this.clock.setTimeout(callback, delayMs),
    now: () => Date.now(),
    onExpired: (reason) => {
      this.disposeOnce(reason);
    },
    isDisposing: () => this.disposing
  });
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
    [clientMessage.upgradeVote]: (client: Client, payload: unknown) => {
      this.handleUpgradeVote(client, payload);
    },
    [clientMessage.latencyPong]: (client: Client, payload: unknown) => {
      this.handleLatencyPong(client, payload);
    }
  };

  override onCreate(unsafeOptions: unknown): void {
    // Matchmaking forwards the message only for codes it recognises; anything
    // else reaches the client as a bare "Internal Server Error", and the join
    // screens match on this text to name the reason for the player.
    if (this.hasProtocolMismatch(unsafeOptions)) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "protocol_mismatch");
    }
    const options = displayCreateOptionsSchema.safeParse(unsafeOptions);
    if (!options.success) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "invalid_message");
    }
    // Every room in this process shares one event loop, so accepting a room past
    // the ceiling slows the tick of every room already running, not just the
    // newcomer. Refuse instead, and let the operator scale out. The count comes
    // from the matchmaker rather than a parallel tally, which cannot drift. It
    // does not yet include the room being created, so the comparison is `>=`.
    // Matchmaking only forwards the message for codes it knows; anything else
    // reaches the client as a bare "Internal Server Error".
    if (matchMaker.stats.local.roomCount >= maxConcurrentRooms) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, ROOM_REFUSED_AT_CAPACITY);
    }
    this.state.roomId = this.roomId;
    this.state.crewSize = options.data.crewSize;
    this.maxMessagesPerSecond =
      options.data.crewSize === 1 ? SOLO_MESSAGE_CEILING : CREW_MESSAGE_CEILING;
    const now = Date.now();
    this.createdAtMs = now;
    this.statusChangedAtMs = now;
    this.statsId = randomUUID();
    this.lifecycle.set("lobby_expired", now + lobbyTtlSeconds * 1_000);
    this.lifecycle.set("room_lifetime_expired", now + absoluteTtlSeconds * 1_000);
    this.queueMetadataUpdate();
  }

  override onJoin(client: Client, unsafeOptions: unknown): void {
    if (this.disposing) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "invalid_phase");
    }
    const result = joinOptionsSchema.safeParse(unsafeOptions);
    if (!result.success) {
      throw new ServerError(
        ErrorCode.APPLICATION_ERROR,
        this.hasProtocolMismatch(unsafeOptions) ? "protocol_mismatch" : "invalid_message"
      );
    }

    if (result.data.role === "display") {
      this.joinDisplay(client);
      this.registerLatencyConnection(client);
      this.lifecycle.clear("display_reconnect_expired");
      this.updateStatusFromRoom();
      this.queueMetadataUpdate();
      return;
    }

    if (this.state.players.size >= this.state.crewSize) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "room_full");
    }
    const role = this.findAvailableRole();
    if (role === undefined) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "room_full");
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
    this.lifecycle.clear("controllers_expired");
    this.registerLatencyConnection(client);
    this.queueMetadataUpdate();
  }

  override async onLeave(client: Client, code: number): Promise<void> {
    const connectionRole = this.connectionRoles.get(client.sessionId);
    this.clearLatencyConnection(client.sessionId);
    if (connectionRole === "display") {
      this.state.displayConnected = false;
      this.lifecycle.set(
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
        this.lifecycle.clear("display_reconnect_expired");
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
      this.registerLatencyConnection(reconnected);
      this.lifecycle.clear("controllers_expired");
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
      this.inputOwner("gunner"),
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

  handleUpgradeVote(client: Client, unsafePayload: unknown): void {
    const command = this.parseControllerCommand(client, unsafePayload, upgradeVoteCommandSchema);
    if (command === undefined || this.gameState === undefined) {
      return;
    }

    const player = this.state.players.get(client.sessionId);
    if (player === undefined) {
      this.sendError(client, "identity_mismatch", "Player identity does not match connection.");
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

    if (this.gameState.encounterPhase !== "intermission") {
      this.storeUpgradeOutcome(client.sessionId, {
        actionId: command.actionId,
        fingerprint,
        outcome: "invalid_phase"
      });
      this.sendError(client, "invalid_phase", "Upgrade choice requires an intermission.");
      return;
    }

    const result = voteForTeamUpgrade(this.gameState, {
      role: player.role,
      waveNumber: command.waveNumber,
      offerId: command.offerId,
      upgradeId: command.upgradeId,
      revision: command.revision
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

    this.latency.acceptPong(client.sessionId, result.data.probeId, receivedAt);
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
    this.gameState = this.applyShieldAutopilot(this.gameState);
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
    if (!canStart || this.state.players.size !== this.state.crewSize || this.disposing) {
      return;
    }
    const players = [...this.state.players.values()];
    if (!players.every((player) => player.connected && player.ready)) {
      return;
    }
    const previousSeed = this.gameState?.runSeed;
    // A run keeps the balance it started with; console edits land on the next run.
    const balance = getBalanceStore();
    this.gameConfig = balance.getActiveSimulationConfig();
    // The helm is input feel, not physics, so it rides beside the config rather
    // than inside it — and like the config, a run keeps what it started with.
    const helm = balance.getActiveTuning().helm;
    this.state.game.helm.scheme = helm.scheme;
    this.state.game.helm.headingLeadRadians = helm.headingLeadRadians;
    this.state.game.helm.stopDampening = helm.stopDampening;
    this.state.game.helm.rotateInPlaceThrottle = helm.rotateInPlaceThrottle;
    this.state.game.helm.hullAngularBrakingPerSecondSquared =
      this.gameConfig.headingAngularBrakingPerSecondSquared;
    this.gameState = createCleanSpaceshipRun(this.gameConfig, createRunSeed(previousSeed));
    this.state.runNumber += 1;
    this.state.phase = "active";
    this.state.hasGame = true;
    for (const player of players) player.ready = false;
    this.sequenceWatermarks.clear();
    for (const player of players) this.sequenceWatermarks.set(player.playerId, new Map());
    this.upgradeJournals.clear();
    this.lifecycle.clear("lobby_expired");
    this.lifecycle.clear("result_expired");
    this.initializeDecorations();
    this.publishEnemyCatalogue();
    this.armWaveDeadline();
    this.syncGameState();
    this.startSimulation();
    this.updateStatus("combat");
    this.queueMetadataUpdate();
  }

  /** The catalogue is fixed for the run, so the display receives it once at start. */
  private publishEnemyCatalogue(): void {
    const display = this.state.game.display;
    display.asteroidVisualShape = this.gameConfig.asteroidVisual?.shape ?? "";
    display.asteroidVisualScale = this.gameConfig.asteroidVisual?.modelScale ?? 1;
    display.spaceshipVisualShape = this.gameConfig.spaceshipVisual?.shape ?? "";
    display.spaceshipVisualScale = this.gameConfig.spaceshipVisual?.modelScale ?? 1;
    display.turretVisualShape = this.gameConfig.turretVisual?.shape ?? "";
    display.turretVisualScale = this.gameConfig.turretVisual?.modelScale ?? 1;
    display.turretMountX = this.gameConfig.turretVisual?.mountX ?? 0;
    display.turretMountY = this.gameConfig.turretVisual?.mountY ?? 0;
    display.turretPivotX = this.gameConfig.turretVisual?.pivotX ?? 0;
    display.turretPivotY = this.gameConfig.turretVisual?.pivotY ?? 0;
    display.shieldRadius = this.gameConfig.shieldRadius;
    const catalogue = display.enemyCatalogue;
    catalogue.clear();
    for (const [kind, archetype] of Object.entries(this.gameConfig.enemyArchetypes)) {
      const entry = new EnemyVisualState();
      entry.kind = kind;
      entry.label = archetype.label;
      entry.shape = archetype.visual.shape;
      entry.modelScale = archetype.visual.modelScale;
      entry.showHealthBar = archetype.visual.showHealthBar;
      catalogue.set(kind, entry);
    }
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
    projectGameState(this.state.game, game, this.gameConfig, this.waveDeadlineAtMs);
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
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "display_already_connected");
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
    this.latency.register(client.sessionId);
  }

  private clearLatencyConnection(sessionId: string): void {
    this.latency.clear(sessionId);
    this.connectionClients.delete(sessionId);
  }

  private clearAllLatencyConnections(): void {
    this.latency.clearAll();
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
    return this.crewRoles().find((role) => !occupied.has(role));
  }

  /** The roles this room has seats for; a smaller crew keeps the CREW_ROLES order. */
  private crewRoles(): readonly CrewRole[] {
    return CREW_ROLES.slice(0, this.state.crewSize);
  }

  /**
   * Who owns an input in this room. A solo player flies and mans the turret, so
   * the gunner stream belongs to the pilot; every other crew keeps one role per
   * input. An input nobody owns keeps its own role and therefore never matches
   * a seated player.
   */
  private inputOwner(role: CrewRole): CrewRole {
    return role === "gunner" && this.state.crewSize === 1 ? "pilot" : role;
  }

  private removeController(playerId: string): void {
    this.clearLatencyConnection(playerId);
    this.state.players.delete(playerId);
    this.connectionRoles.delete(playerId);
    this.sequenceWatermarks.delete(playerId);
    this.upgradeJournals.delete(playerId);
    if (this.firstControllerJoined && this.state.players.size === 0 && !this.disposing) {
      this.lifecycle.set("controllers_expired", Date.now() + zeroControllerTtlSeconds * 1_000);
    }
    this.queueMetadataUpdate();
  }

  /**
   * A crew without a shield operator still needs the sector up, so the room
   * feeds the same trusted intent a player would have sent.
   */
  private applyShieldAutopilot(game: SpaceshipSimulationState): SpaceshipSimulationState {
    if (this.crewRoles().includes("shield") || this.gameState?.encounterPhase !== "combat") {
      return game;
    }
    return applyShieldInput(game, nextShieldIntent(game, this.gameConfig));
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
    this.lifecycle.set("result_expired", Date.now() + resultTtlSeconds * 1_000);
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
    this.lifecycle.stop();
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
    } else if (this.lifecycle.has("display_reconnect_expired")) {
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
      expiresAtMs: this.lifecycle.next()?.expiresAtMs ?? null
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
