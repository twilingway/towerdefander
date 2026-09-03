import { QRCodeSVG } from "qrcode.react";
import { formatLatency, roleLabel } from "@spaceship-defender/client-shared";
import { CREW_ROLES, type CrewSize, type DisplayRoomView } from "@spaceship-defender/protocol";

import { FullscreenButton } from "../FullscreenButton/index.js";

interface LobbyLayoutProps {
  readonly view: DisplayRoomView;
  readonly joinUrl: string;
}

/** The join QR code and the crew roster, side by side above the stage. */
export function LobbyLayout({ view, joinUrl }: LobbyLayoutProps) {
  const seats = CREW_ROLES.slice(0, view.crewSize);
  const autopilotRoles = CREW_ROLES.slice(view.crewSize);
  return (
    <section className={`lobby-layout ${view.game === null ? "" : "lobby-layout--battle"}`}>
      <div className="join-card">
        <QRCodeSVG value={joinUrl} size={180} bgColor="#f6f4e8" fgColor="#10201f" level="M" />
        <div>
          <h2>{joinHeading(view.crewSize)}</h2>
          <p>{joinHint(view.crewSize)}</p>
          <a href={joinUrl}>{joinUrl}</a>
          <FullscreenButton />
        </div>
      </div>
      <div className="players-card">
        <h2>
          Экипаж · {view.players.length}/{view.crewSize}
        </h2>
        <div className="player-list">
          {seats.map((role) => {
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
        {autopilotRoles.length > 0 && (
          <p className="autopilot-note">
            Под автопилотом: {autopilotRoles.map((role) => roleLabel(role)).join(", ")}
          </p>
        )}
      </div>
    </section>
  );
}

function joinHeading(crewSize: CrewSize): string {
  return crewSize === 1
    ? "Подключите контроллер"
    : `Подключите ${crewSize === 2 ? "два" : "три"} контроллера`;
}

function joinHint(crewSize: CrewSize): string {
  return crewSize === 1
    ? "Один игрок ведёт корабль и турель, щитом управляет автопилот."
    : crewSize === 2
      ? "Первый игрок — pilot, второй — gunner; щитом управляет автопилот."
      : "Первый игрок — pilot, второй — gunner, третий — shield.";
}
