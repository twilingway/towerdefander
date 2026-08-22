import { Client, type Room } from "@colyseus/sdk";
import {
  CREW_ROLES,
  PROTOCOL_VERSION,
  clientMessage,
  serverLatencyProbeSchema,
  serverErrorSchema,
  serverMessage,
  type ControllerRoomView,
  type CrewRole,
  type EncounterPhase,
  type PublicControllerUpgradeView,
  type PublicRoleModifiersView,
  type PublicShieldView,
  type UpgradeId
} from "@town-defenders/protocol";
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

type ControllerRoom = Room<unknown, NetworkRoomState>;
type ConnectionStatus = "join" | "joining" | "connected" | "reconnecting" | "disconnected";

interface ControlState {
  readonly vector: ControlVector;
  readonly firing: boolean;
  readonly active: boolean;
}

const NEUTRAL_CONTROL: ControlState = { vector: { x: 0, y: 0 }, firing: false, active: false };
const AIM_RELEASE_DELAY_MS = 60;
const gameServerUrl = readStringEnvironment(
  import.meta.env.VITE_GAME_SERVER_URL,
  createDefaultGameServerUrl()
);

export function ControllerApp() {
  const roomReference = useRef<ControllerRoom | undefined>(undefined);
  const [roomCode, setRoomCode] = useState(() => getRoomFromLocation(readBrowserSearch()));
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("join");
  const [view, setView] = useState<ControllerRoomView>();
  const [error, setError] = useState("");
  const [connectionEpoch, setConnectionEpoch] = useState(0);
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
      setError(
        result.success ? toServerError(result.data.code, result.data.message) : "Команда отклонена."
      );
    });
    room.onDrop(() => {
      setStatus("reconnecting");
    });
    room.onReconnect(() => {
      persistReconnectionSession(room, normalizedName);
      setConnectionEpoch((value) => value + 1);
      setError("");
      setStatus("connected");
    });
    room.onError((_code, message) => {
      setError(message ?? "Ошибка соединения.");
    });
    room.onLeave(() => {
      const storage = readSessionStorage();
      if (storage !== undefined) clearReconnectionSession(storage);
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
      playerId: currentPlayer.playerId
    });
  }

  function sendControl(sequence: number, control: ControlState): void {
    const room = roomReference.current;
    if (room === undefined || view === undefined || currentPlayer === undefined) return;
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: view.roomId,
      playerId: currentPlayer.playerId,
      sequence
    } as const;
    if (currentPlayer.role === "pilot") {
      room.send(clientMessage.pilotInput, { ...envelope, vector: control.vector });
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

  function sendUpgrade(upgradeId: UpgradeId, actionId: string): void {
    const room = roomReference.current;
    const upgrade = view?.game?.upgrade;
    if (room === undefined || view === undefined || currentPlayer === undefined || upgrade == null)
      return;
    room.send(clientMessage.upgradeChoose, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: view.roomId,
      playerId: currentPlayer.playerId,
      actionId,
      waveNumber: upgrade.offer.waveNumber,
      offerId: upgrade.offer.offerId,
      upgradeId
    });
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
          <h1>Flying Castle</h1>
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
    <main className="controller-shell">
      <section className="card play-card">
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
                hp={view.game.castle.hp}
                maxHp={view.game.castle.maxHp}
                waveNumber={view.game.encounter.waveNumber}
              />
            )}
            {view.game?.encounter.phase === "intermission" && (
              <UpgradePanel
                role={currentPlayer.role}
                upgrade={view.game.upgrade}
                phaseTicksRemaining={view.game.encounter.phaseTicksRemaining}
                reconnecting={status === "reconnecting"}
                connectionEpoch={connectionEpoch}
                onChoose={sendUpgrade}
              />
            )}
            {view.game?.encounter.phase === "defeated" && (
              <DefeatPanel
                waveNumber={view.game.encounter.waveNumber}
                score={view.game.encounter.score}
              />
            )}
            <RoleControlPanel
              role={currentPlayer.role}
              shield={view.game?.shield}
              encounterPhase={view.game?.encounter.phase}
              connectionDisabled={status === "reconnecting"}
              generation={connectionEpoch}
              hidden={view.game?.encounter.phase !== "combat"}
              onSend={sendControl}
            />
          </>
        )}
      </section>
    </main>
  );
}

function formatLatency(latencyMs: number | null | undefined): string {
  return latencyMs === null || latencyMs === undefined ? "—" : `${String(latencyMs)} мс`;
}

function RoleCombatSummary({
  role,
  modifiers,
  hp,
  maxHp,
  waveNumber
}: {
  readonly role: CrewRole;
  readonly modifiers: PublicRoleModifiersView;
  readonly hp: number;
  readonly maxHp: number;
  readonly waveNumber: number;
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
    </div>
  );
}

function UpgradePanel({
  role,
  upgrade,
  phaseTicksRemaining,
  reconnecting,
  connectionEpoch,
  onChoose
}: {
  readonly role: CrewRole;
  readonly upgrade: PublicControllerUpgradeView | null;
  readonly phaseTicksRemaining: number;
  readonly reconnecting: boolean;
  readonly connectionEpoch: number;
  readonly onChoose: (upgradeId: UpgradeId, actionId: string) => void;
}) {
  const pendingReference = useRef<
    | { readonly offerId: string; readonly upgradeId: UpgradeId; readonly actionId: string }
    | undefined
  >(undefined);
  const chooseReference = useRef(onChoose);
  chooseReference.current = onChoose;
  const [pendingUpgradeId, setPendingUpgradeId] = useState<UpgradeId>();
  const selectedUpgradeId = upgrade?.selection?.upgradeId;

  useEffect(() => {
    const pending = pendingReference.current;
    if (
      pending !== undefined &&
      upgrade?.status === "available" &&
      upgrade.offer.offerId === pending.offerId &&
      !reconnecting
    ) {
      chooseReference.current(pending.upgradeId, pending.actionId);
    }
  }, [connectionEpoch, reconnecting, upgrade?.offer.offerId, upgrade?.status]);

  useEffect(() => {
    if (
      selectedUpgradeId !== undefined ||
      upgrade?.offer.offerId !== pendingReference.current?.offerId
    ) {
      pendingReference.current = undefined;
      setPendingUpgradeId(undefined);
    }
  }, [selectedUpgradeId, upgrade?.offer.offerId]);

  if (upgrade?.offer.role !== role) {
    return (
      <div className="upgrade-panel" role="status">
        <h2>Подготавливаем улучшения…</h2>
        <p>Выбор появится после синхронизации с сервером.</p>
      </div>
    );
  }

  return (
    <div className="upgrade-panel">
      <p className="eyebrow">Передышка · {(phaseTicksRemaining / 20).toFixed(1)} с</p>
      <h2>Улучшение роли: {roleLabel(role)}</h2>
      <div className="upgrade-grid" aria-label="Доступные улучшения">
        {upgrade.offer.cards.map((card) => {
          const selected = selectedUpgradeId === card.upgradeId;
          const pending = pendingUpgradeId === card.upgradeId;
          return (
            <button
              type="button"
              className={`upgrade-card ${selected ? "upgrade-card--selected" : ""}`}
              key={card.upgradeId}
              aria-pressed={selected}
              disabled={
                reconnecting || upgrade.status === "selected" || pendingUpgradeId !== undefined
              }
              onClick={() => {
                if (pendingReference.current !== undefined || upgrade.status === "selected") return;
                const actionId = createActionId();
                pendingReference.current = {
                  offerId: upgrade.offer.offerId,
                  upgradeId: card.upgradeId,
                  actionId
                };
                setPendingUpgradeId(card.upgradeId);
                onChoose(card.upgradeId, actionId);
              }}
            >
              <strong>{card.label}</strong>
              <small>
                {selected
                  ? upgrade.selection?.source === "fallback"
                    ? "Выбрано автоматически"
                    : "Выбрано"
                  : pending
                    ? "Отправляем выбор…"
                    : "Выбрать"}
              </small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DefeatPanel({
  waveNumber,
  score
}: {
  readonly waveNumber: number;
  readonly score: number;
}) {
  return (
    <div className="defeat-panel" role="status">
      <p className="eyebrow">Забег завершён</p>
      <h2>Замок уничтожен</h2>
      <strong>Волна {waveNumber}</strong>
      <span>Счёт: {score}</span>
      <small>Ожидайте новую комнату на общем экране.</small>
    </div>
  );
}

export function createActionId(): string {
  return globalThis.crypto.randomUUID();
}

function RoleControlPanel({
  role,
  shield,
  encounterPhase,
  connectionDisabled,
  generation,
  hidden,
  onSend
}: {
  readonly role: CrewRole;
  readonly shield: PublicShieldView | undefined;
  readonly encounterPhase: EncounterPhase | undefined;
  readonly connectionDisabled: boolean;
  readonly generation: number;
  readonly hidden: boolean;
  readonly onSend: (sequence: number, control: ControlState) => void;
}) {
  const controlReference = useRef<ControlState>(NEUTRAL_CONTROL);
  const firePressedAtReference = useRef<number | undefined>(undefined);
  const fireReleaseTimerReference = useRef<number | undefined>(undefined);
  const aimReleaseTimerReference = useRef<number | undefined>(undefined);
  const firePointerReference = useRef<number | undefined>(undefined);
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

  function beginFire(): void {
    clearFireReleaseTimer();
    firePressedAtReference.current = performance.now();
    update({ firing: true });
  }

  function endFire(): void {
    const pressedAt = firePressedAtReference.current;
    firePressedAtReference.current = undefined;
    const remainingMs = getFireReleaseDelay(pressedAt, performance.now());
    clearFireReleaseTimer();
    if (remainingMs === 0) {
      update({ firing: false });
      return;
    }
    fireReleaseTimerReference.current = window.setTimeout(() => {
      fireReleaseTimerReference.current = undefined;
      update({ firing: false });
    }, remainingMs);
  }

  function cancelFire(): void {
    firePressedAtReference.current = undefined;
    firePointerReference.current = undefined;
    clearFireReleaseTimer();
    update({ firing: false });
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
        if (event.code === "Space" && role === "gunner" && !keys.has("Space")) beginFire();
        keys.add(event.code);
        applyKeys();
      }
    }
    function onKeyUp(event: KeyboardEvent): void {
      if (event.code === "Space" && role === "shield") return;
      keys.delete(event.code);
      if (event.code === "Space" && role === "gunner") endFire();
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
      firePointerReference.current = undefined;
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
    firePointerReference.current = undefined;
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
      />
      {role === "gunner" && (
        <button
          type="button"
          className="hold-action hold-action--gunner"
          data-testid="fire-button"
          disabled={!controlsEnabled}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            firePointerReference.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            beginFire();
          }}
          onPointerUp={(event) => {
            if (firePointerReference.current !== event.pointerId) return;
            firePointerReference.current = undefined;
            endFire();
          }}
          onPointerCancel={(event) => {
            if (firePointerReference.current !== event.pointerId) return;
            firePointerReference.current = undefined;
            cancelFire();
          }}
          onLostPointerCapture={(event) => {
            if (firePointerReference.current !== event.pointerId) return;
            firePointerReference.current = undefined;
            cancelFire();
          }}
        >
          УДЕРЖИВАТЬ ОГОНЬ
        </button>
      )}
      {role === "shield" && shield !== undefined && (
        <div className="shield-control">
          <div className="shield-energy" aria-label="Энергия щита">
            <span style={{ width: `${String((shield.energy / shield.capacity) * 100)}%` }} />
          </div>
          <strong>
            Энергия {Math.round(shield.energy)} / {Math.round(shield.capacity)}
          </strong>
          <button
            type="button"
            className="hold-action hold-action--shield"
            data-testid="shield-button"
            aria-pressed={shield.active}
            disabled={!controlsEnabled || (!shield.active && shield.energy <= 0)}
            onClick={toggleShield}
          >
            {shield.active
              ? "ВЫКЛЮЧИТЬ ЩИТ"
              : shield.energy <= 0
                ? "ЩИТ ВОССТАНАВЛИВАЕТСЯ"
                : "ВКЛЮЧИТЬ ЩИТ"}
          </button>
        </div>
      )}
      <small>Desktop: {role === "pilot" ? "WASD или стрелки" : "мышь/стрелки + Space"}</small>
    </div>
  );
}

function roleLabel(role: CrewRole): string {
  return role === "pilot" ? "Пилот" : role === "gunner" ? "Наводчик" : "Оператор щита";
}

function roleHelp(role: CrewRole): string {
  return role === "pilot"
    ? "Ведите замок по карте"
    : role === "gunner"
      ? "Направляйте пушку и удерживайте огонь"
      : "Направляйте и удерживайте защитный сектор";
}

function toServerError(code: string, fallback: string): string {
  if (code === "invalid_phase") return "Действие недоступно до начала полёта.";
  if (code === "role_mismatch") return "Эта команда недоступна вашей роли.";
  if (code === "identity_mismatch") return "Сервер не подтвердил игровую сессию.";
  if (code === "protocol_mismatch") return "Версия игры устарела. Обновите страницу.";
  if (code === "already_chosen") return "Улучшение этой роли уже выбрано.";
  if (code === "action_conflict") return "Команда улучшения конфликтует с предыдущей.";
  if (code === "action_not_available") return "Это предложение улучшения уже недоступно.";
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
