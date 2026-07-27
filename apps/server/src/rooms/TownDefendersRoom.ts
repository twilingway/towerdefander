import {
  advanceDefense,
  applyDefenseAction,
  createDefenseState,
  getDefenseDamage,
  getIntermissionRemainingSeconds,
  getUpgradeCost,
  prototypeDefenseConfig,
  type DefenseAction,
  type DefenseState,
  type SectorId
} from "@town-defenders/game-core";
import {
  PROTOCOL_VERSION,
  airstrikeCommandSchema,
  clientMessage,
  joinOptionsSchema,
  readyCommandSchema,
  resourceActionCommandSchema,
  serverMessage,
  type AirstrikeCommand,
  type ResourceActionCommand,
  type ServerErrorCode
} from "@town-defenders/protocol";
import { CloseCode, Room, ServerError, type Client } from "colyseus";
import { randomInt } from "node:crypto";
import { StateView } from "@colyseus/schema";

import { readServerConfig } from "../config.js";
import {
  DefenseEnemyState,
  DefenseSectorState,
  PlayerState,
  TownDefendersState
} from "./TownDefendersState.js";

type ConnectionRole = "display" | "controller";
type ResourceActionType = Extract<DefenseAction["type"], "repair" | "upgrade">;

interface RuntimeSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

interface RoomTimer {
  clear(): void;
}

interface RejectedActionOutcome {
  readonly accepted: false;
  readonly code: ServerErrorCode;
  readonly message: string;
}

type ActionOutcome = { readonly accepted: true } | RejectedActionOutcome;

const { reconnectionGraceSeconds, simulationIntervalMs } = readServerConfig();

export class TownDefendersRoom extends Room<{ state: TownDefendersState }> {
  // One spare transport seat lets onJoin return a typed room_full error.
  override maxClients = 4;
  override maxMessagesPerSecond = 20;
  override state = new TownDefendersState();

  private readonly roles = new Map<string, ConnectionRole>();
  private readonly actionOutcomes = new Map<string, ActionOutcome>();
  private defenseState: DefenseState | undefined;
  private simulationTimer: RoomTimer | undefined;

  override messages = {
    [clientMessage.ready]: (client: Client, payload: unknown) => {
      this.handleReady(client, payload);
    },
    [clientMessage.repair]: (client: Client, payload: unknown) => {
      this.handleResourceAction(client, payload, "repair");
    },
    [clientMessage.upgrade]: (client: Client, payload: unknown) => {
      this.handleResourceAction(client, payload, "upgrade");
    },
    [clientMessage.airstrike]: (client: Client, payload: unknown) => {
      this.handleAirstrike(client, payload);
    }
  };

  override onCreate(unsafeOptions: unknown): void {
    const result = joinOptionsSchema.safeParse(unsafeOptions);
    if (!result.success || result.data.role !== "display") {
      throw new ServerError(4000, "Only the display may create a room.");
    }

    this.state.roomId = this.roomId;
  }

  override onJoin(client: Client, unsafeOptions: unknown): void {
    const result = joinOptionsSchema.safeParse(unsafeOptions);

    if (!result.success) {
      const code = this.hasProtocolMismatch(unsafeOptions)
        ? "protocol_mismatch"
        : "invalid_message";
      throw new ServerError(4000, code);
    }

    if (result.data.role === "display") {
      this.joinDisplay(client);
      return;
    }

    client.view = new StateView();

    if (this.state.players.size >= 2 || this.state.phase === "finished") {
      throw new ServerError(4001, "room_full");
    }

    const player = new PlayerState();
    player.playerId = client.sessionId;
    player.playerName = result.data.playerName;

    if (this.state.phase === "active") {
      const sectorId = this.findAvailableSector();
      if (sectorId === undefined) {
        throw new ServerError(4001, "room_full");
      }
      player.ready = true;
      player.sectorId = sectorId;
    }

    this.roles.set(client.sessionId, "controller");
    this.state.players.set(client.sessionId, player);
    this.syncDefenseState();
  }

  override async onLeave(client: Client, code: number): Promise<void> {
    const role = this.roles.get(client.sessionId);

    if (role === "display") {
      this.state.displayConnected = false;
      try {
        if (code === CloseCode.CONSENTED) {
          throw new Error("consented leave");
        }

        await this.allowReconnection(client, reconnectionGraceSeconds);
        this.state.displayConnected = true;
      } catch {
        this.roles.delete(client.sessionId);
      }
      return;
    }

    const player = this.state.players.get(client.sessionId);
    if (role !== "controller" || player === undefined) {
      return;
    }

    player.connected = false;

    try {
      if (code === CloseCode.CONSENTED) {
        throw new Error("consented leave");
      }

      await this.allowReconnection(client, reconnectionGraceSeconds);
      player.connected = true;
      this.updatePhase();
    } catch {
      this.state.players.delete(client.sessionId);
      this.roles.delete(client.sessionId);
      this.syncDefenseState();
    }
  }

  override onDispose(): void {
    this.stopSimulation();
  }

  handleReady(client: Client, unsafePayload: unknown): void {
    const payload = this.parseMessage(client, readyCommandSchema, unsafePayload);
    if (payload === undefined) {
      return;
    }

    const player = this.getController(client);
    if (player === undefined) {
      return;
    }

    if (this.state.phase !== "lobby") {
      this.sendError(client, "invalid_phase", "Ready state can only change in the lobby.");
      return;
    }

    player.ready = payload.ready;
    this.updatePhase();
  }

  handleResourceAction(
    client: Client,
    unsafePayload: unknown,
    actionType: ResourceActionType
  ): void {
    const payload = this.parseMessage(client, resourceActionCommandSchema, unsafePayload);
    if (payload === undefined) {
      return;
    }

    const player = this.getController(client);
    if (player === undefined) {
      return;
    }

    if (payload.roomId !== this.roomId || payload.playerId !== player.playerId) {
      this.sendError(client, "identity_mismatch", "Room or player identity does not match.");
      return;
    }

    const previousOutcome = this.actionOutcomes.get(payload.actionId);
    if (previousOutcome !== undefined) {
      this.replayOutcome(client, previousOutcome);
      return;
    }

    const outcome = this.applyNewResourceAction(payload, player, actionType);
    this.actionOutcomes.set(payload.actionId, outcome);
    this.replayOutcome(client, outcome);
  }

  handleAirstrike(client: Client, unsafePayload: unknown): void {
    const payload = this.parseMessage(client, airstrikeCommandSchema, unsafePayload);
    if (payload === undefined) {
      return;
    }

    const player = this.getController(client);
    if (player === undefined) {
      return;
    }
    if (payload.roomId !== this.roomId || payload.playerId !== player.playerId) {
      this.sendError(client, "identity_mismatch", "Room or player identity does not match.");
      return;
    }

    const previousOutcome = this.actionOutcomes.get(payload.actionId);
    if (previousOutcome !== undefined) {
      this.replayOutcome(client, previousOutcome);
      return;
    }

    const outcome = this.applyNewAirstrike(payload);
    this.actionOutcomes.set(payload.actionId, outcome);
    this.replayOutcome(client, outcome);
  }

  advanceGameStep(): void {
    if (this.state.phase !== "active" || this.defenseState === undefined) {
      return;
    }

    this.defenseState = advanceDefense(this.defenseState, prototypeDefenseConfig);
    this.syncDefenseState();

    if (this.defenseState.result !== "in_progress") {
      this.state.phase = "finished";
      this.stopSimulation();
    }
  }

  private joinDisplay(client: Client): void {
    const reservedDisplaySessionId = [...this.roles.entries()].find(
      ([, role]) => role === "display"
    )?.[0];
    if (
      this.state.displayConnected ||
      (reservedDisplaySessionId !== undefined && reservedDisplaySessionId !== client.sessionId)
    ) {
      throw new ServerError(4001, "room_full");
    }

    this.roles.set(client.sessionId, "display");
    client.view = new StateView();
    client.view.add(this.state.game, 1);
    this.state.displayConnected = true;
  }

  private applyNewResourceAction(
    _payload: ResourceActionCommand,
    player: PlayerState,
    actionType: ResourceActionType
  ): ActionOutcome {
    if (this.state.phase !== "active" || this.defenseState === undefined) {
      return this.rejected("invalid_phase", "Game actions are accepted only during a battle.");
    }

    const sectorId = this.toSectorId(player.sectorId);
    if (sectorId === undefined) {
      return this.rejected("action_not_available", "No sector is assigned to this player.");
    }

    const result = applyDefenseAction(this.defenseState, prototypeDefenseConfig, {
      type: actionType,
      sectorId
    });
    if (!result.accepted) {
      if (result.reason === "insufficient_funds") {
        return this.rejected("insufficient_funds", "Not enough gold in the shared treasury.");
      }
      if (result.reason === "battle_finished") {
        return this.rejected("invalid_phase", "The battle has already finished.");
      }
      return this.rejected("action_not_available", "This action is not available now.");
    }

    this.defenseState = result.state;
    this.syncDefenseState();
    return { accepted: true };
  }

  private applyNewAirstrike(payload: AirstrikeCommand): ActionOutcome {
    if (this.state.phase !== "active" || this.defenseState === undefined) {
      return this.rejected("invalid_phase", "Airstrike is accepted only during an active match.");
    }

    const result = applyDefenseAction(this.defenseState, prototypeDefenseConfig, {
      type: "airstrike",
      targetSectorId: payload.targetSectorId,
      actionId: payload.actionId,
      playerId: payload.playerId
    });
    if (!result.accepted) {
      return this.rejected("action_not_available", "Airstrike is not available for this sector.");
    }

    this.defenseState = result.state;
    this.syncDefenseState();
    return { accepted: true };
  }

  private parseMessage<T>(
    client: Client,
    schema: RuntimeSchema<T>,
    unsafePayload: unknown
  ): T | undefined {
    if (this.hasProtocolMismatch(unsafePayload)) {
      this.sendError(client, "protocol_mismatch", "Unsupported protocol version.");
      return undefined;
    }

    const result = schema.safeParse(unsafePayload);
    if (!result.success) {
      this.sendError(client, "invalid_message", "Message payload is invalid.");
      return undefined;
    }

    return result.data;
  }

  private hasProtocolMismatch(value: unknown): boolean {
    return (
      typeof value === "object" &&
      value !== null &&
      "protocolVersion" in value &&
      value.protocolVersion !== PROTOCOL_VERSION
    );
  }

  private getController(client: Client): PlayerState | undefined {
    if (this.roles.get(client.sessionId) !== "controller") {
      this.sendError(client, "not_controller", "Only controllers may perform this action.");
      return undefined;
    }

    return this.state.players.get(client.sessionId);
  }

  private updatePhase(): void {
    if (this.state.phase !== "lobby" || this.state.players.size !== 2) {
      return;
    }

    const players = [...this.state.players.values()];
    const canStart = players.every((player) => player.connected && player.ready);
    if (!canStart) {
      return;
    }

    players.forEach((player, index) => {
      player.sectorId = index;
    });
    this.defenseState = createDefenseState(prototypeDefenseConfig, randomInt(0, 2_147_483_647));
    this.state.phase = "active";
    this.syncDefenseState();
    this.startSimulation();
  }

  private startSimulation(): void {
    if (this.simulationTimer !== undefined) {
      return;
    }

    this.simulationTimer = this.clock.setInterval(() => {
      this.advanceGameStep();
    }, simulationIntervalMs);
  }

  private stopSimulation(): void {
    this.simulationTimer?.clear();
    this.simulationTimer = undefined;
  }

  private syncDefenseState(): void {
    const defenseState = this.defenseState;
    if (defenseState === undefined) {
      return;
    }

    const game = this.state.game;
    this.state.hasGame = true;
    game.tick = defenseState.clock.tick;
    game.elapsedMs = defenseState.clock.elapsedMs;
    game.treasury = defenseState.treasury;
    game.pathLength = prototypeDefenseConfig.pathLength;
    game.repairCost = prototypeDefenseConfig.repairCost;
    game.result = defenseState.result;
    game.waveNumber = defenseState.waveNumber;
    game.totalWaves = prototypeDefenseConfig.waves.length;
    game.stage = defenseState.stage;
    game.intermissionRemainingSeconds = getIntermissionRemainingSeconds(
      defenseState,
      prototypeDefenseConfig
    );
    game.airstrikeCharge = defenseState.airstrikeCharge;
    game.airstrikeChargeRequired = prototypeDefenseConfig.airstrike.chargeRequired;
    game.airstrikeDamage = prototypeDefenseConfig.airstrike.damage;
    game.lastAirstrikeSequence = defenseState.lastAirstrikeEffect?.sequence ?? 0;
    game.lastAirstrikeActionId = defenseState.lastAirstrikeEffect?.actionId ?? "";
    game.lastAirstrikePlayerId = defenseState.lastAirstrikeEffect?.playerId ?? "";
    game.lastAirstrikeTargetSectorId = defenseState.lastAirstrikeEffect?.targetSectorId ?? -1;
    game.lastAirstrikeAppliedTick = defenseState.lastAirstrikeEffect?.appliedTick ?? 0;
    game.sectors.clear();
    game.enemies.clear();

    for (const sector of defenseState.sectors) {
      const schema = new DefenseSectorState();
      schema.sectorId = sector.sectorId;
      schema.assignedPlayerId =
        [...this.state.players.values()].find((player) => player.sectorId === sector.sectorId)
          ?.playerId ?? "";
      schema.gateHealth = sector.gateHealth;
      schema.gateMaxHealth = prototypeDefenseConfig.gateMaxHealth;
      schema.defenseLevel = sector.defenseLevel;
      schema.defenseDamage = getDefenseDamage(prototypeDefenseConfig, sector.defenseLevel);
      schema.nextUpgradeCost =
        sector.defenseLevel >= prototypeDefenseConfig.maxDefenseLevel
          ? -1
          : getUpgradeCost(prototypeDefenseConfig, sector.defenseLevel);
      schema.enemyCount = defenseState.enemies.filter(
        (enemy) => enemy.sectorId === sector.sectorId
      ).length;
      schema.airstrikeTargetAvailable = schema.enemyCount > 0;
      game.sectors.push(schema);
    }

    for (const enemy of defenseState.enemies) {
      const schema = new DefenseEnemyState();
      schema.enemyId = enemy.enemyId;
      schema.sectorId = enemy.sectorId;
      schema.enemyType = enemy.enemyType;
      schema.health = enemy.health;
      schema.maxHealth = enemy.maxHealth;
      schema.progress = enemy.progress;
      game.enemies.push(schema);
    }
  }

  private findAvailableSector(): SectorId | undefined {
    const occupied = new Set(
      [...this.state.players.values()]
        .map((player) => this.toSectorId(player.sectorId))
        .filter((sectorId): sectorId is SectorId => sectorId !== undefined)
    );
    return ([0, 1] as const).find((sectorId) => !occupied.has(sectorId));
  }

  private toSectorId(value: number): SectorId | undefined {
    return value === 0 || value === 1 ? value : undefined;
  }

  private replayOutcome(client: Client, outcome: ActionOutcome): void {
    if (!outcome.accepted) {
      this.sendError(client, outcome.code, outcome.message);
    }
  }

  private rejected(code: ServerErrorCode, message: string): RejectedActionOutcome {
    return { accepted: false, code, message };
  }

  private sendError(client: Client, code: ServerErrorCode, message: string): void {
    client.send(serverMessage.error, { code, message });
  }
}
