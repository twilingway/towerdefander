import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";

import {
  createRadarProjection,
  getShieldStatusLabel,
  projectWorldToRadar
} from "../../model/combatHudViewModel.js";

/**
 * The radar, drawn into a canvas.
 *
 * It used to be an SVG rebuilt three times a second, and it was the dearest
 * panel on the battle screen - ten milliseconds a second of the twenty-five the
 * whole interface cost, because a couple of hundred nodes were reconciled and
 * laid out to move a dozen dots. The reference prototype measured the same two
 * radars against each other and the canvas one won by thirteen times, 0.059 ms
 * a frame against 0.798; this is that comparison taken at its word.
 *
 * Everything is drawn in a fixed two-hundred unit square and scaled to whatever
 * the box happens to be, so the geometry below reads as absolute numbers and
 * the layout does not change with the screen. The old SVG let its rings and
 * labels spill outside that square with `overflow: visible`, which is why the
 * bottom of the dial was cut off against the edge of the window - here nothing
 * is allowed past the edge, and the numbers below say where the edge is.
 */

/** The side of the space every coordinate here is expressed in. */
export const RADAR_UNITS = 200;
const CENTRE = RADAR_UNITS / 2;
/** The map itself; everything else is a ring or a label outside it. */
const MAP_RADIUS = 62;
const HULL_RING_RADIUS = 71;
const SHIELD_RING_RADIUS = 80;
/** The hull's numbers read inside its ring, the shield's outside its own. */
const HULL_LABEL_RADIUS = HULL_RING_RADIUS - 9;
const SHIELD_LABEL_RADIUS = SHIELD_RING_RADIUS + 6;
/**
 * The rings are open at the bottom: they run from half past seven clockwise to
 * half past four, and the quarter turn left over is where the numbers go. A
 * closed ring has nowhere to say what its ends mean.
 */
const ARC_START = (135 * Math.PI) / 180;
const ARC_SWEEP = 0.75 * Math.PI * 2;
const SHIELD_STROKE = "#4fb8ff";
const FONT_STACK = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

/**
 * The part of a 2D context this uses, and nothing more.
 *
 * Narrow on purpose: a test can hand in a recorder and read back what was
 * drawn, which is the only way to check a canvas at all - there is no markup to
 * search afterwards.
 */
export interface RadarContext {
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, from: number, to: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  /*
   * Wider than this file writes, because the browser's own context declares
   * them so: a real canvas accepts a gradient or a pattern here, and a
   * narrower type would not be satisfied by the thing it exists to describe.
   */
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
}

/**
 * Where the two gauges are drawn, which is not always where they are.
 *
 * The numbers beside them are the authoritative ones; the arcs are eased toward
 * them, because a shield that empties at twenty a second arrives in steps of a
 * third of the ring and reads as a fault rather than as a drain.
 */
export interface RingFractions {
  readonly hull: number;
  readonly shield: number;
}

/**
 * One step of the easing, per redraw.
 *
 * A fifth of the remaining distance twenty times a second lands within a
 * percent of the target in about a third of a second - fast enough that a hit
 * is felt, slow enough that the arc slides. A jump of more than half the ring
 * is taken whole: that is a new run or a repair bay, not a drain.
 */
export const RING_POLL_MS = 50;
/**
 * How fast the arc closes on its target, as a time constant in ms.
 *
 * Derived rather than chosen: the arc used to take a fifth of the remaining gap
 * on every paint, and paints were a fixed 50 ms apart, so the rate it actually
 * had is `exp(-50 / 224) = 0.8`. Keeping that number means this change fixes the
 * stutter without also making the gauge feel different.
 */
export const RING_APPROACH_MS = 224;

export function easeRing(shown: number, target: number, elapsedMs = RING_POLL_MS): number {
  const distance = target - shown;
  if (Math.abs(distance) > 0.5 || Math.abs(distance) < 0.002) return target;
  // Time, not paints. A fifth of the gap per paint is only a fixed speed while
  // the paints are evenly spaced, and in a fight they are not: the dial is
  // polled off the frame clock, so a busy frame stretches the gap to 50 or 66 ms
  // and the arc lurches by two or three times as much as it should. Reading the
  // elapsed time makes the arc move at one speed whenever it happens to be
  // drawn, which is what the intermission made look correct and the fight did
  // not.
  return shown + distance * (1 - Math.exp(-Math.max(0, elapsedMs) / RING_APPROACH_MS));
}

/** A missing or zero capacity reads as an empty ring, never as a full one. */
export function ringFraction(value: number, capacity: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(capacity) || capacity <= 0) return 0;
  return Math.min(1, Math.max(0, value / capacity));
}

/**
 * Full hull is green and a dying one is red, with everything between as one
 * slide rather than three steps: a gauge that changes colour only at a
 * threshold reads as fine right up until the moment it does not.
 */
export function hullStroke(fraction: number): string {
  const hue = 138 * Math.min(1, Math.max(0, (fraction - 0.1) / 0.65));
  return `hsl(${String(Math.round(hue))} 72% 52%)`;
}

function roundedPlate(
  context: RadarContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.arc(x + width - radius, y + radius, radius, -Math.PI / 2, 0);
  context.lineTo(x + width, y + height - radius);
  context.arc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2);
  context.lineTo(x + radius, y + height);
  context.arc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI);
  context.lineTo(x, y + radius);
  context.arc(x + radius, y + radius, radius, Math.PI, (3 * Math.PI) / 2);
  context.closePath();
}

/** Text with a dark outline behind it, so a number stays readable over a blip. */
function plateText(context: RadarContext, text: string, x: number, y: number): void {
  context.strokeStyle = "rgb(3 20 29 / 85%)";
  context.lineWidth = 3;
  context.strokeText(text, x, y);
  context.fillText(text, x, y);
}

function drawRing(
  context: RadarContext,
  radius: number,
  fraction: number,
  stroke: string,
  width: number
): void {
  context.lineCap = "round";
  context.strokeStyle = "rgb(255 255 255 / 9%)";
  context.lineWidth = width;
  context.beginPath();
  context.arc(CENTRE, CENTRE, radius, ARC_START, ARC_START + ARC_SWEEP);
  context.stroke();
  if (fraction <= 0) return;
  context.strokeStyle = stroke;
  context.beginPath();
  context.arc(CENTRE, CENTRE, radius, ARC_START, ARC_START + ARC_SWEEP * fraction);
  context.stroke();
}

/** A number parked at one end of an arc, on the side that keeps it inside. */
function scaleLabel(context: RadarContext, radius: number, angle: number, text: string): void {
  const x = CENTRE + Math.cos(angle) * radius;
  const y = CENTRE + Math.sin(angle) * radius;
  context.textAlign = x < CENTRE ? "end" : "start";
  context.textBaseline = "middle";
  plateText(context, text, x, y);
}

/**
 * One full redraw, from the newest snapshot there is.
 *
 * Called every frame off the same reference the scene draws from, which is the
 * other half of the move: the old dial polled a snapshot the page had last
 * rendered, and once the page stopped re-rendering during combat that snapshot
 * stopped moving - the radar showed the first wave and then held it.
 */
export function drawCombatRadar(
  context: RadarContext,
  game: DisplayGameSnapshot,
  rings: RingFractions = {
    hull: ringFraction(game.spaceship.hp, game.spaceship.maxHp),
    shield: ringFraction(game.shield.energy, game.shield.capacity)
  }
): void {
  const projection = createRadarProjection(game.arenaRadius, RADAR_UNITS, CENTRE - MAP_RADIUS);
  const { hull, shield } = rings;

  context.clearRect(0, 0, RADAR_UNITS, RADAR_UNITS);

  context.fillStyle = "rgb(3 25 34 / 70%)";
  context.beginPath();
  context.arc(CENTRE, CENTRE, MAP_RADIUS, 0, Math.PI * 2);
  context.fill();

  context.save();
  // Everything on the map is clipped to it, the way the SVG clip path did it:
  // a ship at the rim must not draw over the rings that surround the dial.
  context.beginPath();
  context.arc(CENTRE, CENTRE, MAP_RADIUS, 0, Math.PI * 2);
  context.clip();

  context.strokeStyle = "rgb(72 212 221 / 18%)";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(CENTRE, CENTRE, MAP_RADIUS * 0.5, 0, Math.PI * 2);
  context.moveTo(CENTRE - MAP_RADIUS, CENTRE);
  context.lineTo(CENTRE + MAP_RADIUS, CENTRE);
  context.moveTo(CENTRE, CENTRE - MAP_RADIUS);
  context.lineTo(CENTRE, CENTRE + MAP_RADIUS);
  context.stroke();

  /*
   * Batched by colour rather than drawn one at a time: setting a fill per blip
   * would be a couple of hundred state changes a frame, and state changes are
   * most of what a 2D context costs at this size.
   */
  for (const wave of [false, true]) {
    context.fillStyle = wave ? "rgb(196 206 222 / 90%)" : "rgb(120 130 145 / 55%)";
    context.beginPath();
    for (const asteroid of game.asteroids) {
      if ((asteroid.origin === "wave") !== wave) continue;
      const point = projectWorldToRadar(
        asteroid.x,
        asteroid.y,
        game.worldWidth,
        game.worldHeight,
        projection
      );
      context.moveTo(point.x + 2.4, point.y);
      context.arc(point.x, point.y, 2.4, 0, Math.PI * 2);
    }
    context.fill();
  }

  // Salvage is the one marker the pilot chases rather than avoids, so it keeps
  // its own shape as well as its own colour.
  for (const cell of [false, true]) {
    context.fillStyle = cell ? "rgb(126 200 242 / 90%)" : "rgb(126 242 164 / 90%)";
    context.beginPath();
    for (const drop of game.lootDrops) {
      if ((drop.kind === "shieldCell") !== cell) continue;
      const point = projectWorldToRadar(
        drop.x,
        drop.y,
        game.worldWidth,
        game.worldHeight,
        projection
      );
      context.moveTo(point.x, point.y - 3.2);
      context.lineTo(point.x + 3.2, point.y);
      context.lineTo(point.x, point.y + 3.2);
      context.lineTo(point.x - 3.2, point.y);
      context.closePath();
    }
    context.fill();
  }

  context.fillStyle = "#ff625e";
  context.strokeStyle = "#ffd0ca";
  context.lineWidth = 1.2;
  context.beginPath();
  for (const enemy of game.enemyShips) {
    const point = projectWorldToRadar(
      enemy.x,
      enemy.y,
      game.worldWidth,
      game.worldHeight,
      projection
    );
    context.moveTo(point.x + 3.2, point.y);
    context.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
  }
  context.fill();
  context.stroke();

  const ship = projectWorldToRadar(
    game.spaceship.x,
    game.spaceship.y,
    game.worldWidth,
    game.worldHeight,
    projection
  );
  context.fillStyle = "rgb(4 34 40 / 92%)";
  context.strokeStyle = "#69f3e7";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(ship.x, ship.y, 7, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  // The nose, pointed the way the hull is: the same arrow the SVG carried, laid
  // out by hand because a canvas has no transform stack worth spending here.
  const nose = game.spaceship.heading;
  context.fillStyle = "#b9fff8";
  context.beginPath();
  for (const [along, across] of [
    [6, 0],
    [-5, 4],
    [-3, 0],
    [-5, -4]
  ] as const) {
    const x = ship.x + Math.cos(nose) * along - Math.sin(nose) * across;
    const y = ship.y + Math.sin(nose) * along + Math.cos(nose) * across;
    if (along === 6) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
  context.restore();

  context.strokeStyle = "rgb(71 224 233 / 45%)";
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(CENTRE, CENTRE, MAP_RADIUS, 0, Math.PI * 2);
  context.stroke();

  drawRing(context, HULL_RING_RADIUS, hull, hullStroke(hull), 5);
  drawRing(context, SHIELD_RING_RADIUS, shield, SHIELD_STROKE, 3);

  context.font = `800 9px ${FONT_STACK}`;
  context.fillStyle = "#bdfaff";
  scaleLabel(context, HULL_LABEL_RADIUS, ARC_START, "0");
  scaleLabel(
    context,
    HULL_LABEL_RADIUS,
    ARC_START + ARC_SWEEP,
    `${String(Math.ceil(game.spaceship.hp))} / ${String(Math.round(game.spaceship.maxHp))}`
  );
  context.fillStyle = SHIELD_STROKE;
  scaleLabel(context, SHIELD_LABEL_RADIUS, ARC_START, "0");
  scaleLabel(
    context,
    SHIELD_LABEL_RADIUS,
    ARC_START + ARC_SWEEP,
    `${String(Math.round(game.shield.energy))} / ${String(Math.round(game.shield.capacity))}`
  );

  context.font = `800 9px ${FONT_STACK}`;
  context.fillStyle = game.shieldPhase === "up" ? "#75d8ff" : "#9ad7ff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  plateText(
    context,
    getShieldStatusLabel(game.shieldPhase, game.shield.rearmRequired, game.shield.energy),
    CENTRE,
    CENTRE + MAP_RADIUS * 0.62
  );

  // Speed sits in the opening at the bottom of the dial, on its own plate,
  // where a fitting screen keeps it.
  const speed = Math.hypot(game.spaceship.velocityX, game.spaceship.velocityY);
  context.fillStyle = "rgb(3 20 29 / 88%)";
  context.strokeStyle = "rgb(86 235 240 / 45%)";
  context.lineWidth = 1;
  roundedPlate(context, CENTRE - 34, CENTRE + MAP_RADIUS + 4, 68, 17, 8);
  context.fill();
  context.stroke();
  context.font = `800 11px ${FONT_STACK}`;
  context.fillStyle = "#bdfaff";
  plateText(context, `${String(Math.round(speed))} ед/с`, CENTRE, CENTRE + MAP_RADIUS + 13);
}
