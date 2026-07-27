import { Client, type Room } from "@colyseus/sdk";
import {
  PROTOCOL_VERSION,
  clientMessage,
  serverErrorSchema,
  serverMessage,
  type PublicRoomView
} from "@town-defenders/protocol";
import { useEffect, useRef, useState } from "react";

import { createActionId } from "./actionId.js";
import {
  findCurrentPlayer,
  getRoomFromLocation,
  toPublicRoomView,
  type NetworkRoomState
} from "./roomView.js";
import {
  clearReconnectionSession,
  readReconnectionSession,
  saveReconnectionSession,
  type SessionStorage
} from "./reconnectionSession.js";

type ControllerRoom = Room<unknown, NetworkRoomState>;
type ConnectionStatus = "join" | "joining" | "connected" | "reconnecting" | "disconnected";

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
  const [view, setView] = useState<PublicRoomView>();
  const [error, setError] = useState("");
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
            void room.leave();
            return;
          }
          attachRoom(room, session.playerName);
        })
        .catch(() => {
          if (disposed) {
            return;
          }
          clearReconnectionSession(storage);
          setError("Сессию восстановить не удалось. Войдите в комнату снова.");
          setStatus("join");
        });
    }

    return () => {
      disposed = true;
      const room = roomReference.current;
      roomReference.current = undefined;
      if (room !== undefined) {
        void room.leave();
      }
    };
  }, []);

  async function joinRoom() {
    const normalizedRoomCode = roomCode.trim();
    const normalizedName = playerName.trim();
    if (normalizedRoomCode.length === 0 || normalizedName.length === 0) {
      setError("Введите код комнаты и имя.");
      return;
    }

    setStatus("joining");
    setError("");

    try {
      const client = new Client(gameServerUrl);
      const room = await client.joinById<NetworkRoomState>(normalizedRoomCode, {
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

  function attachRoom(room: ControllerRoom, normalizedName: string) {
    roomReference.current = room;
    setPlayerId(room.sessionId);

    persistReconnectionSession(room, normalizedName);
    room.onStateChange((state) => {
      applyRoomState(state);
    });
    applyRoomState(room.state);
    room.onMessage(serverMessage.error, (payload: unknown) => {
      const result = serverErrorSchema.safeParse(payload);
      setError(
        result.success
          ? toServerError(result.data.code, result.data.message)
          : "Сервер отклонил команду."
      );
    });
    room.onDrop(() => {
      setStatus("reconnecting");
    });
    room.onReconnect(() => {
      persistReconnectionSession(room, normalizedName);
      setError("");
      setStatus("connected");
    });
    room.onError((_code, message) => {
      setError(message ?? "Ошибка соединения с комнатой.");
    });
    room.onLeave(() => {
      const storage = readSessionStorage();
      if (storage !== undefined) {
        clearReconnectionSession(storage);
      }
      setError("Соединение закрыто. Войдите в комнату снова.");
      setStatus("disconnected");
    });
  }

  function applyRoomState(state: NetworkRoomState) {
    const nextView = toPublicRoomView(state);
    if (nextView === undefined) {
      return;
    }

    setView(nextView);
    setStatus("connected");
  }

  function sendReady() {
    const room = roomReference.current;
    if (room === undefined || currentPlayer === undefined) {
      return;
    }

    room.send(clientMessage.ready, {
      protocolVersion: PROTOCOL_VERSION,
      ready: !currentPlayer.ready
    });
  }

  function sendResourceAction(action: "repair" | "upgrade") {
    const room = roomReference.current;
    if (room === undefined || view === undefined || currentPlayer === undefined) {
      return;
    }

    setError("");
    room.send(clientMessage[action], {
      protocolVersion: PROTOCOL_VERSION,
      roomId: view.roomId,
      playerId: currentPlayer.playerId,
      actionId: createActionId()
    });
  }

  function sendAirstrike(targetSectorId: 0 | 1) {
    const room = roomReference.current;
    if (room === undefined || view === undefined || currentPlayer === undefined) {
      return;
    }

    setError("");
    room.send(clientMessage.airstrike, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: view.roomId,
      playerId: currentPlayer.playerId,
      actionId: createActionId(),
      targetSectorId
    });
  }

  const ownSector =
    currentPlayer?.sectorId === null || currentPlayer?.sectorId === undefined
      ? undefined
      : view?.game?.sectors.find((sector) => sector.sectorId === currentPlayer.sectorId);
  const ownEnemies = ownSector?.enemyCount ?? 0;

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
          <p className="eyebrow">Контроллер игрока</p>
          <h1>Войти в комнату</h1>
          <label>
            Код комнаты
            <input
              name="roomCode"
              inputMode="text"
              autoComplete="off"
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
              autoComplete="nickname"
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
        <p className="phase-copy">
          {view?.phase === "active"
            ? `Вы защищаете сектор ${String((currentPlayer?.sectorId ?? 0) + 1)}`
            : view?.phase === "finished"
              ? resultLabel(view.game?.result)
              : "Ждём защитников"}
        </p>
        {error.length > 0 && <p className="error-message">{error}</p>}

        {view?.phase === "lobby" ? (
          <button
            className={currentPlayer?.ready === true ? "secondary-button" : ""}
            type="button"
            onClick={sendReady}
            disabled={status === "reconnecting" || currentPlayer === undefined}
          >
            {currentPlayer?.ready === true ? "Отменить готовность" : "Я готов"}
          </button>
        ) : view?.phase === "active" ? (
          <>
            <div className="sector-summary">
              <div>
                <span>Волна</span>
                <strong>
                  {view.game?.waveNumber ?? 1}/{view.game?.totalWaves ?? 5}
                </strong>
              </div>
              <div>
                <span>{view.game?.stage === "intermission" ? "До волны" : "Этап"}</span>
                <strong>
                  {view.game?.stage === "intermission"
                    ? `${String(view.game.intermissionRemainingSeconds)} с`
                    : "Бой"}
                </strong>
              </div>
              <div>
                <span>Общая казна</span>
                <strong>{view.game?.treasury ?? 0}</strong>
              </div>
              <div>
                <span>Ворота</span>
                <strong>
                  {ownSector?.gateHealth ?? 0}/{ownSector?.gateMaxHealth ?? 0}
                </strong>
              </div>
              <div>
                <span>Защита</span>
                <strong>ур. {ownSector?.defenseLevel ?? 1}</strong>
              </div>
              <div>
                <span>Враги</span>
                <strong>{ownEnemies}</strong>
              </div>
            </div>
            <div className="action-grid">
              <button
                type="button"
                onClick={() => {
                  sendResourceAction("repair");
                }}
                disabled={status === "reconnecting" || ownSector === undefined}
              >
                Ремонт · {view.game?.repairCost ?? 0}
              </button>
              <button
                className="upgrade-button"
                type="button"
                onClick={() => {
                  sendResourceAction("upgrade");
                }}
                disabled={
                  status === "reconnecting" ||
                  ownSector?.nextUpgradeCost === undefined ||
                  ownSector.nextUpgradeCost === null
                }
              >
                {ownSector?.nextUpgradeCost === null
                  ? "Максимальный уровень"
                  : `Улучшить · ${String(ownSector?.nextUpgradeCost ?? 0)}`}
              </button>
            </div>
            <section className="airstrike-card" aria-label="Общий авиаудар">
              <div className="airstrike-heading">
                <span>Общий авиаудар</span>
                <strong>
                  {view.game?.airstrikeCharge ?? 0}/{view.game?.airstrikeChargeRequired ?? 100}
                </strong>
              </div>
              <div className="charge-meter">
                <span
                  style={{
                    width: `${String(
                      ((view.game?.airstrikeCharge ?? 0) /
                        (view.game?.airstrikeChargeRequired ?? 100)) *
                        100
                    )}%`
                  }}
                />
              </div>
              <div className="airstrike-actions">
                {([0, 1] as const).map((sectorId) => (
                  <button
                    type="button"
                    key={sectorId}
                    onClick={() => {
                      sendAirstrike(sectorId);
                    }}
                    disabled={status === "reconnecting" || !canTargetAirstrike(view.game, sectorId)}
                  >
                    {sectorId === currentPlayer?.sectorId ? "Свой сектор" : "Помочь соседу"}
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className={`result-card result-card--${view?.game?.result ?? "unknown"}`}>
            <strong>{resultLabel(view?.game?.result)}</strong>
            <span>Матч завершён на {view?.game?.tick ?? 0} шаге</span>
          </div>
        )}
      </section>
    </main>
  );
}

function resultLabel(result: NonNullable<PublicRoomView["game"]>["result"] | undefined) {
  switch (result) {
    case "victory":
      return "Победа!";
    case "defeat":
      return "Поражение";
    default:
      return "Раунд завершён";
  }
}

function canTargetAirstrike(game: PublicRoomView["game"] | undefined, sectorId: 0 | 1): boolean {
  const sector = game?.sectors.find((candidate) => candidate.sectorId === sectorId);
  return (
    game?.stage === "combat" &&
    game.airstrikeCharge >= game.airstrikeChargeRequired &&
    sector?.airstrikeTargetAvailable === true
  );
}

function toServerError(code: string, fallback: string): string {
  switch (code) {
    case "insufficient_funds":
      return "В общей казне недостаточно золота.";
    case "action_not_available":
      return "Сейчас это действие недоступно.";
    case "invalid_phase":
      return "Действие недоступно на текущем этапе матча.";
    case "identity_mismatch":
      return "Сервер не подтвердил вашу игровую сессию.";
    case "protocol_mismatch":
      return "Версия игры устарела. Обновите страницу.";
    default:
      return fallback;
  }
}

function toJoinError(reason: unknown): string {
  if (!(reason instanceof Error)) {
    return "Не удалось подключиться к комнате.";
  }

  if (reason.message.includes("room_full")) {
    return "В комнате уже два игрока.";
  }
  if (reason.message.includes("not found")) {
    return "Комната не найдена. Проверьте код.";
  }

  return reason.message;
}

function readStringEnvironment(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readBrowserSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

function createDefaultGameServerUrl(): string {
  if (typeof window === "undefined") {
    return "ws://localhost:2567";
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:2567`;
}

function readSessionStorage(): SessionStorage | undefined {
  return typeof window === "undefined" ? undefined : window.sessionStorage;
}

function persistReconnectionSession(room: ControllerRoom, playerName: string): void {
  const storage = readSessionStorage();
  if (storage === undefined) {
    return;
  }

  saveReconnectionSession(storage, {
    endpoint: gameServerUrl,
    roomId: room.roomId,
    playerName,
    token: room.reconnectionToken
  });
}
