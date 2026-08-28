import { describe, expect, it } from "vitest";

import {
  BRAKE_KEY,
  HEADING_LEAD_RADIANS,
  HELM_STOP_COUNTER_RADIANS,
  ROTATE_IN_PLACE_THROTTLE,
  THROTTLE_KEY,
  TURN_LEFT_KEY,
  TURN_RIGHT_KEY,
  advanceHeadingDrive,
  getTurretKeyboardVector,
  turnDirection,
  toHelmKeys
} from "./pilotKeyboard.js";

function bearing(vector: { x: number; y: number }): number {
  return Math.atan2(vector.y, vector.x);
}

describe("pilot keyboard drive", () => {
  it("burns along the nose when only the throttle is held", () => {
    const drive = advanceHeadingDrive(0.8, new Set([THROTTLE_KEY]));

    expect(drive.heading).toBe(0.8);
    expect(bearing(drive.vector)).toBeCloseTo(0.8, 10);
    expect(Math.hypot(drive.vector.x, drive.vector.y)).toBeCloseTo(1, 10);
  });

  it("asks for a course a fixed lead ahead of the nose, not a running total", () => {
    const first = advanceHeadingDrive(0, new Set([THROTTLE_KEY, TURN_RIGHT_KEY]));
    // The nose has caught up a little by the next tick; the request moves with
    // it instead of racing away, which is what stops the hull on release.
    const second = advanceHeadingDrive(0.1, new Set([THROTTLE_KEY, TURN_RIGHT_KEY]));

    expect(first.heading).toBeCloseTo(HEADING_LEAD_RADIANS, 10);
    expect(second.heading).toBeCloseTo(0.1 + HEADING_LEAD_RADIANS, 10);
  });

  it("leads the other way on the other key", () => {
    const drive = advanceHeadingDrive(0, new Set([THROTTLE_KEY, TURN_LEFT_KEY]));

    expect(drive.heading).toBeCloseTo(-HEADING_LEAD_RADIANS, 10);
  });

  it("spins without the engine on a token amount of thrust", () => {
    const drive = advanceHeadingDrive(1, new Set([TURN_RIGHT_KEY]));

    expect(drive.heading).toBeCloseTo(1 + HEADING_LEAD_RADIANS, 10);
    expect(Math.hypot(drive.vector.x, drive.vector.y)).toBeCloseTo(ROTATE_IN_PLACE_THROTTLE, 10);
    expect(bearing(drive.vector)).toBeCloseTo(drive.heading, 10);
  });

  it("keeps turning while the brake is held", () => {
    const drive = advanceHeadingDrive(1, new Set([THROTTLE_KEY, BRAKE_KEY, TURN_RIGHT_KEY]));

    expect(drive.heading).toBeCloseTo(1 + HEADING_LEAD_RADIANS, 10);
    expect(Math.hypot(drive.vector.x, drive.vector.y)).toBeCloseTo(ROTATE_IN_PLACE_THROTTLE, 10);
  });

  it("stands still and holds the course with no helm key down", () => {
    const drive = advanceHeadingDrive(1.2, new Set(["ArrowRight"]));

    expect(drive.heading).toBe(1.2);
    expect(drive.vector).toEqual({ x: 0, y: 0 });
  });

  it("brakes a spin against its own direction", () => {
    const right = advanceHeadingDrive(1.2, new Set(), { stopping: 1 });
    const left = advanceHeadingDrive(1.2, new Set(), { stopping: -1 });

    // A zero vector would leave the old target standing, so the brake carries a
    // real bearing — just behind the nose, to cancel the network lag.
    expect(right.heading).toBeCloseTo(1.2 - HELM_STOP_COUNTER_RADIANS, 10);
    expect(left.heading).toBeCloseTo(1.2 + HELM_STOP_COUNTER_RADIANS, 10);
    expect(bearing(right.vector)).toBeCloseTo(right.heading, 10);
    expect(Math.hypot(right.vector.x, right.vector.y)).toBeCloseTo(ROTATE_IN_PLACE_THROTTLE, 10);
  });

  it("knows when the helm still owes the hull a brake", () => {
    expect(turnDirection(new Set([TURN_RIGHT_KEY]))).toBe(1);
    expect(turnDirection(new Set([TURN_LEFT_KEY, TURN_RIGHT_KEY]))).toBe(0);
    expect(turnDirection(new Set([THROTTLE_KEY]))).toBe(0);
  });

  it("lets the arrows steer when the pilot does not own the turret", () => {
    const helm = toHelmKeys(new Set(["ArrowUp", "ArrowRight"]));

    expect(helm.has(THROTTLE_KEY)).toBe(true);
    expect(helm.has(TURN_RIGHT_KEY)).toBe(true);
    const drive = advanceHeadingDrive(0, helm);
    expect(drive.heading).toBeCloseTo(HEADING_LEAD_RADIANS, 10);
    expect(Math.hypot(drive.vector.x, drive.vector.y)).toBeCloseTo(1, 10);
  });

  it("follows the preset over the built-in feel", () => {
    const tuning = {
      headingLeadRadians: 0.9,
      stopCounterRadians: 0.3,
      rotateInPlaceThrottle: 0.05
    };

    const turning = advanceHeadingDrive(0, new Set([TURN_RIGHT_KEY]), { tuning });
    expect(turning.heading).toBeCloseTo(0.9, 10);
    expect(Math.hypot(turning.vector.x, turning.vector.y)).toBeCloseTo(0.05, 10);

    const braking = advanceHeadingDrive(1, new Set(), { stopping: 1, tuning });
    expect(braking.heading).toBeCloseTo(0.7, 10);
  });

  it("reads the turret bearing from the arrows alone", () => {
    expect(getTurretKeyboardVector(new Set(["ArrowRight"]))).toEqual({ x: 1, y: 0 });
    expect(getTurretKeyboardVector(new Set([THROTTLE_KEY, TURN_RIGHT_KEY]))).toEqual({
      x: 0,
      y: 0
    });
  });
});
