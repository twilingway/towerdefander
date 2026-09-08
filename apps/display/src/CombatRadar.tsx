import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { useEffect, useRef } from "react";

import { drawCombatRadar, easeRing, RADAR_UNITS, ringFraction } from "./combatRadarPainter.js";

/**
 * The radar, on the canvas and on the frame clock.
 *
 * Two things changed at once here, and they are the same thing. It stopped
 * being an SVG - a couple of hundred nodes reconciled and laid out three times
 * a second to move a dozen dots, the dearest panel on the battle screen at ten
 * milliseconds a second - and it stopped being polled from what the page had
 * last rendered. That second half was a real fault: once the page stopped
 * re-rendering during combat, the snapshot it polled stopped moving, and the
 * dial showed the first wave and then held it.
 *
 * Now it draws every frame from the newest snapshot there is, the same one the
 * scene draws from, and costs nothing React can see.
 */

/** How far a device pixel ratio is worth following; past this it is only heat. */
const MAX_PIXEL_RATIO = 2.5;
/**
 * How often the dial is redrawn.
 *
 * Twenty times a second, not every frame. Drawn on the frame clock it was the
 * third most expensive thing in a profile of a real wave - fifty-five
 * milliseconds a second, most of it in text with an outline behind it and in
 * five attribute reads - and none of that buys anything on a dial that spans
 * the whole arena, where a dot moves a pixel a second. Twenty is still six
 * times fresher than the poll this replaced.
 */
const REDRAW_INTERVAL_MS = 50;

interface RadarAttributes {
  readonly "data-enemy-count": string;
  readonly "data-asteroid-count": string;
  readonly "data-loot-count": string;
  readonly "data-hull-fraction": string;
  readonly "data-shield-fraction": string;
}

/**
 * What the arena looks like as text.
 *
 * The browser suite counts enemies off this element and waits on it, so the
 * numbers keep being published even though nothing on screen is made of them
 * any more. Written straight to the node rather than rendered: a dial that
 * re-rendered the page ten times a second to move a number no one reads would
 * be the cost this whole change removes.
 */
function radarAttributes(game: DisplayGameSnapshot): RadarAttributes {
  return {
    "data-enemy-count": String(game.enemyShips.length),
    "data-asteroid-count": String(game.asteroids.length),
    "data-loot-count": String(game.lootDrops.length),
    "data-hull-fraction": ringFraction(game.spaceship.hp, game.spaceship.maxHp).toFixed(2),
    "data-shield-fraction": ringFraction(game.shield.energy, game.shield.capacity).toFixed(2)
  };
}

/**
 * The dial itself.
 *
 * The name is what it always was, and so are its props: the page hands it a way
 * to read the world and nothing else, so nothing above it has to change.
 */
export function PolledCombatRadar({
  read
}: {
  readonly read: () => DisplayGameSnapshot | undefined;
}) {
  const host = useRef<HTMLElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let frame = 0;
    let backingSide = 0;
    let paintedAt = 0;
    // Where the two arcs currently stand; the numbers beside them are exact.
    let shownRings: { hull: number; shield: number } | undefined;
    let context: CanvasRenderingContext2D | null = null;

    const paint = (): void => {
      frame = requestAnimationFrame(paint);
      const now = performance.now();
      if (now - paintedAt < REDRAW_INTERVAL_MS) return;
      paintedAt = now;
      const element = canvas.current;
      const shell = host.current;
      if (element === null || shell === null) return;
      const game = read();
      if (game === undefined) return;

      /*
       * The box is measured, not assumed: the radar's width is a clamp on the
       * viewport, so a rotated phone or a resized window changes it under us,
       * and a backing store left at the old size is what makes a canvas look
       * soft.
       */
      const ratio = Math.min(MAX_PIXEL_RATIO, Math.max(1, globalThis.devicePixelRatio || 1));
      const box = element.clientWidth || element.getBoundingClientRect().width;
      const side = Math.round(box * ratio);
      if (side <= 0) return;
      if (side !== backingSide) {
        element.width = side;
        element.height = side;
        backingSide = side;
        context = element.getContext("2d");
      }
      if (context === null) return;

      const target = {
        hull: ringFraction(game.spaceship.hp, game.spaceship.maxHp),
        shield: ringFraction(game.shield.energy, game.shield.capacity)
      };
      shownRings =
        shownRings === undefined
          ? target
          : {
              hull: easeRing(shownRings.hull, target.hull),
              shield: easeRing(shownRings.shield, target.shield)
            };

      const scale = side / RADAR_UNITS;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      drawCombatRadar(context, game, shownRings);

      const attributes = radarAttributes(game);
      for (const name of Object.keys(attributes) as (keyof RadarAttributes)[]) {
        const value = attributes[name];
        if (shell.getAttribute(name) !== value) shell.setAttribute(name, value);
      }
    };

    frame = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [read]);

  return (
    <aside
      ref={host}
      className="combat-radar"
      data-testid="combat-radar"
      aria-label="Мини-карта арены по центру снизу"
    >
      <canvas ref={canvas} data-testid="combat-radar-canvas" />
      <span className="sr-only">
        Внутреннее кольцо — прочность корпуса, внешнее — энергия щита; оба пустеют к шести часам.
        Число под кругом — скорость корабля. Астероиды показаны точками: светлые дают кредиты,
        тёмные — только очки. Ракеты и снаряды на мини-карте не отображаются.
      </span>
    </aside>
  );
}
