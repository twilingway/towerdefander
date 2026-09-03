import type { MaintenanceState } from "@spaceship-defender/protocol";

import { MaintenanceNotice } from "../../components/MaintenanceNotice/index.js";

import { useState } from "react";
import {
  CREW_SIZES,
  MAX_START_WAVE,
  type CrewSize,
  type PublicShip
} from "@spaceship-defender/protocol";

import { VisibleDemoOverlay } from "../../VisibleDemoOverlay.js";

interface CreateRoomScreenProps {
  readonly status: "idle" | "connecting" | "connected" | "reconnecting" | "error";
  readonly error: string;
  /** The announced maintenance window, if the server told us about one. */
  readonly maintenance: MaintenanceState | undefined;
  readonly visibleDemo: boolean;
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
  readonly onCreate: (
    crewSize: CrewSize,
    shipArchetypeId: string | undefined,
    startWave: number
  ) => void;
}

/** Shown until a room exists: the pitch, the crew size and the button that opens one. */
export function CreateRoomScreen({
  status,
  error,
  maintenance,
  visibleDemo,
  allowStartWave,
  initialStartWave,
  ships,
  defaultShipId,
  onCreate
}: CreateRoomScreenProps) {
  const [crewSize, setCrewSize] = useState<CrewSize>(3);
  const [startWave, setStartWave] = useState(initialStartWave);
  const [pickedShipId, setPickedShipId] = useState<string | undefined>(undefined);
  // The catalogue arrives after the first render, so the choice falls back to
  // whatever the server calls its default until someone picks otherwise.
  const shipId = pickedShipId ?? defaultShipId;
  const ship = ships.find((candidate) => candidate.id === shipId);
  // Nothing on this screen works while a window is announced: the server
  // refuses the room, so a crew size, a hull and a create button would only be
  // three ways of being told no. The announcement takes their place and says
  // the one thing that is true.
  if (maintenance?.active === true) {
    return (
      <main className="display-shell display-shell--centered">
        <section className="hero-card">
          <p className="eyebrow">Общий экран</p>
          <h1>SpaceShip Defender</h1>
          <MaintenanceNotice active secondsRemaining={maintenance.secondsRemaining} prominent />
        </section>
      </main>
    );
  }
  return (
    <main className="display-shell display-shell--centered">
      <section className="hero-card">
        <p className="eyebrow">Общий экран</p>
        <h1>SpaceShip Defender</h1>
        <p>{crewPitch(crewSize)}</p>
        <div className="crew-size-picker" role="group" aria-label="Размер экипажа">
          {CREW_SIZES.map((size) => (
            <button
              type="button"
              key={size}
              className={size === crewSize ? "is-selected" : ""}
              aria-pressed={size === crewSize}
              onClick={() => {
                setCrewSize(size);
              }}
            >
              {crewSizeLabel(size)}
            </button>
          ))}
        </div>
        {ships.length > 1 && (
          <div className="ship-picker" role="group" aria-label="Корабль">
            {ships.map((candidate) => (
              <button
                type="button"
                key={candidate.id}
                className={candidate.id === shipId ? "is-selected" : ""}
                aria-pressed={candidate.id === shipId}
                onClick={() => {
                  setPickedShipId(candidate.id);
                }}
              >
                {candidate.label}
              </button>
            ))}
          </div>
        )}
        {ship !== undefined && <p className="ship-pitch">{ship.description}</p>}
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
        {error.length > 0 && <p className="error-message">{error}</p>}
        <button
          type="button"
          onClick={() => {
            onCreate(crewSize, shipId, startWave);
          }}
          disabled={status === "connecting"}
        >
          {status === "connecting" ? "Создаём комнату…" : "Создать комнату"}
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

function crewPitch(crewSize: CrewSize): string {
  return crewSize === 1
    ? "Один игрок ведёт корабль и турель, щит держит автопилот."
    : crewSize === 2
      ? "Двое делят движение и орудие, щит держит автопилот."
      : "Три игрока управляют одним космическим кораблём: движение, орудия и щит.";
}
