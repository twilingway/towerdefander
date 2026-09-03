import { Client, type Room } from "@colyseus/sdk";
import {
  CREW_ROLES,
  PROTOCOL_VERSION,
  clientMessage,
  roomClosingSchema,
  serverLatencyProbeSchema,
  serverErrorSchema,
  serverMessage,
  type ControllerRoomView,
  type CrewRole,
  type CrewSize,
  type UpgradeId
} from "@spaceship-defender/protocol";
import {
  createDefaultGameServerUrl,
  formatLatency,
  isPreviewMode,
  readStringEnvironment,
  roleLabel,
  type PreviewPhase
} from "@spaceship-defender/client-shared";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createScreenWakeLock,
  enterImmersiveMode,
  readImmersiveHost,
  type ScreenWakeLock
} from "./immersiveMode.js";
import { createPreviewRoomView, previewPlayerId } from "./previewMode.js";
import {
  clearReconnectionSession,
  leaveControllerRoom,
  readReconnectionSession,
  saveReconnectionSession
} from "./reconnectionSession.js";
import {
  findCurrentPlayer,
  getRoomFromLocation,
  toControllerRoomView,
  type NetworkRoomState
} from "./roomView.js";
import { JoinScreen } from "./screens/JoinScreen/index.js";
import { LobbyScreen } from "./screens/LobbyScreen/index.js";
import { RoleScreen } from "./screens/RoleScreen/index.js";
import type { ControlState } from "./model/control.js";
import { PreviewControls } from "./components/PreviewControls/index.js";
import { RunResultPanel } from "./components/RunResultPanel/index.js";
import { TeamUpgradePanel } from "./components/TeamUpgradePanel/index.js";
import { readBrowserSearch, readSessionStorage } from "./model/browser.js";
import { toJoinError, toServerError } from "./model/errors.js";
import { playCardPhaseModifier, shellPhaseModifier } from "./model/shellClass.js";

type ControllerRoom = Room<unknown, NetworkRoomState>;
type ConnectionStatus = "join" | "joining" | "connected" | "reconnecting" | "disconnected";

const gameServerUrl = readStringEnvironment(
  import.meta.env.VITE_GAME_SERVER_URL,
  createDefaultGameServerUrl()
);

export function ControllerApp() {
  const roomReference = useRef<ControllerRoom | undefined>(undefined);
  const consentedLeaveReference = useRef<ControllerRoom | undefined>(undefined);
  const wakeLockReference = useRef<ScreenWakeLock | undefined>(undefined);
  wakeLockReference.current ??= createScreenWakeLock();
  const [roomCode, setRoomCode] = useState(() => getRoomFromLocation(readBrowserSearch()));
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("join");
  const [view, setView] = useState<ControllerRoomView>();
  const [error, setError] = useState("");
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const [errorEpoch, setErrorEpoch] = useState(0);
  const [previewRole, setPreviewRole] = useState<CrewRole>("pilot");
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>("combat");
  const [previewCrewSize, setPreviewCrewSize] = useState<CrewSize>(3);
  const preview = isPreviewMode(readBrowserSearch(), import.meta.env.DEV);
  // Dropping to a smaller crew takes the later seats away, so the role follows
  // the fixture back to the pilot instead of pointing at a player who is gone.
  const previewSeat = CREW_ROLES.slice(0, previewCrewSize).includes(previewRole)
    ? previewRole
    : "pilot";
  // Layout preview feeds the same view state the network fills, so every screen
  // renders through the production components instead of a second copy.
  const previewView = useMemo(
    () => (preview ? createPreviewRoomView(previewSeat, previewPhase, previewCrewSize) : undefined),
    [preview, previewCrewSize, previewPhase, previewSeat]
  );
  const activeView = previewView ?? view;
  const activeStatus: ConnectionStatus = previewView === undefined ? status : "connected";
  const currentPlayer = findCurrentPlayer(
    activeView,
    previewView === undefined ? playerId : previewPlayerId(previewSeat)
  );
  const connectedToRoom = status === "connected" || status === "reconnecting";
  const inLobby = activeView?.phase === "lobby";
  const inCombat = activeView?.game?.encounter.phase === "combat";

  useEffect(() => {
    if (preview) return;
    let disposed = false;
    const storage = readSessionStorage();
    const session = storage === undefined ? undefined : readReconnectionSession(storage);
    if (session?.endpoint === gameServerUrl && storage !== undefined) {
      setRoomCode(session.roomId);
      setPlayerName(session.playerName);
      setStatus("reconnecting");
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

  useEffect(() => {
    const wakeLock = wakeLockReference.current;
    if (wakeLock === undefined || !connectedToRoom) return;
    void wakeLock.acquire();
    // The browser drops a screen wake lock whenever the page is hidden and never
    // restores it, so a backgrounded controller has to take it again.
    function reacquire(): void {
      if (document.visibilityState === "visible") void wakeLock?.acquire();
    }
    document.addEventListener("visibilitychange", reacquire);
    return () => {
      document.removeEventListener("visibilitychange", reacquire);
      void wakeLock.release();
    };
  }, [connectedToRoom]);

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
    try {
      await leaveControllerRoom(room, readSessionStorage());
    } catch {
      // Local exit is final even if the closing acknowledgement was lost.
    }
  }

  if (
    previewView === undefined &&
    (status === "join" || status === "joining" || status === "disconnected")
  ) {
    return (
      <JoinScreen
        roomCode={roomCode}
        playerName={playerName}
        error={error}
        joining={status === "joining"}
        onRoomCodeChange={setRoomCode}
        onPlayerNameChange={setPlayerName}
        onSubmit={() => {
          void joinRoom();
        }}
      />
    );
  }

  // Combat hangs the exit off the network cluster instead of the card, so it
  // stays out of both thumb zones.
  const leaveRoomButton =
    activeView !== undefined && currentPlayer !== undefined ? (
      <button
        type="button"
        className="secondary-button leave-room-button"
        disabled={activeStatus === "reconnecting"}
        onClick={() => {
          void leaveRoom();
        }}
      >
        Выйти из комнаты
      </button>
    ) : null;

  return (
    <main
      className={`controller-shell${inLobby ? " controller-shell--lobby" : ""}${shellPhaseModifier(
        activeView?.game?.encounter.phase
      )}`}
    >
      {previewView !== undefined && (
        <PreviewControls
          role={previewSeat}
          phase={previewPhase}
          crewSize={previewCrewSize}
          onRoleChange={setPreviewRole}
          onPhaseChange={setPreviewPhase}
          onCrewSizeChange={setPreviewCrewSize}
        />
      )}
      <section
        className={`card play-card${inLobby ? " play-card--lobby" : ""}${playCardPhaseModifier(
          activeView?.game?.encounter.phase
        )}`}
      >
        <div className="status-row">
          <div className="room-identity">
            <p className="role-badge">
              {currentPlayer === undefined ? "Назначаем роль…" : roleLabel(currentPlayer.role)}
            </p>
            <span className="eyebrow">Комната {activeView?.roomId ?? roomCode}</span>
          </div>
          <span className="network-status">
            <span className={`connection connection--${activeStatus}`}>
              {activeStatus === "reconnecting" ? "Переподключение…" : "В сети"}
            </span>
            <span className="latency-indicator" aria-live="polite">
              До сервера{" "}
              {formatLatency(currentPlayer?.connected === true ? currentPlayer.latencyMs : null)}
            </span>
            {inCombat && leaveRoomButton}
          </span>
        </div>
        {error.length > 0 && <p className="error-message">{error}</p>}

        {activeView?.phase === "lobby" ? (
          <LobbyScreen
            view={activeView}
            currentPlayer={currentPlayer}
            reconnecting={activeStatus === "reconnecting"}
            onReady={sendReady}
          />
        ) : activeView === undefined || currentPlayer === undefined ? (
          <p>Ожидаем подтверждение роли…</p>
        ) : (
          <>
            {activeView.game?.encounter.phase === "intermission" && (
              <TeamUpgradePanel
                role={currentPlayer.role}
                teamUpgrade={activeView.game.teamUpgrade}
                credits={activeView.game.credits}
                phaseTicksRemaining={activeView.game.encounter.phaseTicksRemaining}
                reconnecting={activeStatus === "reconnecting"}
                connectionEpoch={connectionEpoch}
                errorEpoch={errorEpoch}
                onVote={sendUpgradeVote}
              />
            )}
            {activeView.game?.encounter.phase === "result" &&
              activeView.game.encounter.outcome !== null && (
                <RunResultPanel
                  outcome={activeView.game.encounter.outcome}
                  defeatReason={activeView.game.encounter.defeatReason}
                  waveNumber={activeView.game.encounter.waveNumber}
                  score={activeView.game.encounter.score}
                  players={activeView.players}
                  currentPlayer={currentPlayer}
                  reconnecting={activeStatus === "reconnecting"}
                  onRematch={sendReady}
                />
              )}
            <RoleScreen
              role={currentPlayer.role}
              crewSize={activeView.crewSize}
              helm={activeView.game?.helm}
              shield={activeView.game?.shield}
              cannon={activeView.game?.cannon}
              machineGun={activeView.game?.machineGun}
              encounterPhase={activeView.game?.encounter.phase}
              connectionDisabled={activeStatus === "reconnecting"}
              generation={`${String(activeView.runNumber)}:${String(connectionEpoch)}`}
              hidden={activeView.game?.encounter.phase !== "combat"}
              onSend={sendControl}
            />
          </>
        )}
        {!inCombat && leaveRoomButton}
      </section>
    </main>
  );
}

/**
 * Landscape phones have roughly 390 usable pixels, so combat and the voting
 * intermission each get their own compact layout instead of one tall page.
 */
/**
 * Combat and the result screen both take the whole viewport, so the shell drops
 * its centering and lets the card stretch.
 */
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
