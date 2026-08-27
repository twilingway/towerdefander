import { formatLatency } from "@spaceship-defender/client-shared";
import { CREW_ROLES, type DisplayRoomView } from "@spaceship-defender/protocol";

import { latencyRoleLabel } from "../../model/labels.js";

interface CrewLatencyProps {
  readonly view: DisplayRoomView;
  readonly game: NonNullable<DisplayRoomView["game"]>;
}

/** Round-trip times and the run's role modifiers, parked over the battlefield. */
export function CrewLatency({ view, game }: CrewLatencyProps) {
  return (
    <aside className="crew-latency-overlay" aria-label="Пинг участников до сервера">
      <strong>Пинг до сервера</strong>
      <span className="latency-row">Экран → сервер {formatLatency(view.displayLatencyMs)}</span>
      {CREW_ROLES.map((role) => {
        const player = view.players.find((candidate) => candidate.role === role);
        return (
          <span className="latency-row" key={role}>
            {latencyRoleLabel(role)}{" "}
            {formatLatency(player?.connected === true ? player.latencyMs : null)}
          </span>
        );
      })}
      <span>
        Модификаторы: P ×{game.roleModifiers.pilot.speedMultiplier.toFixed(2)} · G ×
        {game.roleModifiers.gunner.damageMultiplier.toFixed(2)} · S +
        {Math.round(game.roleModifiers.shield.capacityBonus)}
      </span>
    </aside>
  );
}
