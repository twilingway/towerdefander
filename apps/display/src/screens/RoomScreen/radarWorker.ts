import { drawCombatRadar, easeRing, RADAR_UNITS, ringFraction } from "./combatRadarPainter.js";
import type { RadarFrame } from "./radarFrame.js";

/**
 * The radar, drawn on a thread of its own.
 *
 * On a Redmi 4X the dial's drawing was worth four to five frames a second of the
 * thread that also draws the world - geometry, outlined text and a canvas handed
 * back to the GPU thirty times a second. The canvas itself is handed here once
 * (`transferControlToOffscreen`), and from then on the page only posts the few
 * numbers the dial shows. The rate is the page's: a frame is drawn when one
 * arrives, so the dial stays exactly as live as it was.
 */
export type ToRadarWorker =
  | { readonly type: "canvas"; readonly canvas: OffscreenCanvas }
  | {
      readonly type: "frame";
      readonly frame: RadarFrame;
      /** The backing store's side in device pixels; the page measures its box. */
      readonly side: number;
      /** Milliseconds since the previous frame, which the rings ease over. */
      readonly elapsedMs: number;
    };

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ToRadarWorker>) => void) | null;
};

let canvas: OffscreenCanvas | undefined;
let context: OffscreenCanvasRenderingContext2D | null = null;
let shownRings: { hull: number; shield: number } | undefined;

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "canvas") {
    canvas = message.canvas;
    context = canvas.getContext("2d");
    return;
  }
  if (canvas === undefined || context === null || message.side <= 0) return;
  if (canvas.width !== message.side) {
    canvas.width = message.side;
    canvas.height = message.side;
  }
  const { frame } = message;
  const target = {
    hull: ringFraction(frame.spaceship.hp, frame.spaceship.maxHp),
    shield: ringFraction(frame.shield.energy, frame.shield.capacity)
  };
  shownRings =
    shownRings === undefined
      ? target
      : {
          hull: easeRing(shownRings.hull, target.hull, message.elapsedMs),
          shield: easeRing(shownRings.shield, target.shield, message.elapsedMs)
        };
  const scale = message.side / RADAR_UNITS;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  drawCombatRadar(context, frame, shownRings);
};
