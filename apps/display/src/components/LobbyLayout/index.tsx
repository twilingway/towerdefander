import { QRCodeSVG } from "qrcode.react";
import { formatLatency, roleLabel } from "@spaceship-defender/client-shared";
import { CREW_ROLES, type CrewSize, type DisplayRoomView } from "@spaceship-defender/protocol";

import { FullscreenButton } from "../FullscreenButton/index.js";

interface LobbyLayoutProps {
  readonly view: DisplayRoomView;
  readonly joinUrl: string;
  /**
   * Present when this screen is also the pilot. There is then nobody to scan
   * the code — the seat is already taken by the device showing it — so the
   * card becomes the one control the run is actually waiting on.
   */
  readonly cockpit?: {
    readonly ready: boolean;
    readonly onReady: () => void;
    /**
     * Whether the world this seat is about to fly has finished loading.
     *
     * The renderer arrives in a chunk of its own, and until it is up nothing
     * drives the cockpit's input: on a phone that was about a second of a
     * started fight with no ship, no shots and no answer from the helm. A run
     * does not begin before the thing that draws it exists.
     */
    readonly worldReady: boolean;
  };
}

/** The join QR code and the crew roster, side by side above the stage. */
export function LobbyLayout({ view, joinUrl, cockpit }: LobbyLayoutProps) {
  const seats = CREW_ROLES.slice(0, view.crewSize);
  const autopilotRoles = CREW_ROLES.slice(view.crewSize);
  return (
    <section className={`lobby-layout ${view.game === null ? "" : "lobby-layout--battle"}`}>
      {cockpit === undefined ? (
        <div className="join-card">
          <QRCodeSVG value={joinUrl} size={180} bgColor="#f6f4e8" fgColor="#10201f" level="M" />
          <div>
            <h2>{joinHeading(view.crewSize)}</h2>
            <p>{joinHint(view.crewSize)}</p>
            <a href={joinUrl}>{joinUrl}</a>
            <FullscreenButton />
          </div>
        </div>
      ) : (
        <div className="join-card join-card--cockpit">
          <div>
            <h2>Вы за штурвалом</h2>
            <p>
              Корабль и турель — с этого экрана. Щитом управляет автопилот. Разверните телефон
              поперёк и нажмите «Готов».
            </p>
            <button
              type="button"
              className="cockpit-ready"
              data-testid="cockpit-ready"
              onClick={cockpit.onReady}
              disabled={cockpit.ready || !cockpit.worldReady}
              data-world-ready={cockpit.worldReady}
            >
              {!cockpit.worldReady ? "Загрузка мира…" : cockpit.ready ? "Ждём старта…" : "Готов"}
            </button>
            <FullscreenButton />
          </div>
        </div>
      )}
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
