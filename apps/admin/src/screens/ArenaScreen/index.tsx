import { useRef, useState } from "react";
import {
  ARENA_SPAWN_MARKS,
  type ArenaSpawnMark,
  type BalanceTuning
} from "@spaceship-defender/protocol";

import { NumberField } from "../../components/fields.js";

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

  const setMark = (index: number, next: ArenaSpawnMark) => {
    onChange({
      ...tuning,
      arena: {
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
        <h2>Точки появления</h2>
        <p className="screen__hint">
          {String(ARENA_SPAWN_MARKS)} постоянных мест на арене радиуса {String(radius)}. Кто из
          кораблей встанет на какое — решает сид матча, а где сами места — решаете вы. Перетащите
          точку мышью или задайте координаты числами; центр арены — ноль.
        </p>
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
          {[1500, 900, 400].map((ring) => (
            <div
              key={ring}
              className="arena-map__ring"
              style={{ inset: `${String(((radius - ring) / radius) * 50)}%` }}
            />
          ))}
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
