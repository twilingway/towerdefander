import { useState } from "react";
import { CREW_SIZES, type CrewSize } from "@spaceship-defender/protocol";

import { VisibleDemoOverlay } from "../../VisibleDemoOverlay.js";

interface CreateRoomScreenProps {
  readonly status: "idle" | "connecting" | "connected" | "reconnecting" | "error";
  readonly error: string;
  readonly visibleDemo: boolean;
  readonly onCreate: (crewSize: CrewSize) => void;
}

/** Shown until a room exists: the pitch, the crew size and the button that opens one. */
export function CreateRoomScreen({ status, error, visibleDemo, onCreate }: CreateRoomScreenProps) {
  const [crewSize, setCrewSize] = useState<CrewSize>(3);
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
        {error.length > 0 && <p className="error-message">{error}</p>}
        <button
          type="button"
          onClick={() => {
            onCreate(crewSize);
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
