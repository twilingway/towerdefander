import { describe, expect, it } from "vitest";

import {
  SOLO_BRAKE_KEY,
  SOLO_THROTTLE_KEY,
  SOLO_TURN_LEFT_KEY,
  SOLO_TURN_RIGHT_KEY,
  SOLO_TURN_RATE_RADIANS_PER_SECOND,
  advanceHeadingDrive,
  getTurretKeyboardVector
} from "./soloKeyboard.js";

describe("solo keyboard drive", () => {
  it("burns along the course and turns while the throttle is held", () => {
    const drive = advanceHeadingDrive(0, new Set([SOLO_THROTTLE_KEY, SOLO_TURN_RIGHT_KEY]), 0.5);

    expect(drive.heading).toBeCloseTo(SOLO_TURN_RATE_RADIANS_PER_SECOND * 0.5, 10);
    expect(Math.hypot(drive.vector.x, drive.vector.y)).toBeCloseTo(1, 10);
    expect(Math.atan2(drive.vector.y, drive.vector.x)).toBeCloseTo(drive.heading, 10);
  });

  it("turns the other way on the other key", () => {
    const left = advanceHeadingDrive(0, new Set([SOLO_THROTTLE_KEY, SOLO_TURN_LEFT_KEY]), 0.5);
    expect(left.heading).toBeLessThan(0);
  });

  it("refuses to turn without throttle and keeps the course", () => {
    const drive = advanceHeadingDrive(1.2, new Set([SOLO_TURN_RIGHT_KEY]), 0.5);

    expect(drive.heading).toBe(1.2);
    expect(drive.vector).toEqual({ x: 0, y: 0 });
  });

  it("brakes on the brake key even with the throttle down", () => {
    const drive = advanceHeadingDrive(
      1.2,
      new Set([SOLO_THROTTLE_KEY, SOLO_BRAKE_KEY, SOLO_TURN_RIGHT_KEY]),
      0.5
    );

    expect(drive.heading).toBe(1.2);
    expect(drive.vector).toEqual({ x: 0, y: 0 });
  });

  it("holds the course when the throttle is held straight", () => {
    const drive = advanceHeadingDrive(0.75, new Set([SOLO_THROTTLE_KEY]), 0.5);

    expect(drive.heading).toBe(0.75);
    expect(Math.atan2(drive.vector.y, drive.vector.x)).toBeCloseTo(0.75, 10);
  });

  it("reads the turret bearing from the arrows alone", () => {
    expect(getTurretKeyboardVector(new Set(["ArrowRight"]))).toEqual({ x: 1, y: 0 });
    expect(getTurretKeyboardVector(new Set([SOLO_THROTTLE_KEY, SOLO_TURN_RIGHT_KEY]))).toEqual({
      x: 0,
      y: 0
    });
  });
});
