import { ENEMY_SHAPES } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import { previewScale, shapeDrawing, shapeReach, toSvgPoints } from "./enemyShapes.js";

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

  it("keeps the scale proportional while everything fits", () => {
    const box = 132;
    const small = previewScale(20, 1, "arrowhead", box);
    const large = previewScale(40, 1, "arrowhead", box);
    // Same factor means a twice bigger hull really draws twice as big.
    expect(large.factor).toBeCloseTo(small.factor);
    expect(large.fitted).toBe(false);
  });

  it("zooms out instead of letting a large enemy spill out of the frame", () => {
    const box = 132;
    const huge = previewScale(400, 1, "arrowhead", box);
    expect(huge.fitted).toBe(true);
    expect(400 * huge.factor).toBeLessThanOrEqual(box * 0.46 + 1e-9);
  });

  it("accounts for the model scale when fitting", () => {
    const box = 132;
    const plain = previewScale(90, 1, "hexagon", box);
    const oversized = previewScale(90, 4, "hexagon", box);
    // A model four times the hitbox has to zoom out; the hitbox stays smaller.
    expect(oversized.fitted).toBe(true);
    expect(oversized.factor).toBeLessThan(plain.factor);
    expect(90 * 4 * oversized.factor).toBeLessThanOrEqual(box * 0.46 + 1e-9);
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
