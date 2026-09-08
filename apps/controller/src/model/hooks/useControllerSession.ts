import { Client, type Room } from "@colyseus/sdk";
import {
  PROTOCOL_VERSION,
  clientMessage,
  roomClosingSchema,
  serverLatencyProbeSchema,
  serverErrorSchema,
  serverMessage,
  type ControllerRoomView,
  type CrewRole,
  type PublicPlayerView,
  type UpgradeId
} from "@spaceship-defender/protocol";
import {
  createDefaultGameServerUrl,
  readStringEnvironment
} from "@spaceship-defender/client-shared";
import { useEffect, useState } from "react";
import { useRef } from "react";

import { readSessionStorage } from "../browser.js";
import type { ControlState } from "../control.js";
import { toJoinError, toServerError } from "../errors.js";
import { enterImmersiveMode, readImmersiveHost } from "../immersiveMode.js";
import {
  clearReconnectionSession,
  leaveControllerRoom,
  readReconnectionSession,
  saveReconnectionSession
} from "../reconnectionSession.js";
import { findCurrentPlayer, toControllerRoomView, type NetworkRoomState } from "../roomView.js";

type ControllerRoom = Room<unknown, NetworkRoomState>;

export type ConnectionStatus = "join" | "joining" | "connected" | "reconnecting" | "disconnected";

const gameServerUrl = readStringEnvironment(
  import.meta.env.VITE_GAME_SERVER_URL,
  createDefaultGameServerUrl()
);

export interface ControllerSessionOptions {
  /** The room code the address names, used before the player has typed one. */
  readonly initialRoomCode: string;
  /** False in the layout preview: there is no room to restore or talk to. */
  readonly enabled: boolean;
  /** The room has a seat for this player; the caller moves the address. */
  readonly onSeated: (roomCode: string) => void;
  /** The seat is gone, by exit or by the room closing. */
  readonly onReleased: () => void;
}

export interface ControllerSession {
  readonly roomCode: string;
  readonly playerName: string;
  readonly playerId: string;
  readonly status: ConnectionStatus;
  readonly view: ControllerRoomView | undefined;
  readonly currentPlayer: PublicPlayerView | undefined;
  readonly error: string;
  readonly connectionEpoch: number;
  readonly errorEpoch: number;
  readonly setRoomCode: (roomCode: string) => void;
  readonly setPlayerName: (playerName: string) => void;
  readonly joinRoom: () => Promise<void>;
  readonly leaveRoom: () => Promise<void>;
  readonly sendReady: () => void;
  readonly sendControl: (sequence: number, control: ControlState, channel?: CrewRole) => void;
  readonly sendUpgradeVote: (upgradeId: UpgradeId, revision: number, actionId: string) => void;
}

/**
 * The whole network life of a controller: the restored session, the join, the
 * room's eight callbacks, and every command the panels send. It knows nothing
 * about the address - the caller moves that when a seat is granted or lost.
 */
export function useControllerSession({
  initialRoomCode,
  enabled,
  onSeated,
  onReleased
}: ControllerSessionOptions): ControllerSession {
  const roomReference = useRef<ControllerRoom | undefined>(undefined);
  const consentedLeaveReference = useRef<ControllerRoom | undefined>(undefined);
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("join");
  const [view, setView] = useState<ControllerRoomView>();
  const [error, setError] = useState("");
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const [errorEpoch, setErrorEpoch] = useState(0);
  const currentPlayer = findCurrentPlayer(view, playerId);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const storage = readSessionStorage();
    const session = storage === undefined ? undefined : readReconnectionSession(storage);
    if (session?.endpoint === gameServerUrl && storage !== undefined) {
      setRoomCode(session.roomId);
      setPlayerName(session.playerName);
      setStatus("reconnecting");
      onSeated(session.roomId);
      void new Client(gameServerUrl)
        .reconnect<NetworkRoomState>(session.token)
        .then((room) => {
          if (disposed) {
            room.reconnection.enabled = false;
            room.connection.close(1000);
          } else {
            attachRoom(room, session.playerName);
          }
        })
        .catch(() => {
          if (!disposed) {
            clearReconnectionSession(storage);
            setError("Сессию восстановить не удалось. Войдите снова.");
            setStatus("join");
          }
        });
    }
    return () => {
      disposed = true;
      const room = roomReference.current;
      roomReference.current = undefined;
      // A browser reload/unmount is recoverable: close only the transport so
      // the server keeps the role for its reconnect grace period. `leave()`
      // sends a consented departure and would race session restoration.
      room?.connection.close();
    };
  }, []);

  async function joinRoom(): Promise<void> {
    const normalizedRoomCode = roomCode.trim();
    const normalizedName = playerName.trim();
    if (normalizedRoomCode.length === 0 || normalizedName.length === 0) {
      setError("Введите код комнаты и имя.");
      return;
    }
    requestImmersiveMode();
    setStatus("joining");
    setError("");
    try {
      const room = await new Client(gameServerUrl).joinById<NetworkRoomState>(normalizedRoomCode, {
        role: "controller",
        protocolVersion: PROTOCOL_VERSION,
        playerName: normalizedName
      });
      attachRoom(room, normalizedName);
      onSeated(normalizedRoomCode);
    } catch (reason) {
      setError(toJoinError(reason));
      setStatus("join");
    }
  }

  function attachRoom(room: ControllerRoom, normalizedName: string): void {
    roomReference.current = room;
    setPlayerId(room.sessionId);
    persistReconnectionSession(room, normalizedName);
    room.onStateChange(applyRoomState);
    applyRoomState(room.state);
    room.onMessage(serverMessage.latencyProbe, (payload: unknown) => {
      const result = serverLatencyProbeSchema.safeParse(payload);
      if (!result.success) return;
      room.send(clientMessage.latencyPong, {
        protocolVersion: PROTOCOL_VERSION,
        roomId: room.roomId,
        probeId: result.data.probeId
      });
    });
    room.onMessage(serverMessage.error, (payload: unknown) => {
      const result = serverErrorSchema.safeParse(payload);
      setErrorEpoch((value) => value + 1);
      setError(
        result.success ? toServerError(result.data.code, result.data.message) : "Команда отклонена."
      );
    });
    room.onMessage(serverMessage.roomClosing, (payload: unknown) => {
      const result = roomClosingSchema.safeParse(payload);
      consentedLeaveReference.current = room;
      room.reconnection.enabled = false;
      const storage = readSessionStorage();
      if (storage !== undefined) clearReconnectionSession(storage);
      if (roomReference.current === room) roomReference.current = undefined;
      setView(undefined);
      setPlayerId("");
      setRoomCode("");
      setStatus("join");
      onReleased();
      setError(
        result.success
          ? "Комната закрыта общим экраном или по тайм-ауту. Можно подключиться к другой комнате."
          : "Комната закрыта. Можно подключиться к другой комнате."
      );
    });
    room.onDrop(() => {
      if (roomReference.current !== room) return;
      setStatus("reconnecting");
    });
    room.onReconnect(() => {
      if (roomReference.current !== room) return;
      persistReconnectionSession(room, normalizedName);
      setConnectionEpoch((value) => value + 1);
      setError("");
      setStatus("connected");
    });
    room.onError((_code, message) => {
      if (roomReference.current !== room) return;
      setError(message ?? "Ошибка соединения.");
    });
    room.onLeave(() => {
      const storage = readSessionStorage();
      if (storage !== undefined) clearReconnectionSession(storage);
      if (consentedLeaveReference.current === room) {
        consentedLeaveReference.current = undefined;
        return;
      }
      setError("Соединение закрыто. Войдите снова.");
      setStatus("disconnected");
    });
  }

  function applyRoomState(state: NetworkRoomState): void {
    const next = toControllerRoomView(state, roomReference.current?.sessionId ?? playerId);
    if (next !== undefined) {
      setView(next);
      setStatus("connected");
    }
  }

  function sendReady(): void {
    const room = roomReference.current;
    if (room === undefined || view === undefined || currentPlayer === undefined) return;
    room.send(clientMessage.ready, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: view.roomId,
      playerId: currentPlayer.playerId,
      runNumber: view.runNumber
    });
    // A restored session never passes the join form, so this tap is the only
    // gesture left to ask for fullscreen with.
    requestImmersiveMode();
  }

  function sendControl(
    sequence: number,
    control: ControlState,
    // A solo player drives two streams from one connection, so the panel names
    // the channel instead of the room deriving it from the seated role.
    channel: CrewRole = currentPlayer?.role ?? "pilot"
  ): void {
    const room = roomReference.current;
    if (room === undefined || view === undefined || currentPlayer === undefined) return;
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: view.roomId,
      playerId: currentPlayer.playerId,
      runNumber: view.runNumber,
      sequence
    } as const;
    if (channel === "pilot") {
      room.send(clientMessage.pilotInput, {
        ...envelope,
        vector: control.vector,
        mgFiring: control.mgFiring,
        // Only the tank helm carries an intent; a stick command stays exactly
        // the shape it has always been.
        ...(control.turn === null ? {} : { turn: control.turn, thrust: control.thrust ?? 0 })
      });
    } else if (channel === "gunner") {
      room.send(clientMessage.gunnerInput, {
        ...envelope,
        aim: control.vector,
        firing: control.firing
      });
    } else {
      room.send(clientMessage.shieldInput, {
        ...envelope,
        aim: control.vector,
        active: control.active
      });
    }
  }

  function sendUpgradeVote(upgradeId: UpgradeId, revision: number, actionId: string): void {
    const room = roomReference.current;
    const offer = view?.game?.teamUpgrade.offer;
    if (room === undefined || view === undefined || currentPlayer === undefined || offer == null)
      return;
    room.send(clientMessage.upgradeVote, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: view.roomId,
      playerId: currentPlayer.playerId,
      runNumber: view.runNumber,
      actionId,
      waveNumber: offer.waveNumber,
      offerId: offer.offerId,
      upgradeId,
      revision
    });
  }

  async function leaveRoom(): Promise<void> {
    const room = roomReference.current;
    if (
      room === undefined ||
      !window.confirm("Выйти из комнаты? Вашу роль смогут занять другие игроки.")
    )
      return;

    // Remove the authoritative send target first. RoleControlPanel may still be
    // unmounting, but its final neutral flush can no longer reach the room.
    roomReference.current = undefined;
    consentedLeaveReference.current = room;
    setView(undefined);
    setPlayerId("");
    setRoomCode("");
    setError("");
    setStatus("join");
    onReleased();
    try {
      await leaveControllerRoom(room, readSessionStorage());
    } catch {
      // Local exit is final even if the closing acknowledgement was lost.
    }
  }

  return {
    roomCode,
    playerName,
    playerId,
    status,
    view,
    currentPlayer,
    error,
    connectionEpoch,
    errorEpoch,
    setRoomCode,
    setPlayerName,
    joinRoom,
    leaveRoom,
    sendReady,
    sendControl,
    sendUpgradeVote
  };
}

/**
 * Fire-and-forget by design: a fullscreen prompt must never delay the command
 * the player actually tapped for, and a refusal is not a connection error.
 */
function requestImmersiveMode(): void {
  const host = readImmersiveHost();
  if (host !== undefined) void enterImmersiveMode(host);
}

function persistReconnectionSession(room: ControllerRoom, playerName: string): void {
  const storage = readSessionStorage();
  if (storage !== undefined) {
    saveReconnectionSession(storage, {
      endpoint: gameServerUrl,
      roomId: room.roomId,
      playerName,
      token: room.reconnectionToken
    });
  }
}
