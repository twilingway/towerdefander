import { describe, expect, it } from "vitest";

import {
  BRAKE_KEY,
  HEADING_LEAD_RADIANS,
  ROTATE_IN_PLACE_THROTTLE,
  THROTTLE_KEY,
  TURN_LEFT_KEY,
  TURN_RIGHT_KEY,
  advanceHeadingDrive,
  coastToStopRadians,
  getTurretKeyboardVector,
  toHelmKeys,
  turnDirection
} from "./pilotKeyboard.js";

function bearing(vector: { x: number; y: number }): number {
  return Math.atan2(vector.y, vector.x);
}

describe("pilot keyboard drive", () => {
  it("brakes toward where the spin would come to rest", () => {
    const coastRadians = coastToStopRadians(1.8);
    const drive = advanceHeadingDrive(1.2, new Set(), { stopping: true, coastRadians });

    // Aiming exactly at the resting point is what removes both the drift past
    // the target and the swing back to it.
    expect(coastRadians).toBeGreaterThan(0);
    expect(drive.heading).toBeCloseTo(1.2 + coastRadians, 10);
    expect(bearing(drive.vector)).toBeCloseTo(drive.heading, 10);
    expect(Math.hypot(drive.vector.x, drive.vector.y)).toBeCloseTo(ROTATE_IN_PLACE_THROTTLE, 10);
  });

  it("predicts a resting point that follows the direction of the spin", () => {
    expect(coastToStopRadians(-1.8)).toBeCloseTo(-coastToStopRadians(1.8), 12);
    expect(coastToStopRadians(0)).toBe(0);
    // Twice the speed needs four times the room, because braking is constant.
    expect(coastToStopRadians(2)).toBeCloseTo(4 * coastToStopRadians(1), 12);
  });

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

  it("adds the angle the hull covers while the request is in flight", () => {
    const still = coastToStopRadians(2);
    const withLag = coastToStopRadians(2, 0.1);

    // A tenth of a second at two radians a second is another fifth of a radian.
    expect(withLag - still).toBeCloseTo(0.2, 10);
    expect(coastToStopRadians(-2, 0.1)).toBeCloseTo(-withLag, 10);
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
      scheme: "tank",
      headingLeadRadians: 0.9,
      stopDampening: 0.5,
      rotateInPlaceThrottle: 0.05,
      hullAngularBrakingPerSecondSquared: 50
    } as const;

    const turning = advanceHeadingDrive(0, new Set([TURN_RIGHT_KEY]), { tuning });
    expect(turning.heading).toBeCloseTo(0.9, 10);
    expect(Math.hypot(turning.vector.x, turning.vector.y)).toBeCloseTo(0.05, 10);

    const braking = advanceHeadingDrive(1, new Set(), {
      stopping: true,
      coastRadians: 0.4,
      tuning
    });
    expect(braking.heading).toBeCloseTo(1.2, 10);
  });

  it("sends the plain direction of the keys on the absolute scheme", () => {
    const tuning = {
      scheme: "absolute",
      headingLeadRadians: 0.9,
      stopDampening: 1,
      rotateInPlaceThrottle: 0.05,
      hullAngularBrakingPerSecondSquared: 50
    } as const;

    const drive = advanceHeadingDrive(2.5, new Set([THROTTLE_KEY, TURN_RIGHT_KEY]), { tuning });

    // Up and right, whatever the nose is doing — and the course is left alone.
    expect(drive.heading).toBe(2.5);
    expect(bearing(drive.vector)).toBeCloseTo(-Math.PI / 4, 10);
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
