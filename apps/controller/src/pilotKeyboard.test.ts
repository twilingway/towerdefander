import { describe, expect, it } from "vitest";

import {
  BRAKE_KEY,
  THROTTLE_KEY,
  TURN_LEFT_KEY,
  TURN_RIGHT_KEY,
  ROTATE_IN_PLACE_THROTTLE,
  TURN_RATE_RADIANS_PER_SECOND,
  advanceHeadingDrive,
  getTurretKeyboardVector,
  toHelmKeys
} from "./pilotKeyboard.js";

describe("pilot keyboard drive", () => {
  it("burns along the course and turns while the throttle is held", () => {
    const drive = advanceHeadingDrive(0, new Set([THROTTLE_KEY, TURN_RIGHT_KEY]), 0.5);

    expect(drive.heading).toBeCloseTo(TURN_RATE_RADIANS_PER_SECOND * 0.5, 10);
    expect(Math.hypot(drive.vector.x, drive.vector.y)).toBeCloseTo(1, 10);
    expect(Math.atan2(drive.vector.y, drive.vector.x)).toBeCloseTo(drive.heading, 10);
  });

  it("turns the other way on the other key", () => {
    const left = advanceHeadingDrive(0, new Set([THROTTLE_KEY, TURN_LEFT_KEY]), 0.5);
    expect(left.heading).toBeLessThan(0);
  });

  it("spins the hull without the engine on a token amount of thrust", () => {
    const drive = advanceHeadingDrive(0, new Set([TURN_RIGHT_KEY]), 0.5);

    expect(drive.heading).toBeCloseTo(TURN_RATE_RADIANS_PER_SECOND * 0.5, 10);
    const thrust = Math.hypot(drive.vector.x, drive.vector.y);
    expect(thrust).toBeCloseTo(ROTATE_IN_PLACE_THROTTLE, 10);
    // The nudge must stay non-zero: the core reads the course from the vector
    // direction and ignores a strictly zero one.
    expect(thrust).toBeGreaterThan(0);
    expect(Math.atan2(drive.vector.y, drive.vector.x)).toBeCloseTo(drive.heading, 10);
  });

  it("keeps turning while the brake is held", () => {
    const drive = advanceHeadingDrive(1.2, new Set([THROTTLE_KEY, BRAKE_KEY, TURN_RIGHT_KEY]), 0.5);

    expect(drive.heading).toBeGreaterThan(1.2);
    expect(Math.hypot(drive.vector.x, drive.vector.y)).toBeCloseTo(ROTATE_IN_PLACE_THROTTLE, 10);
  });

  it("stands still with no helm key at all", () => {
    const drive = advanceHeadingDrive(1.2, new Set(["ArrowRight"]), 0.5);

    expect(drive.heading).toBe(1.2);
    expect(drive.vector).toEqual({ x: 0, y: 0 });
  });

  it("holds the course when the throttle is held straight", () => {
    const drive = advanceHeadingDrive(0.75, new Set([THROTTLE_KEY]), 0.5);

    expect(drive.heading).toBe(0.75);
    expect(Math.atan2(drive.vector.y, drive.vector.x)).toBeCloseTo(0.75, 10);
  });

  it("lets the arrows steer when the pilot does not own the turret", () => {
    const helm = toHelmKeys(new Set(["ArrowUp", "ArrowRight"]));

    expect(helm.has(THROTTLE_KEY)).toBe(true);
    expect(helm.has(TURN_RIGHT_KEY)).toBe(true);
    const drive = advanceHeadingDrive(0, helm, 0.5);
    expect(drive.heading).toBeGreaterThan(0);
    expect(Math.hypot(drive.vector.x, drive.vector.y)).toBeCloseTo(1, 10);
  });

  it("reads the turret bearing from the arrows alone", () => {
    expect(getTurretKeyboardVector(new Set(["ArrowRight"]))).toEqual({ x: 1, y: 0 });
    expect(getTurretKeyboardVector(new Set([THROTTLE_KEY, TURN_RIGHT_KEY]))).toEqual({
      x: 0,
      y: 0
    });
  });
});
