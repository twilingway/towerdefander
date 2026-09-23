import type { MaintenanceState } from "@spaceship-defender/protocol";

import { MaintenanceNotice } from "../../components/MaintenanceNotice/index.js";
import { UpdateNotice } from "../../components/UpdateNotice/index.js";
import { MENU_THEME } from "../../audio/themes.js";
import { useMusicTrack } from "../../audio/useMusicTrack.js";

import { useRef, useState } from "react";
import {
  CREW_SIZES,
  MAX_START_WAVE,
  type CrewSize,
  type PublicShip
} from "@spaceship-defender/protocol";

import { ShipTile } from "../../components/ShipTile/index.js";
import { useRemoteNavigation } from "../../model/hooks/useRemoteNavigation.js";
import { VisibleDemoOverlay } from "../../components/VisibleDemoOverlay/index.js";
import { defaultUnlockedShipId, isShipUnlocked } from "../../model/shipAccess.js";

interface CreateRoomScreenProps {
  readonly status: "idle" | "connecting" | "connected" | "reconnecting" | "error";
  readonly error: string;
  /** The announced maintenance window, if the server told us about one. */
  readonly maintenance: MaintenanceState | undefined;
  readonly visibleDemo: boolean;
  /**
   * Whether the shared-screen tile works. Players find it switched off while
   * those crews still fly on autopilots; `?shared` opens it for the stands.
   */
  readonly sharedScreen: boolean;
  /**
   * Whether to offer the wave picker. A development build only: the server
   * refuses the wave unless it was started with `ALLOW_START_WAVE=true`, so
   * showing the control anywhere else would only promise what it cannot do.
   */
  readonly allowStartWave: boolean;
  /** Initial wave, so `?wave=5` can drive it from a script or a bookmark. */
  readonly initialStartWave: number;
  /**
   * Hulls from the server's public catalogue. Empty while it is still being
   * fetched, or if it could not be: then the picker stays hidden and the server
   * gives the room its own default hull.
   */
  readonly ships: readonly PublicShip[];
  readonly defaultShipId: string | undefined;
  /** The tile selected on arrival; `?online` asks for the server one. */
  readonly initialPlace: Place;
  /** Back to the mode grid: the campaign is one of two games, not the only one. */
  readonly onBack: () => void;
  readonly onCreate: (
    crewSize: CrewSize,
    shipArchetypeId: string | undefined,
    startWave: number,
    /**
     * Name of the player flying from this very device. Given one, the page
     * takes the seat itself instead of waiting for a phone to join; absent, it
     * opens the room the way it always has.
     */
    cockpitPlayerName: string | undefined,
    /** Whether this page steps the run itself rather than a server room. */
    hostedLocally: boolean
  ) => void;
}

/**
 * Where the fight happens, which is three games rather than two.
 *
 * The device tile and the server tile draw the same cockpit on the same screen;
 * what differs is who steps the simulation. Both are on offer because both are
 * played: the device run needs no network and answers the hand at once, the
 * server run is the networked game with one crew member, and it is how a room
 * bug gets reproduced without three phones.
 */
export type Place = "device" | "server" | "shared";

/** Shown until a room exists: the pitch, the crew size and the button that opens one. */
export function CreateRoomScreen({
  status,
  error,
  maintenance,
  visibleDemo,
  sharedScreen,
  allowStartWave,
  initialStartWave,
  ships,
  defaultShipId,
  initialPlace,
  onBack,
  onCreate
}: CreateRoomScreenProps) {
  useMusicTrack(MENU_THEME);
  // Solo on this very screen is the default, because it is the shortest path
  // from opening the page to flying: no phone, no second person, no waiting.
  const [crewSize, setCrewSize] = useState<CrewSize>(1);
  const [chosenPlace, setPlace] = useState<Place>(initialPlace);
  /*
   * A maintenance window closes the server, not the game.
   *
   * The server refuses new rooms while one is announced, so the two places that
   * need a room are switched off - but a run on this device asks the server
   * nothing, and a window is exactly when somebody opens the page and wants to
   * play anyway. The choice is held rather than overwritten, so it comes back
   * when the window does.
   */
  const serverClosed = maintenance?.active === true;
  const place: Place = serverClosed ? "device" : chosenPlace;
  const cockpit = place !== "shared";
  // Named rather than blank: the field is the only thing between a player and
  // the button, and a room needs a roster label more than it needs a choice.
  const [cockpitName, setCockpitName] = useState("Пилот");
  const [startWave, setStartWave] = useState(initialStartWave);
  const [pickedShipId, setPickedShipId] = useState<string | undefined>(undefined);
  const shell = useRef<HTMLElement | null>(null);
  useRemoteNavigation(shell, { onBack });
  // The catalogue arrives after the first render, so the choice falls back to
  // the first hull this build actually flies until someone picks otherwise.
  const shipId = pickedShipId ?? defaultUnlockedShipId(ships, defaultShipId);
  const ship = ships.find((candidate) => candidate.id === shipId);
  // The cockpit needs a name for the roster, so an empty one is not a cockpit
  // yet — the button stays disabled rather than opening a room nobody is in.
  const trimmedName = cockpitName.trim();
  const soloName = cockpit && crewSize === 1 && trimmedName.length > 0 ? trimmedName : undefined;
  return (
    <main className="display-shell display-shell--setup is-campaign" ref={shell}>
      <section className="setup-card">
        <header className="setup-head">
          <button type="button" className="link-button" data-remote-skip onClick={onBack}>
            ← Режимы
          </button>
          <p className="eyebrow">Кампания I: Завеса</p>
          <h1>Оборона Периметра-7</h1>
          <p className="setup-lede">{crewPitch(cockpit ? 0 : crewSize)}</p>
          <UpdateNotice />
        </header>
        {serverClosed && (
          <>
            <MaintenanceNotice active secondsRemaining={maintenance.secondsRemaining} prominent />
            <p className="setup-lede">
              Сетевые режимы закрыты до конца работ. На этом устройстве можно играть — ему сервер не
              нужен.
            </p>
          </>
        )}

        {/*
         * Two questions, not one list. "Solo" and "1" sat side by side and read
         * as the same choice, when they are different games: one is this device
         * being the whole thing, the other is this screen plus a phone.
         */}
        <h2 className="setup-step">Где играете</h2>
        <div className="place-grid" role="group" aria-label="Где играете">
          <button
            type="button"
            className={`place-tile${place === "device" ? " is-selected" : ""}`}
            aria-label="Соло"
            aria-pressed={place === "device"}
            onClick={() => {
              setPlace("device");
              setCrewSize(1);
            }}
          >
            <span className="place-tile__title">На этом устройстве</span>
            <span className="place-tile__caption">
              Экран становится кокпитом: арена снизу, стики поверх неё. Телефон и сеть не нужны.
            </span>
          </button>
          {/*
           * Its accessible name must not contain "Соло": the harnesses find the
           * device tile by that name, and a role query matches a substring, so a
           * second tile carrying it would make every one of them ambiguous.
           */}
          <button
            type="button"
            className={`place-tile${place === "server" ? " is-selected" : ""}`}
            aria-label="Через сервер"
            aria-pressed={place === "server"}
            disabled={serverClosed}
            onClick={() => {
              setPlace("server");
              setCrewSize(1);
            }}
          >
            <span className="place-tile__title">На этом устройстве, через сервер</span>
            <span className="place-tile__caption">
              Тот же кокпит, но бой считает сервер, как в сетевой игре. Нужна сеть.
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
            <span className="place-tile__title">Общий экран и телефоны</span>
            <span className="place-tile__caption">
              Этот экран показывает бой, игроки подключаются по QR-коду со своих телефонов.
            </span>
          </button>
        </div>

        {!cockpit && (
          <>
            <h2 className="setup-step">Сколько телефонов</h2>
            <div className="crew-grid" role="group" aria-label="Состав">
              {CREW_SIZES.map((size) => (
                <button
                  type="button"
                  key={size}
                  className={`crew-tile${size === crewSize ? " is-selected" : ""}`}
                  aria-label={crewSizeLabel(size)}
                  aria-pressed={size === crewSize}
                  onClick={() => {
                    setCrewSize(size);
                  }}
                >
                  <span className="crew-tile__count">{String(size)}</span>
                  <span className="crew-tile__caption">{crewRoles(size)}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {cockpit && (
          <label className="field">
            <span className="field__caption">Имя пилота</span>
            <input
              className="field__input"
              type="text"
              maxLength={24}
              value={cockpitName}
              onChange={(event) => {
                setCockpitName(event.target.value);
              }}
            />
          </label>
        )}

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
        {allowStartWave && (
          <label className="field">
            <span className="field__caption">Начать с волны (для тестов)</span>
            <input
              className="field__input"
              type="number"
              min={1}
              max={MAX_START_WAVE}
              value={startWave}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) {
                  setStartWave(Math.min(MAX_START_WAVE, Math.max(1, Math.round(next))));
                }
              }}
            />
          </label>
        )}
        {ship !== undefined && <p className="ship-pitch">{ship.description}</p>}
        {error.length > 0 && <p className="error-message">{error}</p>}
        <button
          type="button"
          className="setup-go"
          onClick={() => {
            onCreate(crewSize, shipId, startWave, soloName, place === "device");
          }}
          disabled={status === "connecting" || (cockpit && soloName === undefined)}
        >
          {status === "connecting" ? "Создаём комнату…" : "В бой"}
        </button>
      </section>
      {visibleDemo ? (
        <VisibleDemoOverlay
          connectionStatus={status}
          phase="lobby"
          waveNumber={undefined}
          snapshotTick={undefined}
        />
      ) : null}
    </main>
  );
}

function crewSizeLabel(crewSize: CrewSize): string {
  return crewSize === 1 ? "1 игрок" : `${String(crewSize)} игрока`;
}

/** What each phone actually does, which is the part a size alone never says. */
function crewRoles(crewSize: CrewSize): string {
  return crewSize === 1
    ? "корабль и турель"
    : crewSize === 2
      ? "корабль + орудие"
      : "корабль, орудие, щит";
}

/** Zero is the cockpit: one player on this very screen, no phone in the room. */
function crewPitch(crewSize: CrewSize | 0): string {
  return crewSize === 0
    ? "Экран станет кокпитом: мир снизу, стики и спуски поверх него. Телефон не нужен."
    : crewSize === 1
      ? "Один игрок ведёт корабль и турель с телефона, щит держит автопилот."
      : crewSize === 2
        ? "Двое делят движение и орудие, щит держит автопилот."
        : "Три игрока управляют одним космическим кораблём: движение, орудия и щит.";
}
