import { describe, expect, it } from "vitest";

import { getKeyboardVector } from "./controlInput.js";
import {
  BRAKE_KEY,
  THROTTLE_KEY,
  TURN_LEFT_KEY,
  TURN_RIGHT_KEY,
  getHelmIntent,
  getTurretKeyboardVector,
  toHelmKeys,
  turnDirection
} from "./pilotKeyboard.js";

function bearing(vector: { x: number; y: number }): number {
  return Math.atan2(vector.y, vector.x);
}

describe("pilot keyboard drive", () => {
  it("asks for a spin and a push along the nose, naming no bearing", () => {
    expect(getHelmIntent(new Set([TURN_LEFT_KEY]))).toEqual({ turn: -1, thrust: 0 });
    expect(getHelmIntent(new Set([TURN_RIGHT_KEY, THROTTLE_KEY]))).toEqual({ turn: 1, thrust: 1 });
    expect(getHelmIntent(new Set([BRAKE_KEY]))).toEqual({ turn: 0, thrust: -1 });
    // Both halves of an axis cancel rather than fight.
    expect(getHelmIntent(new Set([THROTTLE_KEY, BRAKE_KEY]))).toEqual({ turn: 0, thrust: 0 });
    expect(getHelmIntent(new Set([TURN_LEFT_KEY, TURN_RIGHT_KEY]))).toEqual({ turn: 0, thrust: 0 });
    // A released helm asks for a stop; the simulation owns the braking.
    expect(getHelmIntent(new Set())).toEqual({ turn: 0, thrust: 0 });
  });

  it("knows when the helm still owes the hull a brake", () => {
    expect(turnDirection(new Set([TURN_RIGHT_KEY]))).toBe(1);
    expect(turnDirection(new Set([TURN_LEFT_KEY, TURN_RIGHT_KEY]))).toBe(0);
    expect(turnDirection(new Set([THROTTLE_KEY]))).toBe(0);
  });

  it("lets the arrows drive the helm when the pilot does not own the turret", () => {
    const helm = toHelmKeys(new Set(["ArrowUp", "ArrowRight"]));

    expect(helm.has(THROTTLE_KEY)).toBe(true);
    expect(helm.has(TURN_RIGHT_KEY)).toBe(true);
    expect(getHelmIntent(helm)).toEqual({ turn: 1, thrust: 1 });
  });

  it("sends the plain direction of the keys on the absolute scheme", () => {
    // The twin-stick shape names a bearing in the world; the nose is not part
    // of the request at all, which is why the tank intent has no place here.
    const vector = getKeyboardVector(new Set([THROTTLE_KEY, TURN_RIGHT_KEY]));

    expect(bearing(vector)).toBeCloseTo(-Math.PI / 4, 10);
    expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(1, 10);
  });

  it("reads the turret bearing from the arrows alone", () => {
    expect(getTurretKeyboardVector(new Set(["ArrowRight"]))).toEqual({ x: 1, y: 0 });
    expect(getTurretKeyboardVector(new Set([THROTTLE_KEY, TURN_RIGHT_KEY]))).toEqual({
      x: 0,
      y: 0
    });
  });
});
