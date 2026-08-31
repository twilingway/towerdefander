import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { memo, useId } from "react";

import {
  createRadarProjection,
  getShieldStatusLabel,
  projectWorldToRadar
} from "./combatHudViewModel.js";

interface CombatRadarProps {
  readonly game: DisplayGameSnapshot;
}

const RADAR_VIEW_BOX_SIZE = 200;
/** Room outside the map for two rings that must not read as one thick band. */
const RADAR_PADDING = 20;
/** Where the two status rings sit, measured out from the radar frame. */
const HULL_RING_OFFSET = 7;
const SHIELD_RING_OFFSET = 15;
/**
 * The rings are open at the bottom: they run from half past seven clockwise to
 * half past four, and the quarter turn left over is where the numbers go. A
 * closed ring has nowhere to say what its ends mean.
 */
const ARC_START_DEGREES = 135;
const ARC_END_DEGREES = 45;
const ARC_SWEEP = 0.75;

export const CombatRadar = memo(function CombatRadar({ game }: CombatRadarProps) {
  const clipId = `combat-radar-${useId().replaceAll(":", "")}`;
  const projection = createRadarProjection(game.arenaRadius, RADAR_VIEW_BOX_SIZE, RADAR_PADDING);
  const hull = ringFraction(game.spaceship.hp, game.spaceship.maxHp);
  const shield = ringFraction(game.shield.energy, game.shield.capacity);
  const speed = Math.hypot(game.spaceship.velocityX, game.spaceship.velocityY);
  const shieldStatus = getShieldStatusLabel(
    game.shieldPhase,
    game.shield.rearmRequired,
    game.shield.energy
  );
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
      data-loot-count={game.lootDrops.length}
      data-hull-fraction={hull.toFixed(2)}
      data-shield-fraction={shield.toFixed(2)}
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
          {game.lootDrops.map((drop) => {
            const point = projectWorldToRadar(
              drop.x,
              drop.y,
              game.worldWidth,
              game.worldHeight,
              projection
            );
            // A diamond rather than a dot: salvage must not be mistaken for a
            // rock at a glance, and the pilot reads the radar, not the label.
            const size = 3.2;
            return (
              <polygon
                className="combat-radar__loot"
                data-entity-id={drop.entityId}
                data-loot-kind={drop.kind}
                points={`${String(point.x)},${String(point.y - size)} ${String(point.x + size)},${String(point.y)} ${String(point.x)},${String(point.y + size)} ${String(point.x - size)},${String(point.y)}`}
                key={drop.entityId}
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
        {/* Hull inside, shield outside, both empty at six o'clock and filling
            clockwise from there. The arc in the world says where the shield
            faces; these two say how much is left, so they are rings around the
            map and never sectors on it. */}
        <StatusRing
          className="combat-radar__ring combat-radar__ring--hull"
          center={projection.center}
          radius={projection.radius + HULL_RING_OFFSET}
          fraction={hull}
          level={hullLevel(hull)}
          stroke={hullStroke(hull)}
        />
        <StatusRing
          className="combat-radar__ring combat-radar__ring--shield"
          center={projection.center}
          radius={projection.radius + SHIELD_RING_OFFSET}
          fraction={shield}
          level="steady"
          stroke={SHIELD_STROKE}
        />
        {/* Both ends of both arcs sit at the same two angles, so the labels
            are told apart by radius: the hull reads inside its ring, the shield
            outside its own. */}
        <ScaleLabel
          className="combat-radar__scale combat-radar__scale--hull"
          center={projection.center}
          radius={projection.radius + HULL_RING_OFFSET - 9}
          degrees={ARC_START_DEGREES}
          text="0"
        />
        <ScaleLabel
          className="combat-radar__scale combat-radar__scale--hull combat-radar__scale--value"
          center={projection.center}
          radius={projection.radius + HULL_RING_OFFSET - 9}
          degrees={ARC_END_DEGREES}
          text={`${String(Math.ceil(game.spaceship.hp))} / ${String(Math.round(game.spaceship.maxHp))}`}
          testId="combat-radar-hull-scale"
        />
        <ScaleLabel
          className="combat-radar__scale combat-radar__scale--shield"
          center={projection.center}
          radius={projection.radius + SHIELD_RING_OFFSET + 9}
          degrees={ARC_START_DEGREES}
          text="0"
        />
        <ScaleLabel
          className="combat-radar__scale combat-radar__scale--shield combat-radar__scale--value"
          center={projection.center}
          radius={projection.radius + SHIELD_RING_OFFSET + 9}
          degrees={ARC_END_DEGREES}
          text={`${String(Math.round(game.shield.energy))} / ${String(Math.round(game.shield.capacity))}`}
          testId="combat-radar-shield-scale"
        />
        {/* Where the gun looks, drawn off the hull marker: the heading arrow
            already says where the ship goes, and here the two differ. */}
        <line
          className="combat-radar__turret"
          data-testid="combat-radar-turret"
          x1={spaceship.x}
          y1={spaceship.y}
          x2={spaceship.x + Math.cos(game.turretAngle) * 14}
          y2={spaceship.y + Math.sin(game.turretAngle) * 14}
        />
        <text
          className="combat-radar__shield-state"
          data-testid="hud-shield-status"
          data-shield-phase={game.shieldPhase}
          x={projection.center}
          y={projection.center + projection.radius * 0.86}
          textAnchor="middle"
        >
          {shieldStatus}
        </text>
        {/* Speed sits in the opening at the bottom of the dial, on its own
            plate, where a fitting screen keeps it. */}
        <rect
          className="combat-radar__speed-plate"
          x={projection.center - 34}
          y={projection.center + projection.radius + 1}
          width={68}
          height={17}
          rx={8}
        />
        <text
          className="combat-radar__speed"
          data-testid="combat-radar-speed"
          x={projection.center}
          y={projection.center + projection.radius + 13}
          textAnchor="middle"
        >
          {Math.round(speed)} ед/с
        </text>
      </svg>
      <span className="sr-only">
        Внутреннее кольцо — прочность корпуса, внешнее — энергия щита; оба пустеют к шести часам.
        Число в круге — скорость корабля, короткий луч у метки — направление турели. Астероиды
        показаны точками: светлые дают кредиты, тёмные — только очки. Ракеты и снаряды на мини-карте
        не отображаются.
      </span>
    </aside>
  );
});

function StatusRing({
  className,
  center,
  radius,
  fraction,
  level,
  stroke
}: {
  readonly className: string;
  readonly center: number;
  readonly radius: number;
  readonly fraction: number;
  readonly level: string;
  readonly stroke: string;
}) {
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * ARC_SWEEP;
  // A circle starts at three o'clock and runs clockwise, so the rotation puts
  // the empty end at half past seven and the full one at half past four.
  return (
    <g
      className={className}
      data-level={level}
      transform={`rotate(${String(ARC_START_DEGREES)} ${String(center)} ${String(center)})`}
    >
      <circle
        className="combat-radar__ring-track"
        cx={center}
        cy={center}
        r={radius}
        strokeDasharray={`${String(arc)} ${String(circumference)}`}
      />
      <circle
        className="combat-radar__ring-value"
        cx={center}
        cy={center}
        r={radius}
        stroke={stroke}
        strokeDasharray={`${String(fraction * arc)} ${String(circumference)}`}
      />
    </g>
  );
}

/** A number parked at one end of an arc, just outside the ring it belongs to. */
function ScaleLabel({
  className,
  center,
  radius,
  degrees,
  text,
  testId
}: {
  readonly className: string;
  readonly center: number;
  readonly radius: number;
  readonly degrees: number;
  readonly text: string;
  readonly testId?: string;
}) {
  const radians = (degrees * Math.PI) / 180;
  const x = center + Math.cos(radians) * radius;
  return (
    <text
      className={className}
      data-testid={testId}
      x={x}
      y={center + Math.sin(radians) * radius}
      textAnchor={x < center ? "end" : "start"}
    >
      {text}
    </text>
  );
}

/** A missing or zero capacity reads as an empty ring, never as a full one. */
function ringFraction(value: number, capacity: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(capacity) || capacity <= 0) return 0;
  return Math.min(1, Math.max(0, value / capacity));
}

function hullLevel(fraction: number): string {
  if (fraction > 0.5) return "steady";
  return fraction > 0.25 ? "hurt" : "critical";
}

const SHIELD_STROKE = "#4fb8ff";

/**
 * Full hull is green and a dying one is red, with everything between as one
 * slide rather than three steps: a gauge that changes colour only at a
 * threshold reads as fine right up until the moment it does not.
 */
function hullStroke(fraction: number): string {
  const hue = 138 * Math.min(1, Math.max(0, (fraction - 0.1) / 0.65));
  return `hsl(${String(Math.round(hue))} 72% 52%)`;
}
