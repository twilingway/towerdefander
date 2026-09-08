import Phaser from "phaser";
import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";

import {
  getShieldArcRange,
  getShieldCrescentPoints,
  getShieldDashSegments,
  getShieldVisualStyle
} from "../spaceshipViewModel.js";

/** Bakes a drawing centred on zero and hands back its texture key. */
type BakeShape = (
  key: string,
  half: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void
) => string;

/**
 * The shield, baked once per state and turned to its bearing.
 *
 * It was the last drawing left on the field, and the dearest: a hundred-point
 * crescent, filled - which means triangulated - on every frame the sector was
 * up, and a profile of a real wave put the tessellator and the graphics batcher
 * at the top with it.
 *
 * It was drawn that way for a reason that no longer holds. Turning it used to
 * tear the bloom off, because a `Graphics` object carries no width or height,
 * Phaser calls it poorly bounded, and the focus region its filter is composited
 * through does not follow a rotation. An `Image` has a size, so the filter
 * follows the object like any other; the arc is baked centred on zero and the
 * image is simply turned.
 */
export function drawShield(
  shield: Phaser.GameObjects.Image,
  hull: { readonly x: number; readonly y: number },
  snapshot: DisplayGameSnapshot,
  bearing: number,
  visible: boolean,
  bake: BakeShape
): void {
  const style = getShieldVisualStyle(snapshot.shield.active);
  const radius = snapshot.shieldRadius;
  const half = snapshot.shield.arcHalfAngle;
  // The bake is keyed by everything that changes its shape; the bearing is not
  // one of those things, which is the whole point.
  const key = `shield:${snapshot.shield.active ? "up" : "down"}:${String(Math.round(radius))}:${half.toFixed(3)}`;
  const extent = radius + style.lineWidth + 4;
  shield.setTexture(
    bake(key, extent, (graphics) => {
      const arc = getShieldArcRange(0, half);
      graphics.lineStyle(style.lineWidth, style.color, style.alpha);
      if (style.crescentThickness !== null) {
        const crescent = getShieldCrescentPoints(
          arc.start,
          arc.end,
          radius,
          style.crescentThickness
        );
        if (crescent.length > 0) {
          graphics.fillStyle(style.color, style.alpha);
          graphics.fillPoints(
            crescent.map((point) => new Phaser.Math.Vector2(point.x, point.y)),
            true,
            true
          );
        }
      } else if (style.dash === null) {
        graphics.beginPath();
        graphics.arc(0, 0, radius, arc.start, arc.end, false);
        graphics.strokePath();
      } else {
        for (const segment of getShieldDashSegments(arc.start, arc.end, radius, style.dash)) {
          graphics.beginPath();
          graphics.arc(0, 0, radius, segment.start, segment.end, false);
          graphics.strokePath();
        }
      }
    })
  );
  shield.setPosition(hull.x, hull.y);
  shield.setRotation(bearing);
  shield.setVisible(visible);
}
