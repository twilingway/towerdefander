import { describe, expect, it } from "vitest";

import {
  createSnappedVisualTransitions,
  getBoundedCameraScroll,
  getTimelineAlpha,
  interpolateAngle,
  interpolatePoint,
  SnapshotResetLatch
} from "./flyingCastleViewModel.js";

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

  it("uses elapsed time rather than frame count", () => {
    const trace = (framesPerSecond: number) =>
      Array.from({ length: Math.round(framesPerSecond * 0.05) + 1 }, (_, index) => {
        const elapsedMs = Math.min((index * 1000) / framesPerSecond, 50);
        return interpolatePoint({ x: 0, y: 0 }, { x: 100, y: 40 }, getTimelineAlpha(elapsedMs, 50));
      });
    const sixtyHzTrace = trace(60);
    const oneTwentyHzTrace = trace(120);

    for (let index = 0; index < sixtyHzTrace.length; index += 1) {
      const sixtyHzPoint = sixtyHzTrace[index];
      const oneTwentyHzPoint = oneTwentyHzTrace[index * 2];
      if (sixtyHzPoint === undefined || oneTwentyHzPoint === undefined) {
        throw new Error("Expected matching 60 Hz and 120 Hz samples.");
      }
      expect(oneTwentyHzPoint.x).toBeCloseTo(sixtyHzPoint.x, 8);
      expect(oneTwentyHzPoint.y).toBeCloseTo(sixtyHzPoint.y, 8);
    }
    expect(sixtyHzTrace.at(-1)).toEqual({ x: 100, y: 40 });
  });

  it("snaps delayed scene creation and hydration to the latest snapshot", () => {
    const latest = {
      castle: { x: 1384, y: 712 },
      turretAngle: 1.2,
      shield: { angle: -0.8 }
    };
    const transitions = createSnappedVisualTransitions(latest, 375);

    expect(transitions.castle).toEqual({
      from: latest.castle,
      to: latest.castle,
      startedAt: 375
    });
    expect(transitions.turret).toEqual({ from: 1.2, to: 1.2, startedAt: 375 });
    expect(transitions.shield).toEqual({ from: -0.8, to: -0.8, startedAt: 375 });
  });

  it("preserves a hydration reset through delayed scene creation until the next snapshot", () => {
    const reset = new SnapshotResetLatch();
    reset.request();

    createSnappedVisualTransitions(
      { castle: { x: 1200, y: 800 }, turretAngle: 0, shield: { angle: 0 } },
      100
    );

    expect(reset.consumeForSnapshot()).toBe(true);
    expect(reset.consumeForSnapshot()).toBe(false);
  });

  it("consumes a hydration reset when the first reconnect snapshot precedes scene creation", () => {
    const reset = new SnapshotResetLatch();
    reset.request();

    expect(reset.consumeForSnapshot()).toBe(true);
    createSnappedVisualTransitions(
      { castle: { x: 1320, y: 760 }, turretAngle: 0.4, shield: { angle: -0.2 } },
      150
    );
    expect(reset.consumeForSnapshot()).toBe(false);
  });

  it("takes the shortest path between angles", () => {
    expect(interpolateAngle(Math.PI * 0.9, -Math.PI * 0.9, 0.5)).toBeCloseTo(Math.PI);
  });

  it("chooses the positive direction for an exact antipode", () => {
    expect(interpolateAngle(0, Math.PI, 0.25)).toBeCloseTo(Math.PI / 4);
    expect(interpolateAngle(0, -Math.PI, 0.25)).toBeCloseTo(Math.PI / 4);
  });

  it("produces equivalent angular traces at 60 Hz and 120 Hz", () => {
    const from = Math.PI * 0.92;
    const to = -Math.PI * 0.88;
    const trace = (framesPerSecond: number) =>
      Array.from({ length: Math.round(framesPerSecond * 0.05) + 1 }, (_, index) => {
        const elapsedMs = Math.min((index * 1000) / framesPerSecond, 50);
        return interpolateAngle(from, to, getTimelineAlpha(elapsedMs, 50));
      });
    const sixtyHzTrace = trace(60);
    const oneTwentyHzTrace = trace(120);

    for (let index = 0; index < sixtyHzTrace.length; index += 1) {
      const sixtyHzAngle = sixtyHzTrace[index];
      const oneTwentyHzAngle = oneTwentyHzTrace[index * 2];
      if (sixtyHzAngle === undefined || oneTwentyHzAngle === undefined) {
        throw new Error("Expected matching 60 Hz and 120 Hz angle samples.");
      }
      expect(Math.abs(oneTwentyHzAngle - sixtyHzAngle)).toBeLessThanOrEqual(0.001);
    }
    expect(sixtyHzTrace.at(-1)).toBeCloseTo(from + Math.PI * 0.2);
  });
});
