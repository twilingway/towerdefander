import { useRef, useState } from "react";
import type { ArenaLobby, PublicShip } from "@spaceship-defender/protocol";

import { CatalogAssetShape } from "@spaceship-defender/client-shared";
import { getVisualAsset } from "@spaceship-defender/protocol";

import { ShipTile } from "../../components/ShipTile/index.js";
import { useRemoteNavigation } from "../../model/hooks/useRemoteNavigation.js";
import { defaultUnlockedShipId, isShipUnlocked } from "../../model/shipAccess.js";

interface ArenaSetupScreenProps {
  readonly ships: readonly PublicShip[];
  readonly defaultShipId: string | undefined;
  readonly status: "idle" | "connecting" | "connected" | "reconnecting" | "error";
  readonly error: string;
  /** The waiting room, once one is open: who is in it and how long it waits. */
  readonly lobby: ArenaLobby | undefined;
  readonly onBack: () => void;
  readonly onStart: () => void;
}

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
  onBack,
  onStart
}: ArenaSetupScreenProps) {
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
              disabled={status === "connecting"}
              onClick={onStart}
            >
              {status === "connecting" ? "Открываем матч…" : "В бой"}
            </button>
          </>
        ) : (
          <div className="queue">
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
