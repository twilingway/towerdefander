import { useRef, useState } from "react";
import {
  ARENA_RADIUS_MAX,
  ARENA_RADIUS_MIN,
  ARENA_SPAWN_MARKS,
  ARENA_ZONE_GRID_MAX,
  ARENA_ZONE_GRID_MIN,
  type ArenaSpawnMark,
  type BalanceTuning
} from "@spaceship-defender/protocol";

import { NumberField } from "../../components/fields.js";

/**
 * The even layout the marks start on: Vogel's spiral, which covers a disc with
 * about the same gap between every pair of neighbours. The same arithmetic the
 * simulation uses when a preset carries no marks of its own.
 */
function spiralMarks(count: number, radius: number): ArenaSpawnMark[] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_unused, index) => {
    const distance = radius * Math.sqrt((index + 0.5) / count);
    const angle = index * goldenAngle;
    return {
      x: Math.round(Math.cos(angle) * distance),
      y: Math.round(Math.sin(angle) * distance)
    };
  });
}

interface ArenaScreenProps {
  readonly tuning: BalanceTuning;
  readonly onChange: (tuning: BalanceTuning) => void;
}

const BOX = 520;

/**
 * Where a match puts its sixteen hulls.
 *
 * The map is the editor: a mark is dragged where it belongs and the numbers
 * follow, because "a little further from the wall" is a thing you see and not
 * a thing you calculate. The pair of fields beside each mark is still there
 * for the times when a number is exactly what you have - a symmetric layout,
 * or a mark copied from a measurement.
 *
 * Coordinates are the arena's own: the centre of the disc is the origin, which
 * is the frame the simulation is written in, so what is typed here is what the
 * match reads.
 */
export function ArenaScreen({ tuning, onChange }: ArenaScreenProps) {
  const radius = tuning.arenaRadius;
  const surface = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<number | undefined>(undefined);
  const marks = tuning.arena.spawnMarks;

  const columns = tuning.arena.zoneColumns;
  const rows = tuning.arena.zoneRows;

  const setMark = (index: number, next: ArenaSpawnMark) => {
    onChange({
      ...tuning,
      arena: {
        ...tuning.arena,
        spawnMarks: marks.map((mark, other) => (other === index ? next : mark))
      }
    });
  };

  /** Screen point to arena point, clamped to the disc the match plays in. */
  const fromPointer = (clientX: number, clientY: number): ArenaSpawnMark => {
    const box = surface.current?.getBoundingClientRect();
    if (box === undefined) return { x: 0, y: 0 };
    const x = ((clientX - box.left) / box.width - 0.5) * 2 * radius;
    const y = ((clientY - box.top) / box.height - 0.5) * 2 * radius;
    const distance = Math.hypot(x, y);
    // A mark outside the wall is a hull spawned inside it; the simulation would
    // shove it back on the first step, so the editor refuses instead.
    const limit = radius - 160;
    if (distance <= limit) return { x: Math.round(x), y: Math.round(y) };
    return {
      x: Math.round((x / distance) * limit),
      y: Math.round((y / distance) * limit)
    };
  };

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Арена</h2>
        <p className="screen__hint">
          {String(ARENA_SPAWN_MARKS)} постоянных мест и сетка зон {String(columns)}×{String(rows)},
          по которой поле закрывается: размер клетки считается от радиуса арены. Кто из кораблей
          встанет на какое место — решает сид матча, а где сами места — решаете вы. Перетащите точку
          мышью, задайте координаты числами или разложите всё заново по спирали.
        </p>
        <div className="arena-controls">
          <NumberField
            caption="Радиус арены"
            min={ARENA_RADIUS_MIN}
            step={50}
            value={tuning.arenaRadius}
            onChange={(arenaRadius) => {
              onChange({
                ...tuning,
                arenaRadius: Math.min(ARENA_RADIUS_MAX, Math.max(ARENA_RADIUS_MIN, arenaRadius))
              });
            }}
          />
          <NumberField
            caption="Зон по горизонтали"
            min={ARENA_ZONE_GRID_MIN}
            value={columns}
            onChange={(value) => {
              onChange({
                ...tuning,
                arena: {
                  ...tuning.arena,
                  zoneColumns: Math.min(ARENA_ZONE_GRID_MAX, Math.max(ARENA_ZONE_GRID_MIN, value))
                }
              });
            }}
          />
          <NumberField
            caption="Зон по вертикали"
            min={ARENA_ZONE_GRID_MIN}
            value={rows}
            onChange={(value) => {
              onChange({
                ...tuning,
                arena: {
                  ...tuning.arena,
                  zoneRows: Math.min(ARENA_ZONE_GRID_MAX, Math.max(ARENA_ZONE_GRID_MIN, value))
                }
              });
            }}
          />
          {/*
           * Widening the arena leaves the old marks huddled in the middle,
           * because they were laid out for the radius the preset had then. This
           * lays them out again for the radius it has now.
           */}
          <button
            type="button"
            className="ghost"
            onClick={() => {
              onChange({
                ...tuning,
                arena: {
                  ...tuning.arena,
                  spawnMarks: spiralMarks(ARENA_SPAWN_MARKS, tuning.arenaRadius - 160)
                }
              });
            }}
          >
            Разложить по спирали
          </button>
        </div>
      </header>

      <div className="arena-editor">
        <div
          className="arena-map"
          ref={surface}
          style={{ width: BOX, height: BOX }}
          onPointerMove={(event) => {
            if (dragging === undefined) return;
            setMark(dragging, fromPointer(event.clientX, event.clientY));
          }}
          onPointerUp={() => {
            setDragging(undefined);
          }}
          onPointerLeave={() => {
            setDragging(undefined);
          }}
        >
          <div className="arena-map__wall" />
          {/*
           * The zone sheet, bright: on this screen it is the subject, while the
           * shared screen keeps it faint so the fight stays readable through it.
           * Built the way the simulation builds it - the square around the disc
           * cut into columns and rows - so what is judged here is what closes
           * there.
           */}
          {Array.from({ length: columns * rows }, (_unused, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            return (
              <div
                key={index}
                className="arena-zone"
                style={{
                  left: `${String((column / columns) * 100)}%`,
                  top: `${String((row / rows) * 100)}%`,
                  width: `${String(100 / columns)}%`,
                  height: `${String(100 / rows)}%`
                }}
              >
                {columns <= 6 && rows <= 6 && (
                  <span className="arena-zone__label">
                    {String(column + 1)}:{String(row + 1)}
                  </span>
                )}
              </div>
            );
          })}
          {marks.map((mark, index) => (
            <button
              type="button"
              key={index}
              className={`arena-mark${dragging === index ? " is-dragging" : ""}`}
              style={{
                left: `${String(((mark.x + radius) / (radius * 2)) * 100)}%`,
                top: `${String(((mark.y + radius) / (radius * 2)) * 100)}%`
              }}
              title={`Место ${String(index + 1)}: ${String(mark.x)}, ${String(mark.y)}`}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(index);
              }}
              onPointerUp={() => {
                setDragging(undefined);
              }}
            >
              {index + 1}
            </button>
          ))}
        </div>

        <ol className="arena-list">
          {marks.map((mark, index) => (
            <li key={index} className="arena-list__row">
              <span className="arena-list__index">{index + 1}</span>
              <NumberField
                caption="X"
                min={-tuning.arenaRadius}
                value={mark.x}
                onChange={(x) => {
                  setMark(index, { ...mark, x });
                }}
              />
              <NumberField
                caption="Y"
                min={-tuning.arenaRadius}
                value={mark.y}
                onChange={(y) => {
                  setMark(index, { ...mark, y });
                }}
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
