import {
  advanceFlyingCastle,
  applyGunnerInput,
  applyPilotInput,
  applyShieldInput,
  cancelGunnerControl,
  cancelShieldControl,
  createFlyingCastleConfig,
  createFlyingCastleState,
  type FlyingCastleConfig,
  type FlyingCastleState
} from "@town-defenders/game-core";
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
  type CrewRole,
  type GunnerInputCommand,
  type PilotInputCommand,
  type ServerErrorCode,
  type ShieldInputCommand
} from "@town-defenders/protocol";
import { StateView } from "@colyseus/schema";
import { CloseCode, Room, ServerError, type Client } from "colyseus";

import { readServerConfig } from "../config.js";
import {
  ObstacleState,
  PlayerState,
  ProjectileState,
  TownDefendersState
} from "./TownDefendersState.js";

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

const LATENCY_PROBE_INTERVAL_MS = 2_000;
const LATENCY_PROBE_TIMEOUT_MS = 5_000;
const MAX_LATENCY_SAMPLE_MS = 5_000;
const MAX_LATENCY_SAMPLES = 5;

const { reconnectionGraceSeconds } = readServerConfig();
const flyingCastleConfig = createFlyingCastleConfig();

const DECORATIVE_OBSTACLES = [
  { obstacleId: "island-northwest", kind: "circle" as const, x: 620, y: 540, radius: 105 },
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
    x: 3950,
    y: 650,
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
  { obstacleId: "island-center-east", kind: "circle" as const, x: 2820, y: 1800, radius: 90 },
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

export class TownDefendersRoom extends Room<{ state: TownDefendersState }> {
  override maxClients = PLAYER_CAPACITY + 2;
  override maxMessagesPerSecond = 25;
  override state = new TownDefendersState();

  private readonly connectionRoles = new Map<string, ConnectionRole>();
  private readonly sequenceWatermarks = new Map<string, Map<InputMessageType, number>>();
  private readonly connectionClients = new Map<string, Client>();
  private readonly latencySamples = new Map<string, number[]>();
  private readonly outstandingLatencyProbes = new Map<string, OutstandingLatencyProbe>();
  private readonly scheduledLatencyProbes = new Map<string, RoomTimer>();
  private displaySessionId: string | undefined;
  private gameConfig: FlyingCastleConfig = flyingCastleConfig;
  private gameState: FlyingCastleState | undefined;
  private simulationTimer: RoomTimer | undefined;
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
  }

  override onJoin(client: Client, unsafeOptions: unknown): void {
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
    player.ready = this.state.phase === "active";
    this.connectionRoles.set(client.sessionId, "controller");
    this.sequenceWatermarks.set(client.sessionId, new Map());
    this.state.players.set(client.sessionId, player);
    this.registerLatencyConnection(client);
  }

  override async onLeave(client: Client, code: number): Promise<void> {
    const connectionRole = this.connectionRoles.get(client.sessionId);
    this.clearLatencyConnection(client.sessionId);
    if (connectionRole === "display") {
      this.state.displayConnected = false;
      if (code === CloseCode.CONSENTED) {
        await this.disposeHeadlessRoom(client.sessionId);
        return;
      }
      try {
        const reconnected = await this.allowReconnection(client, reconnectionGraceSeconds);
        this.connectionRoles.set(reconnected.sessionId, "display");
        this.displaySessionId = reconnected.sessionId;
        this.state.displayConnected = true;
        this.registerLatencyConnection(reconnected);
      } catch {
        await this.disposeHeadlessRoom(client.sessionId);
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
    if (code === CloseCode.CONSENTED) {
      this.removeController(client.sessionId);
      return;
    }

    try {
      const reconnected = await this.allowReconnection(client, reconnectionGraceSeconds);
      player.connected = true;
      this.connectionRoles.set(reconnected.sessionId, "controller");
      this.sequenceWatermarks.set(reconnected.sessionId, new Map());
      this.registerLatencyConnection(reconnected);
    } catch {
      this.removeController(client.sessionId);
    }
  }

  override onDispose(): void {
    this.stopSimulation();
    this.clearAllLatencyConnections();
  }

  handleReady(client: Client, unsafePayload: unknown): void {
    const command = this.parseControllerCommand(client, unsafePayload, readyCommandSchema);
    if (command === undefined) {
      return;
    }
    if (this.state.phase !== "lobby") {
      this.sendError(client, "invalid_phase", "Ready is only available in the lobby.");
      return;
    }
    const player = this.state.players.get(client.sessionId);
    if (player === undefined) {
      this.sendError(client, "identity_mismatch", "Player identity does not match connection.");
      return;
    }
    player.ready = true;
    this.tryStartGame();
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
    this.gameState = advanceFlyingCastle(this.gameState, this.gameConfig);
    this.syncGameState();
  }

  private parseRoleInput<T extends PilotInputCommand | GunnerInputCommand | ShieldInputCommand>(
    client: Client,
    unsafePayload: unknown,
    schema: RuntimeSchema<T>,
    role: CrewRole,
    messageType: InputMessageType
  ): T | undefined {
    const command = this.parseControllerCommand(client, unsafePayload, schema);
    if (command === undefined) {
      return undefined;
    }
    const player = this.state.players.get(client.sessionId);
    if (player?.role !== role) {
      this.sendError(client, "role_mismatch", `Only ${role} may send this input.`);
      return undefined;
    }
    if (this.state.phase !== "active" || this.gameState === undefined) {
      this.sendError(client, "invalid_phase", "Gameplay input requires an active match.");
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
    schema: RuntimeSchema<T>
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
    const envelope = result.data as { roomId: string; playerId: string };
    if (envelope.roomId !== this.roomId || envelope.playerId !== client.sessionId) {
      this.sendError(
        client,
        "identity_mismatch",
        "Room or player identity does not match connection."
      );
      return undefined;
    }
    return result.data;
  }

  private tryStartGame(): void {
    if (this.state.phase !== "lobby" || this.state.players.size !== PLAYER_CAPACITY) {
      return;
    }
    const players = [...this.state.players.values()];
    if (!players.every((player) => player.connected && player.ready)) {
      return;
    }
    this.gameConfig = createFlyingCastleConfig();
    this.gameState = createFlyingCastleState(this.gameConfig);
    this.state.phase = "active";
    this.state.hasGame = true;
    this.initializeDecorations();
    this.syncGameState();
    this.simulationTimer = this.clock.setInterval(() => {
      this.advanceGameStep();
    }, this.gameConfig.fixedStepMs);
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
    target.castle.x = game.castle.x;
    target.castle.y = game.castle.y;
    target.castle.velocityX = game.castle.velocity.x;
    target.castle.velocityY = game.castle.velocity.y;
    target.castle.radius = this.gameConfig.castleRadius;
    target.turretAngle = game.turretAngle;
    target.shield.angle = game.shieldAngle;
    target.shield.active = game.shieldActive;
    target.shield.energy = game.shieldEnergy;
    target.shield.capacity = this.gameConfig.shieldCapacity;
    target.display.projectiles.clear();
    for (const projectile of game.projectiles) {
      const state = new ProjectileState();
      state.projectileId = projectile.projectileId;
      state.x = projectile.x;
      state.y = projectile.y;
      state.velocityX = projectile.velocity.x;
      state.velocityY = projectile.velocity.y;
      state.radius = this.gameConfig.projectileRadius;
      target.display.projectiles.push(state);
    }
  }

  private neutralizeRole(playerId: string): void {
    if (this.gameState === undefined) {
      return;
    }
    const role = this.state.players.get(playerId)?.role;
    const receivedTick = this.gameState.clock.tick;
    if (role === "pilot") {
      this.gameState = applyPilotInput(this.gameState, { vector: { x: 0, y: 0 }, receivedTick });
    } else if (role === "gunner") {
      this.gameState = cancelGunnerControl(this.gameState);
    } else if (role === "shield") {
      this.gameState = cancelShieldControl(this.gameState);
    }
    this.syncGameState();
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
  }

  private async disposeHeadlessRoom(displayId: string): Promise<void> {
    this.clearLatencyConnection(displayId);
    this.connectionRoles.delete(displayId);
    this.displaySessionId = undefined;
    this.stopSimulation();
    await this.disconnect();
  }

  private stopSimulation(): void {
    this.simulationTimer?.clear();
    this.simulationTimer = undefined;
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
