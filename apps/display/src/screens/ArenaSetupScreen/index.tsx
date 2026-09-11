import { useRef, useState } from "react";
import type { PublicShip } from "@spaceship-defender/protocol";

import { ShipTile } from "../../components/ShipTile/index.js";
import { useRemoteNavigation } from "../../model/hooks/useRemoteNavigation.js";
import { defaultUnlockedShipId, isShipUnlocked } from "../../model/shipAccess.js";

interface ArenaSetupScreenProps {
  readonly ships: readonly PublicShip[];
  readonly defaultShipId: string | undefined;
  readonly onBack: () => void;
}

/**
 * The arena's own setup: a hull, a name, and nothing else.
 *
 * Crew sizes are deliberately absent. A match is sixteen hulls with one pilot
 * each, so "two players on one ship" is a question for the mode that has crews,
 * not for this one.
 */
export function ArenaSetupScreen({ ships, defaultShipId, onBack }: ArenaSetupScreenProps) {
  const [pickedShipId, setPickedShipId] = useState<string | undefined>(undefined);
  const [pilotName, setPilotName] = useState("Пилот");
  const shell = useRef<HTMLElement | null>(null);
  useRemoteNavigation(shell, { onBack });
  const shipId = pickedShipId ?? defaultUnlockedShipId(ships, defaultShipId);
  const ship = ships.find((candidate) => candidate.id === shipId);

  return (
    <main className="display-shell display-shell--setup is-arena" ref={shell}>
      <section className="setup-card">
        <header className="setup-head">
          <button type="button" className="link-button" onClick={onBack}>
            ← Режимы
          </button>
          <p className="eyebrow">Арена</p>
          <h1>Талос: зона отчуждения</h1>
          <p className="setup-lede">
            Шестнадцать кораблей на одной арене, пятнадцать из них ведёт сервер. Кольцо сжимается,
            побеждает последний живой.
          </p>
        </header>

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

        <p className="hint">
          Матч ещё не запускается: симуляция арены готова и покрыта тестами, комната для неё —
          следующий шаг.
        </p>
        <button type="button" className="setup-go" disabled>
          В бой
        </button>
      </section>
    </main>
  );
}
