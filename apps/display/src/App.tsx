import { Client, type Room } from "@colyseus/sdk";
import {
  CREW_ROLES,
  PROTOCOL_VERSION,
  clientMessage,
  serverLatencyProbeSchema,
  serverMessage,
  type CrewRole,
  type DisplayRoomView
} from "@town-defenders/protocol";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";

import { FlyingCastleCanvas } from "./FlyingCastleCanvas.js";
import { createControllerJoinUrl, toDisplayRoomView, type NetworkRoomState } from "./roomView.js";

type DisplayRoom = Room<unknown, NetworkRoomState>;
type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

const gameServerUrl = readStringEnvironment(
  import.meta.env.VITE_GAME_SERVER_URL,
  createDefaultGameServerUrl()
);
const controllerUrl = readStringEnvironment(
  import.meta.env.VITE_CONTROLLER_URL,
  createDefaultControllerUrl()
);

export function DisplayApp() {
  const roomReference = useRef<DisplayRoom | undefined>(undefined);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [view, setView] = useState<DisplayRoomView>();
  const [error, setError] = useState("");
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const joinUrl = useMemo(
    () => (view === undefined ? "" : createControllerJoinUrl(controllerUrl, view.roomId)),
    [view]
  );

  useEffect(
    () => () => {
      const room = roomReference.current;
      roomReference.current = undefined;
      if (room !== undefined) void room.leave();
    },
    []
  );

  async function createRoom(): Promise<void> {
    setStatus("connecting");
    setError("");
    try {
      const room = await new Client(gameServerUrl).create<NetworkRoomState>("town_defenders", {
        role: "display",
        protocolVersion: PROTOCOL_VERSION
      });
      roomReference.current = room;
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
      room.onDrop(() => {
        setStatus("reconnecting");
        setError("Связь прервана. Восстанавливаем общий экран…");
        setConnectionEpoch((value) => value + 1);
      });
      room.onReconnect(() => {
        setStatus("connected");
        setError("");
      });
      room.onError((_code, message) => {
        setStatus("error");
        setError(message ?? "Сервер сообщил об ошибке.");
      });
      room.onLeave(() => {
        setStatus("error");
        setError("Комната закрыта. Создайте новую сессию.");
      });
    } catch (reason) {
      setStatus("error");
      setError(reason instanceof Error ? reason.message : "Не удалось создать комнату.");
    }
  }

  function applyRoomState(state: NetworkRoomState): void {
    const next = toDisplayRoomView(state);
    if (next !== undefined) {
      setView(next);
      setStatus("connected");
    }
  }

  if ((status !== "connected" && status !== "reconnecting") || view === undefined) {
    return (
      <main className="display-shell display-shell--centered">
        <section className="hero-card">
          <p className="eyebrow">Общий экран</p>
          <h1>Flying Castle</h1>
          <p>Три игрока управляют одним летающим замком: движение, пушки и щит.</p>
          {error.length > 0 && <p className="error-message">{error}</p>}
          <button
            type="button"
            onClick={() => void createRoom()}
            disabled={status === "connecting"}
          >
            {status === "connecting" ? "Создаём комнату…" : "Создать комнату"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={`display-shell ${view.game === null ? "" : "display-shell--battle"}`}>
      <header className="room-header">
        <div>
          <p className="eyebrow">Комната</p>
          <strong className="room-code">{view.roomId}</strong>
        </div>
        <div className="room-network">
          <div className={`phase-badge phase-badge--${view.phase}`}>
            {view.phase === "active" ? "Замок в полёте" : "Собираем экипаж"}
          </div>
          <span className="latency-indicator" aria-live="polite">
            Экран → сервер {formatLatency(view.displayLatencyMs)}
          </span>
        </div>
      </header>
      {error.length > 0 && <p className="error-message">{error}</p>}

      <section className={`lobby-layout ${view.game === null ? "" : "lobby-layout--battle"}`}>
        <div className="join-card">
          <QRCodeSVG value={joinUrl} size={180} bgColor="#f6f4e8" fgColor="#10201f" level="M" />
          <div>
            <h2>Подключите три контроллера</h2>
            <p>Первый игрок — pilot, второй — gunner, третий — shield.</p>
            <a href={joinUrl}>{joinUrl}</a>
          </div>
        </div>
        <div className="players-card">
          <h2>Экипаж · {view.players.length}/3</h2>
          <div className="player-list">
            {CREW_ROLES.map((role) => {
              const player = view.players.find((candidate) => candidate.role === role);
              return (
                <div
                  className={`player-slot ${player === undefined ? "player-slot--empty" : ""}`}
                  key={role}
                >
                  <span>
                    <strong>{roleLabel(role)}</strong>
                    <small>{player?.playerName ?? "ожидаем игрока…"}</small>
                    <small>
                      Пинг {formatLatency(player?.connected === true ? player.latencyMs : null)}
                    </small>
                  </span>
                  <span className={player?.ready === true ? "ready" : "waiting"}>
                    {player === undefined
                      ? "свободно"
                      : `${player.connected ? "в сети" : "переподключается"} · ${player.ready ? "готов" : "не готов"}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {view.game === null ? (
        <section id="game-canvas" className="game-stage game-stage--waiting">
          <span>Полёт начнётся, когда pilot, gunner и shield нажмут «Готов»</span>
        </section>
      ) : (
        <section id="game-canvas" className="game-stage" aria-label="Карта летающего замка">
          <header className="battle-header flying-hud">
            <div>
              <span>Волна</span>
              <strong>{view.game.encounter.waveNumber}</strong>
              <small>{encounterLabel(view.game.encounter.phase)}</small>
            </div>
            <div>
              <span>Корпус</span>
              <strong>
                {Math.ceil(view.game.castle.hp)} / {Math.ceil(view.game.castle.maxHp)}
              </strong>
              <div className="hud-energy hud-energy--hull" aria-label="Прочность корпуса">
                <i
                  style={{
                    width: `${String((view.game.castle.hp / view.game.castle.maxHp) * 100)}%`
                  }}
                />
              </div>
            </div>
            <div>
              <span>Щит</span>
              <strong>{view.game.shield.active ? "АКТИВЕН" : "выключен"}</strong>
              <div className="hud-energy" aria-label="Энергия щита">
                <i
                  style={{
                    width: `${String((view.game.shield.energy / view.game.shield.capacity) * 100)}%`
                  }}
                />
              </div>
              <small>
                {Math.round(view.game.shield.energy)} / {Math.round(view.game.shield.capacity)}
              </small>
            </div>
            <div>
              <span>Счёт</span>
              <strong>{view.game.encounter.score}</strong>
              <small>
                Враги {view.game.enemyShips.length} · Ракеты {view.game.homingMissiles.length}
              </small>
            </div>
          </header>
          <FlyingCastleCanvas game={view.game} connectionEpoch={connectionEpoch} />
          {view.game.encounter.phase === "intermission" && (
            <div className="encounter-overlay encounter-overlay--intermission" role="status">
              <p className="eyebrow">Волна {view.game.encounter.waveNumber} завершена</p>
              <h2>Выберите улучшения</h2>
              <strong>
                Следующая волна через {formatCountdown(view.game.encounter.phaseTicksRemaining)}
              </strong>
              <p>Каждая роль выбирает одну карточку на своём контроллере.</p>
            </div>
          )}
          {view.game.encounter.phase === "defeated" && (
            <div className="encounter-overlay encounter-overlay--defeated" role="status">
              <p className="eyebrow">Забег завершён</p>
              <h2>Летающий замок уничтожен</h2>
              <strong>Волна {view.game.encounter.waveNumber}</strong>
              <p>Итоговый счёт: {view.game.encounter.score}</p>
            </div>
          )}
          <aside className="crew-latency-overlay" aria-label="Пинг участников до сервера">
            <strong>Пинг до сервера</strong>
            <span className="latency-row">
              Экран → сервер {formatLatency(view.displayLatencyMs)}
            </span>
            {CREW_ROLES.map((role) => {
              const player = view.players.find((candidate) => candidate.role === role);
              return (
                <span className="latency-row" key={role}>
                  {latencyRoleLabel(role)}{" "}
                  {formatLatency(player?.connected === true ? player.latencyMs : null)}
                </span>
              );
            })}
            <span>
              Модификаторы: P ×{view.game.roleModifiers.pilot.speedMultiplier.toFixed(2)} · G ×
              {view.game.roleModifiers.gunner.damageMultiplier.toFixed(2)} · S +
              {Math.round(view.game.roleModifiers.shield.capacityBonus)}
            </span>
          </aside>
        </section>
      )}
    </main>
  );
}

function formatLatency(latencyMs: number | null | undefined): string {
  return latencyMs === null || latencyMs === undefined ? "—" : `${String(latencyMs)} мс`;
}

function formatCountdown(ticks: number): string {
  return `${(ticks / 20).toFixed(1)} с`;
}

function encounterLabel(phase: "combat" | "intermission" | "defeated"): string {
  return phase === "combat" ? "бой" : phase === "intermission" ? "передышка" : "поражение";
}

function roleLabel(role: CrewRole): string {
  return role === "pilot" ? "Пилот" : role === "gunner" ? "Наводчик" : "Оператор щита";
}

function latencyRoleLabel(role: CrewRole): string {
  return role === "shield" ? "Щит" : roleLabel(role);
}

function readStringEnvironment(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function createDefaultGameServerUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:2567";
  return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:2567`;
}

function createDefaultControllerUrl(): string {
  if (typeof window === "undefined") return "http://localhost:5174";
  return `${window.location.protocol}//${window.location.hostname}:5174`;
}
