import {
  advanceFlyingCastle,
  applyGunnerInput,
  applyPilotInput,
  applyShieldInput,
  cancelQueuedFire,
  createFlyingCastleConfig,
  createFlyingCastleState,
  deactivateShield,
  type FlyingCastleConfig,
  type FlyingCastleState
} from "@town-defenders/game-core";
import {
  CREW_ROLES,
  PLAYER_CAPACITY,
  PROTOCOL_VERSION,
  clientMessage,
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

const { reconnectionGraceSeconds } = readServerConfig();
const flyingCastleConfig = createFlyingCastleConfig();

const DECORATIVE_OBSTACLES = [
  { obstacleId: "island-west", kind: "circle" as const, x: 420, y: 430, radius: 105 },
  {
    obstacleId: "ruins-north",
    kind: "rectangle" as const,
    x: 1120,
    y: 260,
    width: 250,
    height: 120
  },
  {
    obstacleId: "cloud-bank",
    kind: "rectangle" as const,
    x: 1780,
    y: 620,
    width: 330,
    height: 150
  },
  { obstacleId: "island-south", kind: "circle" as const, x: 820, y: 1270, radius: 135 },
  {
    obstacleId: "ruins-east",
    kind: "rectangle" as const,
    x: 1990,
    y: 1260,
    width: 220,
    height: 180
  }
] as const;

export class TownDefendersRoom extends Room<{ state: TownDefendersState }> {
  override maxClients = PLAYER_CAPACITY + 2;
  override maxMessagesPerSecond = 20;
  override state = new TownDefendersState();

  private readonly connectionRoles = new Map<string, ConnectionRole>();
  private readonly sequenceWatermarks = new Map<string, Map<InputMessageType, number>>();
  private displaySessionId: string | undefined;
  private gameConfig: FlyingCastleConfig = flyingCastleConfig;
  private gameState: FlyingCastleState | undefined;
  private simulationTimer: RoomTimer | undefined;

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
  }

  override async onLeave(client: Client, code: number): Promise<void> {
    const connectionRole = this.connectionRoles.get(client.sessionId);
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
    } catch {
      this.removeController(client.sessionId);
    }
  }

  override onDispose(): void {
    this.stopSimulation();
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
      this.gameState = applyGunnerInput(this.gameState, {
        vector: { x: 0, y: 0 },
        firing: false,
        receivedTick
      });
      this.gameState = cancelQueuedFire(this.gameState);
    } else if (role === "shield") {
      this.gameState = applyShieldInput(this.gameState, {
        vector: { x: 0, y: 0 },
        active: false,
        receivedTick
      });
      this.gameState = deactivateShield(this.gameState);
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

  private findAvailableRole(): CrewRole | undefined {
    const occupied = new Set([...this.state.players.values()].map((player) => player.role));
    return CREW_ROLES.find((role) => !occupied.has(role));
  }

  private removeController(playerId: string): void {
    this.state.players.delete(playerId);
    this.connectionRoles.delete(playerId);
    this.sequenceWatermarks.delete(playerId);
  }

  private async disposeHeadlessRoom(displayId: string): Promise<void> {
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
