import { ENEMY_SHAPES } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import {
  SPACESHIP_WORLD_RADIUS,
  modelWorldRadius,
  previewScale,
  shapeDrawing,
  shapeReach,
  toSvgPoints
} from "./enemyShapes.js";

describe("preview geometry", () => {
  it("draws something for every shape the protocol allows", () => {
    for (const shape of ENEMY_SHAPES) {
      const drawing = shapeDrawing(shape, 40);
      const marks = drawing.polygon.length + drawing.circles.length;
      expect(marks, `shape ${shape} draws nothing`).toBeGreaterThan(0);
    }
  });

  it("scales with the radius", () => {
    for (const shape of ENEMY_SHAPES) {
      const small = shapeDrawing(shape, 10);
      const large = shapeDrawing(shape, 80);
      const reach = (points: readonly { readonly x: number; readonly y: number }[]) =>
        Math.max(0, ...points.map(({ x, y }) => Math.hypot(x, y)));
      const smallReach = reach(small.polygon) + (small.circles[0]?.radius ?? 0);
      const largeReach = reach(large.polygon) + (large.circles[0]?.radius ?? 0);
      expect(largeReach, `shape ${shape} ignores radius`).toBeGreaterThan(smallReach);
    }
  });

  it("points the nose along +X so rotation matches the game", () => {
    for (const shape of ["arrowhead", "block", "diamond", "dart"] as const) {
      const { polygon } = shapeDrawing(shape, 40);
      const furthest = polygon.reduce((best, point) => (point.x > best.x ? point : best));
      expect(furthest.x, `shape ${shape} has no forward tip`).toBeGreaterThan(0);
      expect(Math.abs(furthest.y)).toBeLessThan(1e-9);
    }
  });

  it("keeps the rings still when only the model scale changes", () => {
    const box = 148;
    const plain = previewScale(28, 1, "arrowhead", box);
    const grown = previewScale(28, 2.6, "arrowhead", box);
    // Same hit radius means the same view scale: the rings must not move.
    expect(grown.factor).toBeCloseTo(plain.factor);
    expect(plain.modelOverflows).toBe(false);
    expect(grown.modelOverflows).toBe(true);
  });

  it("scales the view with the hit radius so bigger enemies read bigger", () => {
    const box = 148;
    // Below the player hull the reference keeps the scale fixed for comparison.
    expect(previewScale(20, 1, "arrowhead", box).factor).toBeCloseTo(
      previewScale(40, 1, "arrowhead", box).factor
    );
    // Past it, the hitbox drives the zoom and stays inside the frame.
    const boss = previewScale(90, 1, "hexagon", box);
    expect(boss.factor).toBeLessThan(previewScale(52, 1, "hexagon", box).factor);
    expect(90 * boss.factor).toBeLessThanOrEqual(box * 0.46 + 1e-9);
  });

  it("keeps both rings and their labels inside the frame", () => {
    const box = 148;
    const half = box * 0.46;
    for (const hitRadius of [8, 18, 28, 52, 90, 400]) {
      const { factor } = previewScale(hitRadius, 1, "arrowhead", box);
      expect(hitRadius * factor, `hit ring escapes at ${String(hitRadius)}`).toBeLessThan(half);
      expect(
        SPACESHIP_WORLD_RADIUS * factor,
        `ship ring escapes at ${String(hitRadius)}`
      ).toBeLessThan(half);
    }
  });

  it("reports the world radius the model occupies", () => {
    expect(modelWorldRadius(28, 2.6)).toBe(73);
    expect(modelWorldRadius(28, 1)).toBe(28);
  });

  it("measures how far each silhouette reaches past its radius", () => {
    // The diamond nose sticks out; the hexagon sits on its radius.
    expect(shapeReach("diamond")).toBeGreaterThan(1.2);
    expect(shapeReach("hexagon")).toBeCloseTo(1);
  });

  it("offsets svg points by the box centre", () => {
    expect(toSvgPoints([{ x: -10, y: 5 }], 60)).toBe("50,65");
  });
});
