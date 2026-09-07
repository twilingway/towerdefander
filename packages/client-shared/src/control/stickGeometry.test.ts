import { describe, expect, it } from "vitest";

import { isInDriveZone, readStick } from "./stickGeometry.js";

const ANCHOR = { x: 100, y: 100 };
const RADIUS = 50;

describe("stick geometry", () => {
  it("reads nothing inside the dead zone", () => {
    // Five pixels out on a fifty-pixel ring with a 12% zone: inside by a hair.
    const reading = readStick(ANCHOR, { x: 105, y: 100 }, RADIUS, 0.12);
    expect(reading.strength).toBe(0);
    expect(reading.vector).toEqual({ x: 0, y: 0 });
    // The knob still tracks the thumb, or the stick would look frozen.
    expect(reading.knob).toEqual({ x: 5, y: 0 });
  });

  it("ramps strength from the dead-zone edge, not from the centre", () => {
    // Halfway across the travel that is left: 6 + (50 - 6) / 2 = 28.
    const reading = readStick(ANCHOR, { x: 128, y: 100 }, RADIUS, 0.12);
    expect(reading.strength).toBeCloseTo(0.5, 5);
    // ...while the direction is still divided by the full radius, so it has
    // NOT reached full deflection at the same moment strength did.
    expect(reading.vector.x).toBeCloseTo(28 / 50, 5);
  });

  it("still reaches full strength at the ring", () => {
    const reading = readStick(ANCHOR, { x: 150, y: 100 }, RADIUS, 0.12);
    expect(reading.strength).toBe(1);
    expect(reading.vector.x).toBeCloseTo(1, 5);
  });

  it("saturates past the ring instead of running away", () => {
    const far = readStick(ANCHOR, { x: 400, y: 100 }, RADIUS, 0.12);
    expect(far.strength).toBe(1);
    expect(far.knob).toEqual({ x: RADIUS, y: 0 });
    expect(Math.hypot(far.vector.x, far.vector.y)).toBeCloseTo(1, 5);
  });

  it("keeps the direction the thumb asked for", () => {
    const reading = readStick(ANCHOR, { x: 100, y: 40 }, RADIUS, 0.12);
    expect(reading.vector.x).toBeCloseTo(0, 5);
    expect(reading.vector.y).toBeCloseTo(-1, 5);
  });

  it("behaves like the coop stick when the dead zone is zero", () => {
    const reading = readStick(ANCHOR, { x: 125, y: 100 }, RADIUS, 0);
    expect(reading.strength).toBeCloseTo(0.5, 5);
    expect(reading.vector.x).toBeCloseTo(0.5, 5);
  });

  it("refuses a degenerate ring rather than dividing by it", () => {
    expect(readStick(ANCHOR, { x: 120, y: 100 }, 0, 0.12).strength).toBe(0);
  });

  it("splits the viewport by share, so rotating the phone moves the seam", () => {
    expect(isInDriveZone(300, 1000, 0.42)).toBe(true);
    expect(isInDriveZone(500, 1000, 0.42)).toBe(false);
    // The same finger on a narrower viewport is now on the aim side.
    expect(isInDriveZone(300, 600, 0.42)).toBe(false);
  });
});
