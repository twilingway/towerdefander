import {
  PROTOCOL_VERSION,
  clientMessage,
  joinOptionsSchema,
  readyCommandSchema,
  serverMessage,
  signalCommandSchema,
  type ServerErrorCode
} from "@town-defenders/protocol";
import { CloseCode, Room, ServerError, type Client } from "colyseus";

import { readServerConfig } from "../config.js";
import { PlayerState, TownDefendersState } from "./TownDefendersState.js";

type ConnectionRole = "display" | "controller";

interface RuntimeSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

const { reconnectionGraceSeconds } = readServerConfig();

export class TownDefendersRoom extends Room<{ state: TownDefendersState }> {
  // One spare transport seat lets onJoin return a typed room_full error.
  override maxClients = 4;
  override maxMessagesPerSecond = 20;
  override state = new TownDefendersState();

  private readonly roles = new Map<string, ConnectionRole>();
  private readonly appliedActions = new Set<string>();

  override messages = {
    [clientMessage.ready]: (client: Client, payload: unknown) => {
      this.handleReady(client, payload);
    },
    [clientMessage.signal]: (client: Client, payload: unknown) => {
      this.handleSignal(client, payload);
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
      this.state.displayConnected = true;
      return;
    }

    if (this.state.players.size >= 2) {
      throw new ServerError(4001, "room_full");
    }

    const player = new PlayerState();
    player.playerId = client.sessionId;
    player.playerName = result.data.playerName;

    this.roles.set(client.sessionId, "controller");
    this.state.players.set(client.sessionId, player);
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
    }
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

  handleSignal(client: Client, unsafePayload: unknown): void {
    const payload = this.parseMessage(client, signalCommandSchema, unsafePayload);
    if (payload === undefined) {
      return;
    }

    const player = this.getController(client);
    if (player === undefined) {
      return;
    }

    if (this.state.phase !== "active") {
      this.sendError(client, "invalid_phase", "Signals are accepted only in an active room.");
      return;
    }

    if (this.appliedActions.has(payload.actionId)) {
      return;
    }

    this.appliedActions.add(payload.actionId);
    player.signalCount += 1;
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

    const canStart = [...this.state.players.values()].every(
      (player) => player.connected && player.ready
    );

    if (canStart) {
      this.state.phase = "active";
    }
  }

  private sendError(client: Client, code: ServerErrorCode, message: string): void {
    client.send(serverMessage.error, { code, message });
  }
}
