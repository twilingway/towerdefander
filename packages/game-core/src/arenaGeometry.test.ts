import { describe, expect, it } from "vitest";

import {
  ARENA_CUSHION_BAND,
  applyArenaCushion,
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

  it("leaves a hull outside the elastic band alone", () => {
    // Legal radius here is 90, so the band starts well outside this point.
    const velocity = { x: 40, y: 0 };
    const outside = applyArenaCushion({ x: 100, y: 100, radius: 10, velocity }, arena, 0.05, 20);

    expect(outside).toEqual(velocity);
  });

  it("pushes back harder the deeper and the faster the hull came in", () => {
    const shallow = applyArenaCushion(
      { x: 180, y: 100, radius: 10, velocity: { x: 40, y: 0 } },
      arena,
      0.05
    );
    const deep = applyArenaCushion(
      { x: 188, y: 100, radius: 10, velocity: { x: 40, y: 0 } },
      arena,
      0.05
    );
    const faster = applyArenaCushion(
      { x: 180, y: 100, radius: 10, velocity: { x: 90, y: 0 } },
      arena,
      0.05
    );

    // Every one of them is slowed, and depth and entry speed each add to it.
    expect(shallow.x).toBeLessThan(40);
    expect(deep.x).toBeLessThan(shallow.x);
    expect(90 - faster.x).toBeGreaterThan(40 - shallow.x);
    // Only the outward axis is touched.
    expect(shallow.y).toBe(0);
  });

  it("leaves a hull heading back inward to its own devices", () => {
    const inward = applyArenaCushion(
      { x: 185, y: 100, radius: 10, velocity: { x: -40, y: 0 } },
      arena,
      0.05
    );

    // The spring still pulls in, but nothing is added for outward speed there.
    expect(inward.x).toBeLessThan(-40);
    expect(ARENA_CUSHION_BAND).toBeGreaterThan(0);
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
