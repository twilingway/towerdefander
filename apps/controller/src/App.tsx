import { Client, type Room } from "@colyseus/sdk";
import {
  CREW_ROLES,
  PROTOCOL_VERSION,
  clientMessage,
  serverErrorSchema,
  serverMessage,
  type ControllerRoomView,
  type CrewRole
} from "@town-defenders/protocol";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";

import {
  getKeyboardVector,
  LatestInputScheduler,
  normalizeControlVector,
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
          if (disposed) void room.leave();
          else attachRoom(room, session.playerName);
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
      if (room !== undefined) void room.leave();
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
    const next = toControllerRoomView(state);
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
          <span className={`connection connection--${status}`}>
            {status === "reconnecting" ? "Переподключение…" : "В сети"}
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
                    {player?.ready === true ? "✓" : ""}
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
        ) : currentPlayer === undefined ? (
          <p>Ожидаем подтверждение роли…</p>
        ) : (
          <RoleControlPanel
            role={currentPlayer.role}
            disabled={status === "reconnecting"}
            generation={connectionEpoch}
            onSend={sendControl}
          />
        )}
      </section>
    </main>
  );
}

function RoleControlPanel({
  role,
  disabled,
  generation,
  onSend
}: {
  readonly role: CrewRole;
  readonly disabled: boolean;
  readonly generation: number;
  readonly onSend: (sequence: number, control: ControlState) => void;
}) {
  const controlReference = useRef<ControlState>(NEUTRAL_CONTROL);
  const sendReference = useRef(onSend);
  sendReference.current = onSend;
  const schedulerReference = useRef<LatestInputScheduler<ControlState> | undefined>(undefined);
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

  useEffect(() => {
    const keys = new Set<string>();
    const scheduler = schedulerReference.current;
    const timer = window.setInterval(() => scheduler?.flush(performance.now()), 25);
    function applyKeys(): void {
      const vector = getKeyboardVector(keys);
      update({
        vector,
        firing: role === "gunner" && keys.has("Space"),
        active: role === "shield" && keys.has("Space")
      });
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
        keys.add(event.code);
        applyKeys();
      }
    }
    function onKeyUp(event: KeyboardEvent): void {
      keys.delete(event.code);
      applyKeys();
    }
    function neutralize(): void {
      keys.clear();
      update(NEUTRAL_CONTROL);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", neutralize);
    document.addEventListener("visibilitychange", neutralize);
    return () => {
      controlReference.current = NEUTRAL_CONTROL;
      scheduler?.update(NEUTRAL_CONTROL, performance.now());
      scheduler?.flush(performance.now() + 50);
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", neutralize);
      document.removeEventListener("visibilitychange", neutralize);
    };
  }, [role]);

  useLayoutEffect(() => {
    const scheduler = schedulerReference.current;
    if (disabled) {
      scheduler?.setEnabled(false);
      return;
    }
    controlReference.current = NEUTRAL_CONTROL;
    scheduler?.startGeneration(NEUTRAL_CONTROL, performance.now());
  }, [disabled, generation]);

  function aimFromMouse(event: ReactPointerEvent<HTMLDivElement>): void {
    if (
      role === "pilot" ||
      event.pointerType !== "mouse" ||
      (event.target instanceof Element && event.target.closest("button") !== null)
    )
      return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const vector = normalizeControlVector({
      x: event.clientX - (bounds.left + bounds.width / 2),
      y: event.clientY - (bounds.top + bounds.height / 2)
    });
    update({ vector });
  }

  const action = role === "gunner" ? "firing" : "active";
  return (
    <div className="role-control" data-role={role} onPointerMove={aimFromMouse}>
      <p className="phase-copy">{roleHelp(role)}</p>
      <VirtualStick
        label={`Направление: ${roleLabel(role)}`}
        onChange={(vector) => {
          update({ vector });
        }}
      />
      {role !== "pilot" && (
        <button
          type="button"
          className={`hold-action hold-action--${role}`}
          data-testid={role === "gunner" ? "fire-button" : "shield-button"}
          disabled={disabled}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            update({ [action]: true });
          }}
          onPointerUp={() => {
            update({ [action]: false });
          }}
          onPointerCancel={() => {
            update({ [action]: false });
          }}
          onLostPointerCapture={() => {
            update({ [action]: false });
          }}
        >
          {role === "gunner" ? "УДЕРЖИВАТЬ ОГОНЬ" : "УДЕРЖИВАТЬ ЩИТ"}
        </button>
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
