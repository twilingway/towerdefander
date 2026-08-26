import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { memo, useId } from "react";

import { createRadarProjection, projectWorldToRadar } from "./combatHudViewModel.js";

interface CombatRadarProps {
  readonly game: DisplayGameSnapshot;
}

const RADAR_VIEW_BOX_SIZE = 200;

export const CombatRadar = memo(function CombatRadar({ game }: CombatRadarProps) {
  const clipId = `combat-radar-${useId().replaceAll(":", "")}`;
  const projection = createRadarProjection(game.arenaRadius, RADAR_VIEW_BOX_SIZE);
  const spaceship = projectWorldToRadar(
    game.spaceship.x,
    game.spaceship.y,
    game.worldWidth,
    game.worldHeight,
    projection
  );

  return (
    <aside
      className="combat-radar"
      data-testid="combat-radar"
      data-enemy-count={game.enemyShips.length}
      data-asteroid-count={game.asteroids.length}
      aria-label="Мини-карта арены по центру снизу"
    >
      <span className="combat-radar__title">РАДАР</span>
      <svg
        viewBox={`0 0 ${String(RADAR_VIEW_BOX_SIZE)} ${String(RADAR_VIEW_BOX_SIZE)}`}
        role="img"
        aria-label={`Корабль экипажа. Врагов: ${String(game.enemyShips.length)}. Астероидов: ${String(game.asteroids.length)}`}
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx={projection.center} cy={projection.center} r={projection.radius} />
          </clipPath>
        </defs>
        <circle
          className="combat-radar__surface"
          cx={projection.center}
          cy={projection.center}
          r={projection.radius}
        />
        <g className="combat-radar__grid" clipPath={`url(#${clipId})`} aria-hidden="true">
          <circle cx={projection.center} cy={projection.center} r={projection.radius * 0.5} />
          <line
            x1={projection.center}
            y1={projection.center - projection.radius}
            x2={projection.center}
            y2={projection.center + projection.radius}
          />
          <line
            x1={projection.center - projection.radius}
            y1={projection.center}
            x2={projection.center + projection.radius}
            y2={projection.center}
          />
        </g>
        <g clipPath={`url(#${clipId})`}>
          {game.asteroids.map((asteroid) => {
            const point = projectWorldToRadar(
              asteroid.x,
              asteroid.y,
              game.worldWidth,
              game.worldHeight,
              projection
            );
            return (
              <circle
                className="combat-radar__asteroid"
                data-entity-id={asteroid.entityId}
                data-origin={asteroid.origin}
                cx={point.x}
                cy={point.y}
                r={2.4}
                key={asteroid.entityId}
              />
            );
          })}
          {game.enemyShips.map((enemy) => {
            const point = projectWorldToRadar(
              enemy.x,
              enemy.y,
              game.worldWidth,
              game.worldHeight,
              projection
            );
            return (
              <circle
                className="combat-radar__enemy"
                data-entity-id={enemy.entityId}
                cx={point.x}
                cy={point.y}
                r={3.2}
                key={enemy.entityId}
              />
            );
          })}
          <g
            className="combat-radar__spaceship"
            data-testid="combat-radar-spaceship"
            transform={`translate(${String(spaceship.x)} ${String(spaceship.y)}) rotate(${String((game.spaceship.heading * 180) / Math.PI + 90)})`}
          >
            <circle r={7} />
            <path d="M 0 -6 L 4 5 L 0 3 L -4 5 Z" />
          </g>
        </g>
        <circle
          className="combat-radar__frame"
          cx={projection.center}
          cy={projection.center}
          r={projection.radius}
        />
      </svg>
      <span className="sr-only">
        Астероиды показаны точками: светлые дают кредиты, тёмные — только очки. Ракеты и снаряды на
        мини-карте не отображаются.
      </span>
    </aside>
  );
});
