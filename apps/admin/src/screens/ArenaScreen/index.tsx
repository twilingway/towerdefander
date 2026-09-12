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

import { NumberField, SecondsField } from "../../components/fields.js";
import { TICK_SECONDS } from "../../waveSummary.js";

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

/**
 * How many rectangles the sheet actually has.
 *
 * The grid is laid over the arena square and the arena is the disc inscribed in
 * it, so the corners are rectangles the field never reaches - the simulation
 * drops them when it builds the sheet, and the count has to match or every
 * duration below is wrong. The radius cancels: the disc is always inscribed, so
 * only the grid decides.
 */
function liveZoneCount(columns: number, rows: number): number {
  const width = 2 / columns;
  const height = 2 / rows;
  let count = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = -1 + column * width;
      const y = -1 + row * height;
      const nearestX = Math.max(x, Math.min(0, x + width));
      const nearestY = Math.max(y, Math.min(0, y + height));
      if (Math.hypot(nearestX, nearestY) < 1) count += 1;
    }
  }
  return count;
}

function beatWord(count: number): string {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return "отрезков";
  switch (count % 10) {
    case 1:
      return "отрезок";
    case 2:
    case 3:
    case 4:
      return "отрезка";
    default:
      return "отрезков";
  }
}

function zoneWord(count: number): string {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return "зон";
  switch (count % 10) {
    case 1:
      return "зона";
    case 2:
    case 3:
    case 4:
      return "зоны";
    default:
      return "зон";
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function shotWord(count: number): string {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return "выстрелов";
  switch (count % 10) {
    case 1:
      return "выстрел";
    case 2:
    case 3:
    case 4:
      return "выстрела";
    default:
      return "выстрелов";
  }
}

/** A duration for reading: the console edits seconds, an operator thinks in minutes. */
function formatTicks(ticks: number): string {
  const seconds = Math.round(ticks * TICK_SECONDS);
  if (seconds < 60) return `${String(seconds)} с`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return rest === 0 ? `${String(minutes)} мин` : `${String(minutes)} мин ${String(rest)} с`;
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

  /*
   * What the sheet and the clock add up to.
   *
   * The field takes a band of rectangles per interval and never takes the last
   * safe one, so a full collapse costs as many beats as there are bands, plus
   * the amber the last of them still has to sit through. A match shorter than that simply ends with
   * ground still green, and the operator should be able to see that before the
   * first hull spawns rather than after the first match.
   */
  const zoneCount = liveZoneCount(columns, rows);
  const closures = Math.max(0, zoneCount - 1);
  const interval = tuning.arena.zoneIntervalTicks;
  const warning = tuning.arena.zoneWarningTicks;
  const limit = tuning.arena.matchTickLimit;
  // A beat takes a band of rectangles, so the sheet costs as many beats as it
  // has bands - not as many as it has rectangles.
  const perClosure = Math.max(1, tuning.arena.zonesPerClosure);
  const beats = Math.ceil(closures / perClosure);
  const fullRedTicks = beats * interval + warning;
  // What the two multipliers add up to in the only unit that matters at the
  // table: how long a hull stands in front of a gun.
  const shotsToKill = Math.max(
    1,
    Math.ceil(
      (tuning.spaceshipMaxHp * tuning.arena.hullScaling) /
        Math.max(0.0001, tuning.friendlyProjectileDamage * tuning.arena.damageScaling)
    )
  );
  const redByEnd = Math.max(
    0,
    Math.min(closures, Math.floor((limit - warning) / interval) * perClosure)
  );

  const patchArena = (values: Partial<BalanceTuning["arena"]>) => {
    onChange({ ...tuning, arena: { ...tuning.arena, ...values } });
  };

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
            data-testid="arena-respread"
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

      <section className="card">
        <h4 className="card__subtitle">Корабль в матче</h4>
        <p className="screen__hint">
          Матч играется тем же кораблём, что и кампания, — но шестнадцать стволов на одном поле это
          плотность, которой в кампании нет: на кампанейских числах бой заканчивался за двадцать
          секунд, раньше первого сужения. Поэтому корпусу множитель, а выстрелу делитель. Числа
          действуют одинаково на игрока и на ботов — корабль в арене один на всех.
        </p>
        <div className="arena-controls">
          <NumberField
            caption="Корпус ×"
            min={0.1}
            step={0.1}
            value={tuning.arena.hullScaling}
            onChange={(hullScaling) => {
              patchArena({ hullScaling: Math.max(0.1, hullScaling) });
            }}
          />
          <NumberField
            caption="Урон ×"
            min={0.1}
            step={0.05}
            value={tuning.arena.damageScaling}
            onChange={(damageScaling) => {
              patchArena({ damageScaling: Math.max(0.1, damageScaling) });
            }}
          />
          <NumberField
            caption="Радиус скана (экранов)"
            min={0.5}
            step={0.5}
            value={tuning.arena.scanRadiusScreens}
            onChange={(scanRadiusScreens) => {
              patchArena({ scanRadiusScreens: Math.max(0.5, scanRadiusScreens) });
            }}
          />
          <SecondsField
            caption="Скан раз в"
            ticks={tuning.arena.scanCooldownTicks}
            onChange={(scanCooldownTicks) => {
              patchArena({ scanCooldownTicks });
            }}
          />
          <SecondsField
            caption="Метки держатся"
            ticks={tuning.arena.scanRevealTicks}
            onChange={(scanRevealTicks) => {
              patchArena({ scanRevealTicks });
            }}
          />
          <p className="hint" data-testid="arena-scan-reach">
            Скан находит всех в{" "}
            <strong>
              {String(Math.round(tuning.cameraViewWidth * tuning.arena.scanRadiusScreens))}
            </strong>{" "}
            единицах — это {String(round2(tuning.arena.scanRadiusScreens))} экрана при кадре в{" "}
            {String(Math.round(tuning.cameraViewWidth))}. Найденные держатся на радаре{" "}
            {formatTicks(tuning.arena.scanRevealTicks)}, следующий скан через{" "}
            {formatTicks(tuning.arena.scanCooldownTicks)}.
          </p>
          <p className="hint" data-testid="arena-ship-scaling">
            Корпус {String(Math.round(tuning.spaceshipMaxHp))} →{" "}
            <strong>{String(Math.round(tuning.spaceshipMaxHp * tuning.arena.hullScaling))}</strong>{" "}
            HP, снаряд {String(round2(tuning.friendlyProjectileDamage))} →{" "}
            <strong>
              {String(round2(tuning.friendlyProjectileDamage * tuning.arena.damageScaling))}
            </strong>
            , пулемёт {String(round2(tuning.mgDamage))} →{" "}
            <strong>{String(round2(tuning.mgDamage * tuning.arena.damageScaling))}</strong>. Это{" "}
            <strong>{String(shotsToKill)}</strong> {shotWord(shotsToKill)} из пушки, чтобы снять
            целый корпус.
          </p>
        </div>
      </section>

      <section className="card">
        <h4 className="card__subtitle">Как закрывается поле</h4>
        <p className="screen__hint">
          Зона сначала желтеет, потом начинает убивать. Урон идёт тиками: за один тик снимается доля
          максимума корпуса, равная единице, делённой на число тиков до гибели — поэтому корабль,
          который успевает чиниться, живёт дольше шести тиков, а зашедший целым умирает ровно на
          шестом.
        </p>
        <div className="arena-controls">
          <SecondsField
            caption="Новая зона каждые"
            ticks={tuning.arena.zoneIntervalTicks}
            onChange={(zoneIntervalTicks) => {
              patchArena({ zoneIntervalTicks });
            }}
          />
          <NumberField
            caption="Зон за раз"
            min={1}
            value={tuning.arena.zonesPerClosure}
            onChange={(zonesPerClosure) => {
              patchArena({ zonesPerClosure: Math.max(1, Math.round(zonesPerClosure)) });
            }}
          />
          <SecondsField
            caption="Жёлтая держится"
            ticks={tuning.arena.zoneWarningTicks}
            onChange={(zoneWarningTicks) => {
              patchArena({ zoneWarningTicks });
            }}
          />
          <SecondsField
            caption="Тик урона каждые"
            ticks={tuning.arena.zoneDamageIntervalTicks}
            onChange={(zoneDamageIntervalTicks) => {
              patchArena({ zoneDamageIntervalTicks });
            }}
          />
          <NumberField
            caption="Тиков до гибели"
            min={1}
            value={tuning.arena.zoneBitesToKill}
            onChange={(zoneBitesToKill) => {
              patchArena({ zoneBitesToKill: Math.max(1, Math.round(zoneBitesToKill)) });
            }}
          />
          <SecondsField
            caption="Матч длится"
            ticks={limit}
            onChange={(matchTickLimit) => {
              patchArena({ matchTickLimit });
            }}
          />
          <p className="hint">
            За тик снимается {(100 / tuning.arena.zoneBitesToKill).toFixed(1)}% максимума корпуса.
          </p>
          <p className="hint" data-testid="arena-closure-budget">
            Сетка {String(columns)}×{String(rows)} — это {String(zoneCount)} {zoneWord(zoneCount)}{" "}
            на диске, закрывается {String(closures)} за {String(beats)} {beatWord(beats)}. Всё поле
            краснеет за <strong>{formatTicks(fullRedTicks)}</strong>. За матч в {formatTicks(limit)}{" "}
            успеет покраснеть {String(redByEnd)} из {String(closures)}
            {redByEnd < closures
              ? ` — чтобы поле закрылось целиком, отрезок нужен раз в ${formatTicks(
                  Math.max(1, Math.floor((limit - warning) / Math.max(1, beats)))
                )}.`
              : "."}
          </p>
        </div>
      </section>

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
