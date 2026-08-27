import { formatLatency, roleLabel } from "@spaceship-defender/client-shared";
import {
  CREW_ROLES,
  type ControllerRoomView,
  type PublicPlayerView
} from "@spaceship-defender/protocol";

interface LobbyScreenProps {
  readonly view: ControllerRoomView;
  readonly currentPlayer: PublicPlayerView | undefined;
  readonly reconnecting: boolean;
  readonly onReady: () => void;
}

/** Crew roster and the ready switch, shown until the run starts. */
export function LobbyScreen({ view, currentPlayer, reconnecting, onReady }: LobbyScreenProps) {
  return (
    <>
      <div className="controller-roster">
        {CREW_ROLES.map((role) => {
          const player = view.players.find((candidate) => candidate.role === role);
          return (
            <span key={role}>
              {roleLabel(role)} · {player?.playerName ?? "свободно"}{" "}
              {player?.ready === true ? "✓" : ""} ·{" "}
              {formatLatency(player?.connected === true ? player.latencyMs : null)}
            </span>
          );
        })}
      </div>
      <button
        type="button"
        className="ready-button"
        onClick={onReady}
        disabled={currentPlayer?.ready === true || reconnecting}
      >
        {currentPlayer?.ready === true ? "Готов — ждём экипаж" : "Я готов"}
      </button>
    </>
  );
}
