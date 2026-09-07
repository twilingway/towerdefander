import { describe, expect, it } from "vitest";

import { HEADING_DEADBAND_RADIANS, smoothHeading, smoothHeadingVector } from "./headingSmoother.js";

const DEGREE = Math.PI / 180;

describe("heading smoothing", () => {
  it("honours a fresh grab at once, rather than starting late", () => {
    expect(smoothHeading(null, 1.2, 0.02)).toBe(1.2);
  });

  it("drops noise smaller than the dead band", () => {
    // Two degrees of thumb wobble is what a two-pixel slip measures as.
    const held = 0;
    expect(smoothHeading(held, 2 * DEGREE, 0.02)).toBe(held);
    expect(HEADING_DEADBAND_RADIANS).toBeCloseTo(3 * DEGREE, 10);
  });

  it("follows a real steering input", () => {
    const next = smoothHeading(0, 45 * DEGREE, 0.02);
    expect(next).toBeGreaterThan(0);
    // Eased, not snapped: a 60 ms filter has not arrived in one 20 ms tick.
    expect(next).toBeLessThan(45 * DEGREE);
  });

  it("closes to within the dead band and then stops chasing", () => {
    let held = 0;
    for (let tick = 0; tick < 40; tick += 1) held = smoothHeading(held, 45 * DEGREE, 0.02);

    // It does not land exactly on the target, and should not: the last few
    // degrees are inside the dead band, which is the whole mechanism. Chasing
    // them would be chasing the noise this exists to drop.
    const remaining = Math.abs(45 * DEGREE - held);
    expect(remaining).toBeLessThan(HEADING_DEADBAND_RADIANS);
    expect(remaining).toBeGreaterThan(0);
  });

  it("takes the short way round rather than spinning through the whole circle", () => {
    // From just under +180 to just over -180 is two degrees, not three hundred.
    const held = 179 * DEGREE;
    const raw = -179 * DEGREE;
    const next = smoothHeading(held, raw, 1);
    // Whatever it lands on, it must not have travelled backwards through zero.
    expect(Math.abs(next)).toBeGreaterThan(170 * DEGREE);
  });

  it("reports nothing for a stick at rest", () => {
    expect(smoothHeadingVector(0, { x: 0, y: 0 }, 0.02)).toBeNull();
  });

  it("gives back a unit vector on the smoothed bearing", () => {
    const result = smoothHeadingVector(null, { x: 0, y: 2 }, 0.02);
    expect(result).not.toBeNull();
    expect(Math.hypot(result?.x ?? 0, result?.y ?? 0)).toBeCloseTo(1, 10);
    expect(result?.heading).toBeCloseTo(Math.PI / 2, 10);
  });

  it("cannot be made to divide by a zero time step", () => {
    expect(smoothHeading(0, 1, 0)).toBe(1);
    expect(smoothHeading(0, 1, 0.02, { tauSeconds: 0 })).toBe(1);
  });
});
