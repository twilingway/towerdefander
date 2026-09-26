import { useEffect, useRef, useState } from "react";
import type { ArenaLobby, MaintenanceState, PublicShip } from "@spaceship-defender/protocol";

import { CatalogAssetShape } from "@spaceship-defender/client-shared";
import { MENU_THEME } from "../../audio/themes.js";
import { useMusicTrack } from "../../audio/useMusicTrack.js";
import { getVisualAsset } from "@spaceship-defender/protocol";

import { MaintenanceNotice } from "../../components/MaintenanceNotice/index.js";
import { NetworkNotice } from "../../components/NetworkNotice/index.js";
import { ShipTile } from "../../components/ShipTile/index.js";
import { networkClosure, type ServerReach } from "../../model/serverStatus.js";
import { useRemoteNavigation } from "../../model/hooks/useRemoteNavigation.js";
import { defaultUnlockedShipId, isShipUnlocked } from "../../model/shipAccess.js";

interface ArenaSetupScreenProps {
  readonly ships: readonly PublicShip[];
  readonly defaultShipId: string | undefined;
  readonly status: "idle" | "connecting" | "connected" | "reconnecting" | "error";
  readonly error: string;
  /** The waiting room, once one is open: who is in it and how long it waits. */
  readonly lobby: ArenaLobby | undefined;
  readonly maintenance: MaintenanceState | undefined;
  /** Whether the game server can be played through; unknown until it answers. */
  readonly serverReach?: ServerReach;
  readonly onBack: () => void;
  /**
   * Whether the shared-screen tile works. Players find it switched off while
   * those crews still fly on autopilots; `?shared` opens it for the stands.
   */
  readonly sharedScreen: boolean;
  /** Cockpit means this device flies the match as well as showing it. */
  readonly onStart: (cockpitPlayerName: string | undefined) => void;
  /** A training match against bots, hosted by this device with no server. */
  readonly onTraining: (pilotName: string) => void;
}

/** Where the match is played: this device alone, or a server match seated from here. */
type ArenaPlace = "training" | "server" | "shared";

/**
 * The arena's own setup: a hull, a name, and nothing else.
 *
 * Crew sizes are deliberately absent. A match is sixteen hulls with one pilot
 * each, so "two players on one ship" is a question for the mode that has crews,
 * not for this one.
 */
export function ArenaSetupScreen({
  ships,
  defaultShipId,
  status,
  error,
  lobby,
  maintenance,
  serverReach = "unknown",
  onBack,
  sharedScreen,
  onStart,
  onTraining
}: ArenaSetupScreenProps) {
  useMusicTrack(MENU_THEME);
  const queue = useRef<HTMLDivElement | null>(null);
  /*
   * Bring the queue into view when it appears.
   *
   * Pressing "В бой" replaces the lower half of a card that is taller than a
   * phone, so the new part opens below the fold and the page is still showing
   * the top: it reads as the button having done nothing.
   *
   * "end" rather than "nearest": the queue is the last thing on the card, and
   * the minimum scroll that "nearest" performs brought its first line into view
   * and left the rest - the fleet, the countdown - still below the fold.
   */
  useEffect(() => {
    queue.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lobby === undefined]);
  const [pickedShipId, setPickedShipId] = useState<string | undefined>(undefined);
  const [pilotName, setPilotName] = useState("Пилот");
  /*
   * Training by default, like the campaign's device tile: it is the shortest
   * path from opening the page to flying, and the one that always works. The
   * network places go dark on the same closures the campaign's do, and the
   * choice is held rather than overwritten, so it comes back with the network.
   */
  const [chosenPlace, setPlace] = useState<ArenaPlace>("training");
  const closure = networkClosure(maintenance, serverReach);
  const serverClosed = closure !== undefined;
  const place: ArenaPlace = serverClosed ? "training" : chosenPlace;
  const cockpit = place !== "shared";
  const shell = useRef<HTMLElement | null>(null);
  useRemoteNavigation(shell, { onBack });
  const shipId = pickedShipId ?? defaultUnlockedShipId(ships, defaultShipId);
  const ship = ships.find((candidate) => candidate.id === shipId);

  return (
    <main className="display-shell display-shell--setup is-arena" ref={shell}>
      <section className="setup-card">
        <header className="setup-head">
          <button type="button" className="link-button" data-remote-skip onClick={onBack}>
            ← Режимы
          </button>
          <p className="eyebrow">Арена</p>
          <h1>Талос: зона отчуждения</h1>
          <p className="setup-lede">
            Шестнадцать кораблей на одной арене, свободные места занимают боты. Кольцо сжимается,
            побеждает последний живой.
          </p>
        </header>
        {closure !== undefined && closure !== "maintenance" && (
          <NetworkNotice closure={closure} screen="arena" />
        )}
        {closure === "maintenance" && maintenance !== undefined && (
          <MaintenanceNotice active secondsRemaining={maintenance.secondsRemaining} prominent />
        )}

        <h2 className="setup-step">Где играете</h2>
        <div className="place-grid" role="group" aria-label="Где играете">
          {/*
           * Its name must not contain "Соло" or "Общий экран": the harnesses
           * find the server tiles by those, and a role query matches a substring.
           */}
          <button
            type="button"
            className={`place-tile${place === "training" ? " is-selected" : ""}`}
            aria-label="Тренировка"
            aria-pressed={place === "training"}
            onClick={() => {
              setPlace("training");
            }}
          >
            <span className="place-tile__title">На этом устройстве — тренировка</span>
            <span className="place-tile__caption">
              Против ботов, прямо здесь и сразу: без очереди, сети и сервера.
            </span>
          </button>
          <button
            type="button"
            className={`place-tile${place === "server" ? " is-selected" : ""}`}
            aria-label="Соло"
            aria-pressed={place === "server"}
            disabled={serverClosed}
            onClick={() => {
              setPlace("server");
            }}
          >
            <span className="place-tile__title">На этом устройстве, через сервер</span>
            <span className="place-tile__caption">
              Матч считает сервер: очередь ждёт живых игроков, свободные места займут боты. Нужна
              сеть.
            </span>
          </button>
          <button
            type="button"
            className={`place-tile${place === "shared" ? " is-selected" : ""}`}
            aria-label="Общий экран"
            aria-pressed={place === "shared"}
            disabled={serverClosed || !sharedScreen}
            onClick={() => {
              setPlace("shared");
            }}
          >
            <span className="place-tile__title">Общий экран и телефон</span>
            <span className="place-tile__caption">
              Этот экран показывает матч, вы подключаетесь к нему по QR-коду.
            </span>
          </button>
        </div>

        <h2 className="setup-step">Пилот</h2>
        <label className="field">
          <span className="field__caption">Позывной</span>
          <input
            className="field__input"
            type="text"
            maxLength={24}
            value={pilotName}
            onChange={(event) => {
              setPilotName(event.target.value);
            }}
          />
        </label>

        {ships.length > 0 && (
          <>
            <h2 className="setup-step">Корабль</h2>
            <div className="ship-grid" role="group" aria-label="Корабль">
              {ships.map((candidate) => (
                <ShipTile
                  key={candidate.id}
                  ship={candidate}
                  selected={candidate.id === shipId}
                  locked={!isShipUnlocked(candidate)}
                  onSelect={() => {
                    setPickedShipId(candidate.id);
                  }}
                />
              ))}
            </div>
          </>
        )}
        {ship !== undefined && <p className="ship-pitch">{ship.description}</p>}

        {lobby === undefined ? (
          <>
            <p className="hint">
              Прототип: все шестнадцать кораблей ведёт автопилот — тот же, что водит пустые места в
              кампании. Ваш корабль пока летит сам, экран показывает бой.
            </p>
            {error.length > 0 && <p className="error-message">{error}</p>}
            <button
              type="button"
              className="setup-go"
              disabled={status === "connecting" || (cockpit && pilotName.trim().length === 0)}
              onClick={() => {
                if (place === "training") onTraining(pilotName.trim());
                else onStart(cockpit ? pilotName.trim() : undefined);
              }}
            >
              {status === "connecting" ? "Открываем матч…" : "В бой"}
            </button>
          </>
        ) : (
          <div className="queue" ref={queue}>
            <h2 className="setup-step">Сбор на матч</h2>
            {/*
             * Sixteen hulls rather than a number and a bar: the question a
             * player has is "how full is this", and a row of silhouettes
             * answers it without being read. Lit ones are people who are here,
             * dim ones are the seats bots will take when the wait runs out.
             */}
            <div
              className="queue__fleet"
              role="progressbar"
              aria-label="Игроки в очереди"
              aria-valuenow={lobby.players}
              aria-valuemin={0}
              aria-valuemax={lobby.capacity}
            >
              {Array.from({ length: lobby.capacity }, (_unused, index) => (
                <span
                  key={index}
                  className={`queue__hull${
                    index < lobby.players
                      ? " is-taken"
                      : index < lobby.players + lobby.bots
                        ? " is-bot"
                        : ""
                  }`}
                >
                  <svg viewBox="0 0 64 64" role="presentation">
                    <CatalogAssetShape
                      asset={getVisualAsset(ship?.visual?.shape ?? "")}
                      radius={22}
                      center={32}
                    />
                  </svg>
                </span>
              ))}
            </div>
            <p className="queue__caption">
              <strong>{String(lobby.players + lobby.bots)}</strong> из {String(lobby.capacity)} —{" "}
              {lobby.started
                ? "поле собрано, матч начинается…"
                : lobby.awaitingAssets
                  ? "загружаем ресурсы, отсчёт начнётся после них…"
                  : lobby.bots > 0
                    ? `игроков ${String(lobby.players)}, остальные места занимают боты…`
                    : `ждём игроков ещё ${String(lobby.secondsRemaining)} с, остальных доберут боты`}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
