import { Client, type Room } from "@colyseus/sdk";
import { PROTOCOL_VERSION, type PublicRoomView } from "@town-defenders/protocol";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";

import { BattlefieldCanvas } from "./BattlefieldCanvas.js";
import { createControllerJoinUrl, toPublicRoomView, type NetworkRoomState } from "./roomView.js";

type DisplayStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";
type DisplayRoom = Room<unknown, NetworkRoomState>;

const gameServerUrl = readStringEnvironment(
  import.meta.env.VITE_GAME_SERVER_URL,
  createDefaultGameServerUrl()
);
const controllerUrl = readStringEnvironment(
  import.meta.env.VITE_CONTROLLER_URL,
  createDefaultControllerUrl()
);

export function DisplayApp() {
  const roomReference = useRef<DisplayRoom>(undefined);
  const [status, setStatus] = useState<DisplayStatus>("idle");
  const [view, setView] = useState<PublicRoomView>();
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
      if (room !== undefined) {
        void room.leave();
      }
    },
    []
  );

  async function createRoom() {
    setStatus("connecting");
    setError("");

    try {
      const client = new Client(gameServerUrl);
      const room = await client.create<NetworkRoomState>("town_defenders", {
        role: "display",
        protocolVersion: PROTOCOL_VERSION
      });
      roomReference.current = room;

      room.onStateChange((state) => {
        applyRoomState(state);
      });
      applyRoomState(room.state);
      room.onError((_code, message) => {
        setError(message ?? "Сервер сообщил об ошибке.");
        setStatus("error");
      });
      room.onDrop(() => {
        setError("Связь с сервером прервана. Переподключаемся…");
        setStatus("reconnecting");
        setConnectionEpoch((epoch) => epoch + 1);
      });
      room.onReconnect(() => {
        setError("");
        setStatus("connected");
      });
      room.onLeave(() => {
        setError("Соединение с комнатой закрыто.");
        setStatus("error");
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось создать комнату.");
      setStatus("error");
    }
  }

  function applyRoomState(state: NetworkRoomState) {
    const nextView = toPublicRoomView(state);
    if (nextView === undefined) {
      return;
    }

    setView(nextView);
    setStatus("connected");
  }

  if ((status !== "connected" && status !== "reconnecting") || view === undefined) {
    return (
      <main className="display-shell display-shell--centered">
        <section className="hero-card">
          <p className="eyebrow">Общий экран</p>
          <h1>Town Defenders</h1>
          <p>Откройте этот экран на телевизоре, проекторе или большом мониторе.</p>
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
        <div className={`phase-badge phase-badge--${view.phase}`}>{phaseLabel(view.phase)}</div>
      </header>
      {error.length > 0 && <p className="error-message">{error}</p>}

      <section className={`lobby-layout ${view.game === null ? "" : "lobby-layout--battle"}`}>
        <div className="join-card">
          <QRCodeSVG value={joinUrl} size={220} bgColor="#f6f4e8" fgColor="#10201f" level="M" />
          <div>
            <h2>Подключите телефоны</h2>
            <p>Отсканируйте QR-код или откройте ссылку и введите код комнаты.</p>
            <a href={joinUrl}>{joinUrl}</a>
          </div>
        </div>

        <div className="players-card">
          <h2>Защитники · {view.players.length}/2</h2>
          <div className="player-list">
            {[0, 1].map((slot) => {
              const player = view.players[slot];
              return player === undefined ? (
                <div className="player-slot player-slot--empty" key={slot}>
                  Ожидаем игрока…
                </div>
              ) : (
                <div className="player-slot" key={player.playerId}>
                  <span>
                    <strong>{player.playerName}</strong>
                    <small>{player.connected ? "в сети" : "переподключается"}</small>
                  </span>
                  <span className={player.ready ? "ready" : "waiting"}>
                    {player.sectorId === null
                      ? player.ready
                        ? "Готов"
                        : "Не готов"
                      : `Сектор ${String(player.sectorId + 1)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {view.game === null ? (
        <section id="game-canvas" className="game-stage game-stage--waiting">
          <span>Игровое поле появится, когда оба защитника будут готовы</span>
        </section>
      ) : (
        <section id="game-canvas" className="game-stage" aria-label="Область игрового поля">
          <header className="battle-header">
            <div>
              <span>Волна</span>
              <strong>
                {view.game.waveNumber}/{view.game.totalWaves}
              </strong>
            </div>
            <div>
              <span>{view.game.stage === "intermission" ? "До атаки" : "Этап"}</span>
              <strong>
                {view.game.stage === "intermission"
                  ? `${String(view.game.intermissionRemainingSeconds)} с`
                  : "Бой"}
              </strong>
            </div>
            <div>
              <span>Общая казна</span>
              <strong>{view.game.treasury} золота</strong>
            </div>
            <div>
              <span>Авиаудар</span>
              <strong>
                {view.game.airstrikeCharge}/{view.game.airstrikeChargeRequired}
              </strong>
            </div>
            <div className={`battle-result battle-result--${view.game.result}`}>
              {battleResultLabel(view.game.result)}
            </div>
          </header>
          <BattlefieldCanvas
            game={view.game}
            players={view.players}
            connectionEpoch={connectionEpoch}
          />
          <div className="sector-status-strip">
            {view.game.sectors.map((sector) => {
              const owner = view.players.find(
                (player) => player.playerId === sector.assignedPlayerId
              );
              return (
                <div key={sector.sectorId}>
                  <span>
                    Сектор {sector.sectorId + 1} · {owner?.playerName ?? "Без защитника"}
                  </span>
                  <strong>
                    Ворота {sector.gateHealth}/{sector.gateMaxHealth} · Башня ур.{" "}
                    {sector.defenseLevel}
                  </strong>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

function battleResultLabel(result: NonNullable<PublicRoomView["game"]>["result"]): string {
  switch (result) {
    case "in_progress":
      return "Бой идёт";
    case "victory":
      return "Победа!";
    case "defeat":
      return "Поражение";
  }
}

function phaseLabel(phase: PublicRoomView["phase"]): string {
  switch (phase) {
    case "lobby":
      return "Лобби";
    case "active":
      return "Раунд начался";
    case "finished":
      return "Раунд завершён";
  }
}

function readStringEnvironment(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function createDefaultGameServerUrl(): string {
  if (typeof window === "undefined") {
    return "ws://localhost:2567";
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:2567`;
}

function createDefaultControllerUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:5174";
  }

  return `${window.location.protocol}//${window.location.hostname}:5174`;
}
