import { useRef } from "react";
import type { MaintenanceState } from "@spaceship-defender/protocol";

import { MaintenanceNotice } from "../../components/MaintenanceNotice/index.js";
import { InstallButton } from "../../components/InstallButton/index.js";
import { UpdateNotice } from "../../components/UpdateNotice/index.js";
import { SettingsPanel } from "../RoomScreen/SettingsPanel.js";
import { MENU_THEME } from "../../audio/themes.js";
import { useMusicTrack } from "../../audio/useMusicTrack.js";
import { BUILD_VERSION } from "../../model/environment.js";
import { useRemoteNavigation } from "../../model/hooks/useRemoteNavigation.js";

export type GameMode = "campaign" | "arena";

interface StartScreenProps {
  readonly maintenance: MaintenanceState | undefined;
  readonly onPick: (mode: GameMode) => void;
}

interface ModeTile {
  readonly mode: GameMode;
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle: string;
  readonly pitch: string;
  readonly crew: string;
}

/**
 * The two games this project is, side by side.
 *
 * A tile rather than a line of buttons because the modes are not settings of
 * one another: the campaign is a crew holding a perimeter, the arena is sixteen
 * hulls with one survivor, and the picture is what says so before any text does.
 */
const MODES: readonly ModeTile[] = [
  {
    mode: "campaign",
    eyebrow: "Кампания I",
    title: "Завеса",
    subtitle: "Оборона Периметра-7",
    pitch: "Экипаж держит рубеж против нарастающих волн и растит корабль между ними.",
    crew: "Соло или экипаж 1–3"
  },
  {
    mode: "arena",
    eyebrow: "Арена",
    title: "Талос",
    subtitle: "Зона отчуждения",
    pitch: "Шестнадцать кораблей, сжимающееся кольцо, один выживший.",
    crew: "Соло против пятнадцати"
  }
];

/** The first screen: what game are we playing tonight. */
export function StartScreen({ maintenance, onPick }: StartScreenProps) {
  useMusicTrack(MENU_THEME);
  const shell = useRef<HTMLElement | null>(null);
  useRemoteNavigation(shell);

  return (
    <main className="display-shell display-shell--start" ref={shell}>
      {/* The volume is set here as often as in the fight: this is the screen
        somebody is on when they decide the room is too loud. */}
      <div className="start-settings">
        <SettingsPanel />
      </div>
      <header className="start-header">
        <p className="start-rule">
          <span>Выберите режим</span>
        </p>
        <h1 className="start-title">SpaceShip Defender</h1>
        <UpdateNotice />
        <InstallButton />
      </header>
      {maintenance?.active === true && (
        <section className="hero-card">
          <MaintenanceNotice active secondsRemaining={maintenance.secondsRemaining} prominent />
        </section>
      )}
      {/*
       * A window closes the server, not the game: the campaign can still be
       * played on this device, so only the arena - which is nothing but a
       * server room - is switched off while one is announced.
       */}
      <div className="mode-grid">
        {MODES.map((tile) => (
          <button
            type="button"
            key={tile.mode}
            className={`mode-tile mode-tile--${tile.mode}`}
            aria-label={`${tile.eyebrow}: ${tile.title}`}
            disabled={tile.mode === "arena" && maintenance?.active === true}
            onClick={() => {
              onPick(tile.mode);
            }}
          >
            <span className="mode-tile__frame">
              <span className="mode-tile__eyebrow">{tile.eyebrow}</span>
              <span className="mode-tile__title">{tile.title}</span>
              <span className="mode-tile__subtitle">{tile.subtitle}</span>
              <span className="mode-tile__pitch">{tile.pitch}</span>
              <span className="mode-tile__crew">{tile.crew}</span>
            </span>
          </button>
        ))}
      </div>
      {/* Who made it and which release this is, for a screenshot that has to say both. */}
      <footer className="start-footer" data-testid="start-footer">
        © TwilingGame 2026 · сборка {BUILD_VERSION}
      </footer>
    </main>
  );
}
