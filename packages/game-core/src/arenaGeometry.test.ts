import { describe, expect, it } from "vitest";

import {
  constrainMovingCircleToArena,
  isCircleContainedInArena,
  isWithinCircularEnvelope,
  squaredDistance
} from "./arenaGeometry.ts";

const arena = { centerX: 100, centerY: 100, radius: 100 };

describe("circular arena geometry", () => {
  it("checks squared distance and full-circle containment", () => {
    expect(squaredDistance(0, 0, 3, 4)).toBe(25);
    expect(isCircleContainedInArena(190, 100, 10, arena)).toBe(true);
    expect(isCircleContainedInArena(190.001, 100, 10, arena)).toBe(false);
  });

  it("projects to the legal rim and removes only outward velocity", () => {
    const constrained = constrainMovingCircleToArena(
      { x: 200, y: 200, radius: 10, velocity: { x: 20, y: -10 } },
      arena
    );
    const normal = Math.SQRT1_2;

    expect(Math.hypot(constrained.x - 100, constrained.y - 100)).toBeCloseTo(90);
    expect(constrained.velocity.x * normal + constrained.velocity.y * normal).toBeCloseTo(0);
    expect(constrained.velocity.x * -normal + constrained.velocity.y * normal).toBeCloseTo(
      -30 * normal
    );
  });

  it("preserves inward velocity after projection", () => {
    const constrained = constrainMovingCircleToArena(
      { x: 205, y: 100, radius: 10, velocity: { x: -25, y: 8 } },
      arena
    );

    expect(constrained).toMatchObject({ x: 190, y: 100, velocity: { x: -25, y: 8 } });
  });

  it("does not invent a normal for a circle at the exact center", () => {
    expect(
      constrainMovingCircleToArena({ x: 100, y: 100, radius: 10, velocity: { x: 5, y: -7 } }, arena)
    ).toEqual({ x: 100, y: 100, velocity: { x: 5, y: -7 } });
  });

  it("checks a radial padded cleanup envelope", () => {
    expect(isWithinCircularEnvelope(210, 100, 10, arena, 20)).toBe(true);
    expect(isWithinCircularEnvelope(210.001, 100, 10, arena, 20)).toBe(false);
    expect(() => isWithinCircularEnvelope(100, 100, -1, arena, 20)).toThrow(RangeError);
    expect(() => isWithinCircularEnvelope(100, 100, 10, arena, -1)).toThrow(RangeError);
  });
});
