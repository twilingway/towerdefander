import { describe, expect, it } from "vitest";

import { getBoundedCameraScroll, interpolatePoint } from "./flyingCastleViewModel.js";

describe("flying castle view model", () => {
  it("centers the camera while clamping all world edges", () => {
    expect(getBoundedCameraScroll({ x: 1200, y: 800 }, 2400, 1600, 1280, 720)).toEqual({
      x: 560,
      y: 440
    });
    expect(getBoundedCameraScroll({ x: 0, y: 0 }, 2400, 1600, 1280, 720)).toEqual({ x: 0, y: 0 });
    expect(getBoundedCameraScroll({ x: 2400, y: 1600 }, 2400, 1600, 1280, 720)).toEqual({
      x: 1120,
      y: 880
    });
  });

  it("interpolates toward snapshots without overshooting", () => {
    expect(interpolatePoint({ x: 10, y: 20 }, { x: 30, y: 40 }, 0.25)).toEqual({ x: 15, y: 25 });
    expect(interpolatePoint({ x: 10, y: 20 }, { x: 30, y: 40 }, 2)).toEqual({ x: 30, y: 40 });
  });
});
