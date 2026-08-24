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
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  getFireReleaseDelay,
  getKeyboardVector,
  getNextShieldDesiredActive,
  LatestInputScheduler,
  type ControlVector
} from "./controlInput.js";
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
  const [roomCode, setRoomCode] = useState(() => getRoomFromLocation(readBrowserSearch()));
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("join");
  const [view, setView] = useState<ControllerRoomView>();
  const [error, setError] = useState("");
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const [errorEpoch, setErrorEpoch] = useState(0);
  const currentPlayer = findCurrentPlayer(view, playerId);

  useEffect(() => {
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

  async function joinRoom(): Promise<void> {
    const normalizedRoomCode = roomCode.trim();
    const normalizedName = playerName.trim();
    if (normalizedRoomCode.length === 0 || normalizedName.length === 0) {
      setError("Введите код комнаты и имя.");
      return;
    }
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

  if (status === "join" || status === "joining" || status === "disconnected") {
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
      className={`controller-shell${view?.game?.encounter.phase === "combat" ? " controller-shell--combat" : ""}`}
    >
      <section className={`card play-card${playCardPhaseModifier(view?.game?.encounter.phase)}`}>
        <div className="status-row">
          <span className="eyebrow">Комната {view?.roomId ?? roomCode}</span>
          <span className="network-status">
            <span className={`connection connection--${status}`}>
              {status === "reconnecting" ? "Переподключение…" : "В сети"}
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

        {view?.phase === "lobby" ? (
          <>
            <div className="controller-roster">
              {CREW_ROLES.map((role) => {
                const player = view.players.find((candidate) => candidate.role === role);
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
              disabled={currentPlayer?.ready === true || status === "reconnecting"}
            >
              {currentPlayer?.ready === true ? "Готов — ждём экипаж" : "Я готов"}
            </button>
          </>
        ) : view === undefined || currentPlayer === undefined ? (
          <p>Ожидаем подтверждение роли…</p>
        ) : (
          <>
            {view.game !== null && (
              <RoleCombatSummary
                role={currentPlayer.role}
                modifiers={view.game.roleModifiers}
                hp={view.game.spaceship.hp}
                maxHp={view.game.spaceship.maxHp}
                waveNumber={view.game.encounter.waveNumber}
                encounterPhase={view.game.encounter.phase}
                waveSecondsRemaining={view.game.encounter.waveSecondsRemaining}
              />
            )}
            {view.game?.encounter.phase === "intermission" && (
              <TeamUpgradePanel
                role={currentPlayer.role}
                teamUpgrade={view.game.teamUpgrade}
                credits={view.game.credits}
                phaseTicksRemaining={view.game.encounter.phaseTicksRemaining}
                reconnecting={status === "reconnecting"}
                connectionEpoch={connectionEpoch}
                errorEpoch={errorEpoch}
                onVote={sendUpgradeVote}
              />
            )}
            {view.game?.encounter.phase === "result" && view.game.encounter.outcome !== null && (
              <RunResultPanel
                outcome={view.game.encounter.outcome}
                defeatReason={view.game.encounter.defeatReason}
                waveNumber={view.game.encounter.waveNumber}
                score={view.game.encounter.score}
                players={view.players}
                currentPlayer={currentPlayer}
                reconnecting={status === "reconnecting"}
                onRematch={sendReady}
              />
            )}
            <RoleControlPanel
              role={currentPlayer.role}
              shield={view.game?.shield}
              machineGun={view.game?.machineGun}
              encounterPhase={view.game?.encounter.phase}
              connectionDisabled={status === "reconnecting"}
              generation={`${String(view.runNumber)}:${String(connectionEpoch)}`}
              hidden={view.game?.encounter.phase !== "combat"}
              onSend={sendControl}
            />
          </>
        )}
        {view !== undefined && currentPlayer !== undefined && (
          <button
            type="button"
            className="secondary-button leave-room-button"
            disabled={status === "reconnecting"}
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
    // A rejected vote never reaches the projection, so the server error is the
    // only signal that unlocks the cards again.
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

  const price = offer.cards[0]?.price ?? 0;
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
              aria-pressed={chosen}
              disabled={reconnecting || pendingUpgradeId !== undefined}
              onClick={() => {
                if (pendingReference.current !== undefined) return;
                const actionId = createActionId();
                const revision = nextVoteRevision(ownRevision);
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
  return globalThis.crypto.randomUUID();
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
