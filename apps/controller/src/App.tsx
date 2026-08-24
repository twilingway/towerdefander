import { Client, type Room } from "@colyseus/sdk";
import {
  CREW_ROLES,
  PROTOCOL_VERSION,
  TEAM_UPGRADE_PRICE,
  clientMessage,
  roomClosingSchema,
  serverLatencyProbeSchema,
  serverErrorSchema,
  serverMessage,
  type ControllerRoomView,
  type CrewRole,
  type DefeatReason,
  type EncounterPhase,
  type PublicTeamUpgradeView,
  type PublicMachineGunView,
  type PublicRoleModifiersView,
  type PublicShieldView,
  type PublicPlayerView,
  type TerminalOutcome,
  type UpgradeId
} from "@spaceship-defender/protocol";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  getFireReleaseDelay,
  getKeyboardVector,
  getNextShieldDesiredActive,
  LatestInputScheduler,
  type ControlVector
} from "./controlInput.js";
import {
  createScreenWakeLock,
  enterImmersiveMode,
  readImmersiveHost,
  type ScreenWakeLock
} from "./immersiveMode.js";
import {
  createPreviewRoomView,
  isPreviewMode,
  previewPlayerId,
  PREVIEW_PHASES,
  type PreviewPhase
} from "./previewMode.js";
import {
  clearReconnectionSession,
  leaveControllerRoom,
  readReconnectionSession,
  saveReconnectionSession,
  type SessionStorage
} from "./reconnectionSession.js";
import {
  findCurrentPlayer,
  getRoomFromLocation,
  toControllerRoomView,
  type NetworkRoomState
} from "./roomView.js";
import { VirtualStick } from "./VirtualStick.js";
import { keepVoteIntent, nextVoteRevision, type VoteIntent } from "./voteIntent.js";
import { WaveCountdown } from "./WaveCountdown.js";
import { ActionZone } from "./ActionZone.js";

type ControllerRoom = Room<unknown, NetworkRoomState>;
type ConnectionStatus = "join" | "joining" | "connected" | "reconnecting" | "disconnected";

interface ControlState {
  readonly vector: ControlVector;
  readonly firing: boolean;
  readonly active: boolean;
  readonly mgFiring: boolean;
}

const NEUTRAL_CONTROL: ControlState = {
  vector: { x: 0, y: 0 },
  firing: false,
  active: false,
  mgFiring: false
};
const AIM_RELEASE_DELAY_MS = 60;
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
  const preview = isPreviewMode(readBrowserSearch(), import.meta.env.DEV);
  // Layout preview feeds the same view state the network fills, so every screen
  // renders through the production components instead of a second copy.
  const previewView = useMemo(
    () => (preview ? createPreviewRoomView(previewRole, previewPhase) : undefined),
    [preview, previewPhase, previewRole]
  );
  const activeView = previewView ?? view;
  const activeStatus: ConnectionStatus = previewView === undefined ? status : "connected";
  const currentPlayer = findCurrentPlayer(
    activeView,
    previewView === undefined ? playerId : previewPlayerId(previewRole)
  );
  const connectedToRoom = status === "connected" || status === "reconnecting";

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

  function sendControl(sequence: number, control: ControlState): void {
    const room = roomReference.current;
    if (room === undefined || view === undefined || currentPlayer === undefined) return;
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: view.roomId,
      playerId: currentPlayer.playerId,
      runNumber: view.runNumber,
      sequence
    } as const;
    if (currentPlayer.role === "pilot") {
      room.send(clientMessage.pilotInput, {
        ...envelope,
        vector: control.vector,
        mgFiring: control.mgFiring
      });
    } else if (currentPlayer.role === "gunner") {
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
      <main className="controller-shell">
        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault();
            void joinRoom();
          }}
        >
          <p className="eyebrow">Контроллер экипажа</p>
          <span className="latency-indicator">До сервера —</span>
          <h1>SpaceShip Defender</h1>
          <label>
            Код комнаты
            <input
              name="roomCode"
              value={roomCode}
              onChange={(event) => {
                setRoomCode(event.target.value);
              }}
            />
          </label>
          <label>
            Имя
            <input
              name="playerName"
              maxLength={24}
              value={playerName}
              onChange={(event) => {
                setPlayerName(event.target.value);
              }}
            />
          </label>
          {error.length > 0 && <p className="error-message">{error}</p>}
          <button type="submit" disabled={status === "joining"}>
            {status === "joining" ? "Подключаемся…" : "Подключиться"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main
      className={`controller-shell${activeView?.game?.encounter.phase === "combat" ? " controller-shell--combat" : ""}`}
    >
      {previewView !== undefined && (
        <PreviewControls
          role={previewRole}
          phase={previewPhase}
          onRoleChange={setPreviewRole}
          onPhaseChange={setPreviewPhase}
        />
      )}
      <section
        className={`card play-card${playCardPhaseModifier(activeView?.game?.encounter.phase)}`}
      >
        <div className="status-row">
          <span className="eyebrow">Комната {activeView?.roomId ?? roomCode}</span>
          <span className="network-status">
            <span className={`connection connection--${activeStatus}`}>
              {activeStatus === "reconnecting" ? "Переподключение…" : "В сети"}
            </span>
            <span className="latency-indicator" aria-live="polite">
              До сервера{" "}
              {formatLatency(currentPlayer?.connected === true ? currentPlayer.latencyMs : null)}
            </span>
          </span>
        </div>
        <h1>{currentPlayer?.playerName ?? playerName}</h1>
        <p className="role-badge">
          {currentPlayer === undefined ? "Назначаем роль…" : roleLabel(currentPlayer.role)}
        </p>
        {error.length > 0 && <p className="error-message">{error}</p>}

        {activeView?.phase === "lobby" ? (
          <>
            <div className="controller-roster">
              {CREW_ROLES.map((role) => {
                const player = activeView.players.find((candidate) => candidate.role === role);
                return (
                  <span key={role}>
                    {roleLabel(role)} · {player?.playerName ?? "свободно"}{" "}
                    {player?.ready === true ? "✓" : ""} ·{" "}
                    {formatLatency(player?.connected === true ? player.latencyMs : null)}
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              onClick={sendReady}
              disabled={currentPlayer?.ready === true || activeStatus === "reconnecting"}
            >
              {currentPlayer?.ready === true ? "Готов — ждём экипаж" : "Я готов"}
            </button>
          </>
        ) : activeView === undefined || currentPlayer === undefined ? (
          <p>Ожидаем подтверждение роли…</p>
        ) : (
          <>
            {activeView.game !== null && (
              <RoleCombatSummary
                role={currentPlayer.role}
                modifiers={activeView.game.roleModifiers}
                hp={activeView.game.spaceship.hp}
                maxHp={activeView.game.spaceship.maxHp}
                waveNumber={activeView.game.encounter.waveNumber}
                encounterPhase={activeView.game.encounter.phase}
                waveSecondsRemaining={activeView.game.encounter.waveSecondsRemaining}
              />
            )}
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
            <RoleControlPanel
              role={currentPlayer.role}
              shield={activeView.game?.shield}
              machineGun={activeView.game?.machineGun}
              encounterPhase={activeView.game?.encounter.phase}
              connectionDisabled={activeStatus === "reconnecting"}
              generation={`${String(activeView.runNumber)}:${String(connectionEpoch)}`}
              hidden={activeView.game?.encounter.phase !== "combat"}
              onSend={sendControl}
            />
          </>
        )}
        {activeView !== undefined && currentPlayer !== undefined && (
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
        )}
      </section>
    </main>
  );
}

/**
 * Landscape phones have roughly 390 usable pixels, so combat and the voting
 * intermission each get their own compact layout instead of one tall page.
 */
function playCardPhaseModifier(phase: EncounterPhase | undefined): string {
  if (phase === "combat") return " play-card--combat";
  return phase === "intermission" ? " play-card--intermission" : "";
}

function formatLatency(latencyMs: number | null | undefined): string {
  return latencyMs === null || latencyMs === undefined ? "—" : `${String(latencyMs)} мс`;
}

function RoleCombatSummary({
  role,
  modifiers,
  hp,
  maxHp,
  waveNumber,
  encounterPhase,
  waveSecondsRemaining
}: {
  readonly role: CrewRole;
  readonly modifiers: PublicRoleModifiersView;
  readonly hp: number;
  readonly maxHp: number;
  readonly waveNumber: number;
  readonly encounterPhase: EncounterPhase;
  readonly waveSecondsRemaining: number;
}) {
  const modifier =
    role === "pilot"
      ? `Скорость ×${modifiers.pilot.speedMultiplier.toFixed(2)} · HP +${String(Math.round(modifiers.pilot.maxHpBonus))}`
      : role === "gunner"
        ? `Урон ×${modifiers.gunner.damageMultiplier.toFixed(2)} · откат ×${modifiers.gunner.cooldownMultiplier.toFixed(2)}`
        : `Ёмкость +${String(Math.round(modifiers.shield.capacityBonus))} · заряд ×${modifiers.shield.rechargeMultiplier.toFixed(2)}`;
  return (
    <div className="combat-summary" aria-label="Состояние боя">
      <span>Волна {waveNumber}</span>
      <span>
        Корпус {Math.ceil(hp)} / {Math.ceil(maxHp)}
      </span>
      <small>{modifier}</small>
      {encounterPhase === "combat" && <WaveCountdown secondsRemaining={waveSecondsRemaining} />}
    </div>
  );
}

export function TeamUpgradePanel({
  role,
  teamUpgrade,
  credits,
  phaseTicksRemaining,
  reconnecting,
  connectionEpoch,
  errorEpoch,
  onVote
}: {
  readonly role: CrewRole;
  readonly teamUpgrade: PublicTeamUpgradeView;
  readonly credits: number;
  readonly phaseTicksRemaining: number;
  readonly reconnecting: boolean;
  readonly connectionEpoch: number;
  readonly errorEpoch: number;
  readonly onVote: (upgradeId: UpgradeId, revision: number, actionId: string) => void;
}) {
  const pendingReference = useRef<VoteIntent | undefined>(undefined);
  const sentRevisionReference = useRef(0);
  const voteReference = useRef(onVote);
  voteReference.current = onVote;
  const [pendingUpgradeId, setPendingUpgradeId] = useState<UpgradeId>();
  const offer = teamUpgrade.offer;
  const offerId = offer?.offerId;
  const ownVote = teamUpgrade.votes[role];
  const ownRevision = ownVote?.revision ?? 0;
  const ownUpgradeId = ownVote?.upgradeId;

  useEffect(() => {
    const pending = pendingReference.current;
    if (pending !== undefined && pending.offerId === offerId && !reconnecting) {
      voteReference.current(pending.upgradeId, pending.revision, pending.actionId);
    }
  }, [connectionEpoch, offerId, reconnecting]);

  useEffect(() => {
    const kept = keepVoteIntent(pendingReference.current, {
      offerId,
      acceptedRevision: ownRevision
    });
    pendingReference.current = kept;
    if (kept === undefined) setPendingUpgradeId(undefined);
  }, [offerId, ownRevision]);

  useEffect(() => {
    // Every offer restarts the authoritative revision sequence for this role.
    sentRevisionReference.current = 0;
  }, [offerId]);

  useEffect(() => {
    // A rejected vote never reaches the projection, so a server error is the
    // only signal that this one is not on its way any more. Errors the ballot
    // did not cause land here too, which costs nothing but a cleared label.
    if (errorEpoch === 0) return;
    pendingReference.current = undefined;
    setPendingUpgradeId(undefined);
  }, [errorEpoch]);

  if (offer === null) {
    return (
      <div className="upgrade-panel" role="status">
        <h2>Подготавливаем улучшения…</h2>
        <p>Выбор появится после синхронизации с сервером.</p>
      </div>
    );
  }

  // The protocol pins one price for every card; reading it from a card would
  // report 0 for an empty offer and hide the insufficient-credits warning.
  const price = TEAM_UPGRADE_PRICE;
  return (
    <div className="upgrade-panel">
      <p className="eyebrow">Передышка · {(phaseTicksRemaining / 20).toFixed(1)} с</p>
      <h2>Общее улучшение экипажа</h2>
      <p className="upgrade-balance">
        Кредиты экипажа: <strong>{credits}</strong> · цена {price}
      </p>
      {credits < price && (
        <p className="upgrade-warning">Кредитов не хватает — улучшение не купится.</p>
      )}
      <div className="upgrade-grid" aria-label="Карточки командного голосования">
        {offer.cards.map((card) => {
          const voters = CREW_ROLES.filter(
            (crewRole) => teamUpgrade.votes[crewRole]?.upgradeId === card.upgradeId
          );
          const chosen = ownUpgradeId === card.upgradeId;
          const pending = pendingUpgradeId === card.upgradeId;
          return (
            <button
              type="button"
              className={`upgrade-card ${chosen ? "upgrade-card--selected" : ""}`}
              key={card.upgradeId}
              data-upgrade-id={card.upgradeId}
              data-price={card.price}
              aria-pressed={chosen}
              /* A vote in flight never locks the ballot: a lost or rejected
                 command must not cost the crew its remaining seconds. */
              disabled={reconnecting}
              onClick={() => {
                const actionId = createActionId();
                const revision = nextVoteRevision(ownRevision, sentRevisionReference.current);
                sentRevisionReference.current = revision;
                pendingReference.current = {
                  offerId: offer.offerId,
                  upgradeId: card.upgradeId,
                  revision,
                  actionId
                };
                setPendingUpgradeId(card.upgradeId);
                onVote(card.upgradeId, revision, actionId);
              }}
            >
              <strong>{card.label}</strong>
              <small>{roleLabel(card.role)}</small>
              <small>
                {pending
                  ? "Отправляем голос…"
                  : voters.length === 0
                    ? "Голосов нет"
                    : `Голоса: ${voters.map((crewRole) => roleLabel(crewRole)).join(", ")}`}
              </small>
            </button>
          );
        })}
      </div>
      <p className="upgrade-hint">
        Побеждает карточка с большинством голосов, при равенстве — первая по порядку ролей. Голос
        можно менять до конца передышки.
      </p>
    </div>
  );
}

export function RunResultPanel({
  outcome,
  defeatReason,
  waveNumber,
  score,
  players,
  currentPlayer,
  reconnecting,
  onRematch
}: {
  readonly outcome: TerminalOutcome;
  readonly defeatReason: DefeatReason | null;
  readonly waveNumber: number;
  readonly score: number;
  readonly players: readonly PublicPlayerView[];
  readonly currentPlayer: PublicPlayerView;
  readonly reconnecting: boolean;
  readonly onRematch: () => void;
}) {
  const readyCount = players.filter((player) => player.ready).length;
  const victory = outcome === "victory";
  return (
    <div className={`result-panel result-panel--${outcome}`} role="status">
      <p className="eyebrow">Забег завершён</p>
      <h2>
        {victory
          ? "Победа экипажа"
          : defeatReason === "wave_timeout"
            ? "Время волны истекло"
            : "Корабль уничтожен"}
      </h2>
      <strong>Волна {waveNumber}</strong>
      <span>Счёт: {score}</span>
      <span className="rematch-readiness">Готовы к новому бою: {readyCount} / 3</span>
      <button type="button" disabled={currentPlayer.ready || reconnecting} onClick={onRematch}>
        {currentPlayer.ready ? "Готов — ждём экипаж" : "Играть ещё"}
      </button>
      <small>Новый бой начнётся в этой же комнате, когда будут готовы все три роли.</small>
    </div>
  );
}

export function createActionId(): string {
  const host: { readonly randomUUID?: () => string } = globalThis.crypto;
  const randomUUID = host.randomUUID;
  if (randomUUID !== undefined) return randomUUID.call(globalThis.crypto);

  // `randomUUID` is secure-context only, and players reach the controller over
  // plain http on a LAN address, where `getRandomValues` is all that is left.
  // The server validates `actionId` as a UUID, so the v4 layout is mandatory.
  const bytes = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  const hex = bytes
    .map((byte, index) => {
      if (index === 6) return ((byte & 0x0f) | 0x40).toString(16).padStart(2, "0");
      if (index === 8) return ((byte & 0x3f) | 0x80).toString(16).padStart(2, "0");
      return byte.toString(16).padStart(2, "0");
    })
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Fire-and-forget by design: a fullscreen prompt must never delay the command
 * the player actually tapped for, and a refusal is not a connection error.
 */
function requestImmersiveMode(): void {
  const host = readImmersiveHost();
  if (host !== undefined) void enterImmersiveMode(host);
}

export function PreviewControls({
  role,
  phase,
  onRoleChange,
  onPhaseChange
}: {
  readonly role: CrewRole;
  readonly phase: PreviewPhase;
  readonly onRoleChange: (role: CrewRole) => void;
  readonly onPhaseChange: (phase: PreviewPhase) => void;
}) {
  return (
    <div className="preview-controls" data-testid="preview-controls">
      <span className="eyebrow">Превью верстки</span>
      <div className="preview-controls__group">
        {CREW_ROLES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={candidate === role}
            onClick={() => {
              onRoleChange(candidate);
            }}
          >
            {roleLabel(candidate)}
          </button>
        ))}
      </div>
      <div className="preview-controls__group">
        {PREVIEW_PHASES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={candidate === phase}
            onClick={() => {
              onPhaseChange(candidate);
            }}
          >
            {previewPhaseLabel(candidate)}
          </button>
        ))}
      </div>
    </div>
  );
}

function previewPhaseLabel(phase: PreviewPhase): string {
  if (phase === "lobby") return "Лобби";
  if (phase === "combat") return "Бой";
  return phase === "intermission" ? "Передышка" : "Итог";
}

function RoleControlPanel({
  role,
  shield,
  machineGun,
  encounterPhase,
  connectionDisabled,
  generation,
  hidden,
  onSend
}: {
  readonly role: CrewRole;
  readonly machineGun: PublicMachineGunView | undefined;
  readonly shield: PublicShieldView | undefined;
  readonly encounterPhase: EncounterPhase | undefined;
  readonly connectionDisabled: boolean;
  readonly generation: string;
  readonly hidden: boolean;
  readonly onSend: (sequence: number, control: ControlState) => void;
}) {
  const controlReference = useRef<ControlState>(NEUTRAL_CONTROL);
  const firePressedAtReference = useRef<number | undefined>(undefined);
  const fireReleaseTimerReference = useRef<number | undefined>(undefined);
  const aimReleaseTimerReference = useRef<number | undefined>(undefined);
  const shieldSnapshotReference = useRef(shield);
  const shieldDesiredActiveReference = useRef(shield?.active ?? false);
  const previousShieldActiveReference = useRef(shield?.active ?? false);
  shieldSnapshotReference.current = shield;
  const sendReference = useRef(onSend);
  sendReference.current = onSend;
  const schedulerReference = useRef<LatestInputScheduler<ControlState> | undefined>(undefined);
  const schedulerGenerationReference = useRef(generation);
  schedulerReference.current ??= new LatestInputScheduler(
    NEUTRAL_CONTROL,
    ({ sequence, value }) => {
      sendReference.current(sequence, value);
    }
  );

  function update(patch: Partial<ControlState>): void {
    const next = { ...controlReference.current, ...patch };
    controlReference.current = next;
    schedulerReference.current?.update(next, performance.now());
  }

  function clearFireReleaseTimer(): void {
    if (fireReleaseTimerReference.current !== undefined) {
      window.clearTimeout(fireReleaseTimerReference.current);
      fireReleaseTimerReference.current = undefined;
    }
  }

  function clearAimReleaseTimer(): void {
    if (aimReleaseTimerReference.current !== undefined) {
      window.clearTimeout(aimReleaseTimerReference.current);
      aimReleaseTimerReference.current = undefined;
    }
  }

  function updateAim(vector: ControlVector): void {
    clearAimReleaseTimer();
    update({ vector });
  }

  function releaseAim(): void {
    clearAimReleaseTimer();
    if (role === "pilot") {
      update({ vector: NEUTRAL_CONTROL.vector });
      return;
    }
    aimReleaseTimerReference.current = window.setTimeout(() => {
      aimReleaseTimerReference.current = undefined;
      update({ vector: NEUTRAL_CONTROL.vector });
    }, AIM_RELEASE_DELAY_MS);
  }

  function cancelAim(): void {
    clearAimReleaseTimer();
    update({ vector: NEUTRAL_CONTROL.vector });
  }

  function setFireDesired(desired: boolean): void {
    if (role === "pilot") {
      update({ mgFiring: desired });
    } else {
      update({ firing: desired });
    }
  }

  function beginFire(): void {
    clearFireReleaseTimer();
    firePressedAtReference.current = performance.now();
    setFireDesired(true);
  }

  function endFire(): void {
    const pressedAt = firePressedAtReference.current;
    firePressedAtReference.current = undefined;
    const remainingMs = getFireReleaseDelay(pressedAt, performance.now());
    clearFireReleaseTimer();
    if (remainingMs === 0) {
      setFireDesired(false);
      return;
    }
    fireReleaseTimerReference.current = window.setTimeout(() => {
      fireReleaseTimerReference.current = undefined;
      setFireDesired(false);
    }, remainingMs);
  }

  function cancelFire(): void {
    firePressedAtReference.current = undefined;
    clearFireReleaseTimer();
    setFireDesired(false);
  }

  function toggleShield(): void {
    if (role !== "shield") return;
    const next = getNextShieldDesiredActive(
      shieldDesiredActiveReference.current,
      shieldSnapshotReference.current?.energy ?? 0
    );
    if (next === shieldDesiredActiveReference.current) return;
    shieldDesiredActiveReference.current = next;
    update({ active: next });
  }

  useEffect(() => {
    const keys = new Set<string>();
    const scheduler = schedulerReference.current;
    const timer = window.setInterval(() => scheduler?.flush(performance.now()), 25);
    function applyKeys(): void {
      const vector = getKeyboardVector(keys);
      update({ vector });
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Space"
        ].includes(event.code)
      ) {
        event.preventDefault();
        if (event.code === "Space" && role === "shield") {
          if (!event.repeat) toggleShield();
          return;
        }
        if (
          event.code === "Space" &&
          (role === "gunner" || role === "pilot") &&
          !keys.has("Space")
        ) {
          beginFire();
        }
        keys.add(event.code);
        applyKeys();
      }
    }
    function onKeyUp(event: KeyboardEvent): void {
      if (event.code === "Space" && role === "shield") return;
      keys.delete(event.code);
      if (event.code === "Space" && (role === "gunner" || role === "pilot")) endFire();
      applyKeys();
    }
    function neutralize(): void {
      keys.clear();
      clearAimReleaseTimer();
      cancelFire();
      update({
        vector: NEUTRAL_CONTROL.vector,
        active: role === "shield" ? controlReference.current.active : false
      });
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", neutralize);
    document.addEventListener("visibilitychange", neutralize);
    return () => {
      controlReference.current = NEUTRAL_CONTROL;
      clearAimReleaseTimer();
      clearFireReleaseTimer();
      scheduler?.update(NEUTRAL_CONTROL, performance.now());
      scheduler?.flush(performance.now() + 50);
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", neutralize);
      document.removeEventListener("visibilitychange", neutralize);
    };
  }, [role]);

  const controlsEnabled = !connectionDisabled && encounterPhase === "combat";
  useLayoutEffect(() => {
    const scheduler = schedulerReference.current;
    controlReference.current = NEUTRAL_CONTROL;
    shieldDesiredActiveReference.current = false;
    clearAimReleaseTimer();
    clearFireReleaseTimer();
    const now = performance.now();
    if (schedulerGenerationReference.current !== generation) {
      schedulerGenerationReference.current = generation;
      scheduler?.resetGeneration(NEUTRAL_CONTROL, now, controlsEnabled);
    } else if (controlsEnabled) {
      scheduler?.resumeWith(NEUTRAL_CONTROL, now);
    } else {
      scheduler?.setEnabled(false);
    }
  }, [controlsEnabled, generation]);

  useEffect(() => {
    const previousActive = previousShieldActiveReference.current;
    const active = shield?.active ?? false;
    previousShieldActiveReference.current = active;
    if (role === "shield" && previousActive && !active && shield?.energy === 0) {
      shieldDesiredActiveReference.current = false;
      update({ active: false });
    }
  }, [role, shield?.active, shield?.energy]);

  return (
    <div className="role-control" data-role={role} hidden={hidden}>
      <p className="phase-copy">{roleHelp(role)}</p>
      <VirtualStick
        label={`Направление: ${roleLabel(role)}`}
        onChange={updateAim}
        onRelease={releaseAim}
        onCancel={cancelAim}
        enabled={controlsEnabled}
        resetKey={generation}
      />
      {role === "pilot" && (
        <div className="mg-control">
          {machineGun !== undefined && (
            <>
              <div className="shield-energy mg-heat" aria-label="Нагрев носового пулемёта">
                <span
                  style={{ width: `${String((machineGun.heat / machineGun.capacity) * 100)}%` }}
                />
              </div>
              <strong>
                Нагрев {Math.round(machineGun.heat)} / {Math.round(machineGun.capacity)}
              </strong>
            </>
          )}
          <ActionZone
            label={machineGun?.overheated ? "ПЕРЕГРЕВ" : "ОГОНЬ ИЗ НОСА"}
            testId="mg-fire-button"
            className={`hold-action--pilot${machineGun?.overheated ? " is-overheated" : ""}`}
            disabled={!controlsEnabled}
            mode="hold"
            resetKey={generation}
            onBegin={beginFire}
            onEnd={endFire}
            onCancel={cancelFire}
          />
        </div>
      )}
      {role === "gunner" && (
        <ActionZone
          label="УДЕРЖИВАТЬ ОГОНЬ"
          testId="fire-button"
          className="hold-action--gunner"
          disabled={!controlsEnabled}
          mode="hold"
          resetKey={generation}
          onBegin={beginFire}
          onEnd={endFire}
          onCancel={cancelFire}
        />
      )}
      {role === "shield" && shield !== undefined && (
        <div className="shield-control">
          <div className="shield-energy" aria-label="Энергия щита">
            <span style={{ width: `${String((shield.energy / shield.capacity) * 100)}%` }} />
          </div>
          <strong>
            Энергия {Math.round(shield.energy)} / {Math.round(shield.capacity)}
          </strong>
          <ActionZone
            label={
              shield.active
                ? "ВЫКЛЮЧИТЬ ЩИТ"
                : shield.energy <= 0
                  ? "ЩИТ ВОССТАНАВЛИВАЕТСЯ"
                  : "ВКЛЮЧИТЬ ЩИТ"
            }
            testId="shield-button"
            className="hold-action--shield"
            disabled={!controlsEnabled || (!shield.active && shield.energy <= 0)}
            mode="toggle"
            active={shield.active}
            resetKey={generation}
            onToggle={toggleShield}
          />
        </div>
      )}
      <small>
        Desktop:{" "}
        {role === "pilot" ? "WASD или стрелки, Space — огонь из носа" : "мышь/стрелки + Space"}
      </small>
    </div>
  );
}

function roleLabel(role: CrewRole): string {
  return role === "pilot" ? "Пилот" : role === "gunner" ? "Наводчик" : "Оператор щита";
}

function roleHelp(role: CrewRole): string {
  return role === "pilot"
    ? "Ведите корабль через космическое поле"
    : role === "gunner"
      ? "Направляйте пушку и удерживайте огонь"
      : "Направляйте и удерживайте защитный сектор";
}

export function toServerError(code: string, fallback: string): string {
  if (code === "invalid_phase") return "Действие недоступно до начала полёта.";
  if (code === "role_mismatch") return "Эта команда недоступна вашей роли.";
  if (code === "identity_mismatch") return "Сервер не подтвердил игровую сессию.";
  if (code === "protocol_mismatch") return "Версия игры устарела. Обновите страницу.";
  if (code === "action_conflict") return "Команда улучшения конфликтует с предыдущей.";
  if (code === "action_not_available") return "Это предложение улучшения уже недоступно.";
  if (code === "stale_action") return "Ваш голос уже обновлён более новой командой.";
  if (code === "stale_run") return "Команда относилась к завершённому бою и не была применена.";
  return fallback;
}

function toJoinError(reason: unknown): string {
  if (!(reason instanceof Error)) return "Не удалось подключиться к комнате.";
  if (reason.message.includes("room_full")) return "Все три роли уже заняты.";
  if (reason.message.includes("not found")) return "Комната не найдена. Проверьте код.";
  return reason.message;
}

function readStringEnvironment(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readBrowserSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

function createDefaultGameServerUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:2567";
  return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:2567`;
}

function readSessionStorage(): SessionStorage | undefined {
  return typeof window === "undefined" ? undefined : window.sessionStorage;
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
