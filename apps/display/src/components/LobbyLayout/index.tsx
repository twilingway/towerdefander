import { QRCodeSVG } from "qrcode.react";
import { formatLatency, roleLabel } from "@spaceship-defender/client-shared";
import { CREW_ROLES, type DisplayRoomView } from "@spaceship-defender/protocol";

interface LobbyLayoutProps {
  readonly view: DisplayRoomView;
  readonly joinUrl: string;
}

/** The join QR code and the crew roster, side by side above the stage. */
export function LobbyLayout({ view, joinUrl }: LobbyLayoutProps) {
  return (
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
  );
}
