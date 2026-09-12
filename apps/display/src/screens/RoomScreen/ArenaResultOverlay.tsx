import type { TerminalOutcome } from "@spaceship-defender/protocol";

interface ArenaResultOverlayProps {
  readonly outcome: TerminalOutcome;
  /** Hulls still flying when this one stopped; the arena's own scoreline. */
  readonly survivors: number;
  readonly fieldSize: number;
  readonly leaving: boolean;
  readonly onLeave: () => void;
}

/**
 * The end of a match, told the way a match ends.
 *
 * A run's result overlay says "wave", "final score" and "ready to play again",
 * and asks a crew to agree on a rematch - none of which the arena has. Here the
 * whole outcome is one line, because there is only one question after being
 * shot down: another fight, or out.
 *
 * It appears the moment the player's own hull is gone rather than when the
 * field is down to one, which is what the room now publishes: fifteen bots keep
 * fighting behind it, and the player is free to watch them or to leave.
 */
export function ArenaResultOverlay({
  outcome,
  survivors,
  fieldSize,
  leaving,
  onLeave
}: ArenaResultOverlayProps) {
  const place = Math.max(1, survivors + 1);
  return (
    <div
      className={`encounter-overlay encounter-overlay--result encounter-overlay--${outcome}`}
      role="status"
    >
      <p className="eyebrow">Матч окончен</p>
      <h2>{outcome === "victory" ? "Последний в небе" : "Корабль уничтожен"}</h2>
      {outcome === "victory" ? (
        <p>Поле зачищено: из {fieldSize} кораблей остался ваш.</p>
      ) : (
        <p>
          Место <strong>{place}</strong> из {fieldSize}. В небе ещё {survivors}.
        </p>
      )}
      <button
        type="button"
        className="room-close-button"
        data-testid="arena-search-again"
        onClick={onLeave}
        disabled={leaving}
      >
        {leaving ? "Выходим…" : "Искать новый бой"}
      </button>
    </div>
  );
}
