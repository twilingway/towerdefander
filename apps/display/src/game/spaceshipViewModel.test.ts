import { describe, expect, it } from "vitest";

import {
  createSnappedVisualTransitions,
  getBoundedCameraScroll,
  getCameraOverscan,
  getCircularGridSegments,
  getPhaserCameraScroll,
  getResponsiveViewport,
  getShieldArcRange,
  getShieldVisualStyle,
  getTimelineAlpha,
  interpolateAngle,
  interpolatePoint,
  reconcileStableIds,
  SnapshotResetLatch
} from "./spaceshipViewModel.js";

describe("spaceship view model", () => {
  it("clips grid segments analytically to the circular arena", () => {
    const segments = getCircularGridSegments(200, 200, 100, 50);

    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      for (const point of [segment.from, segment.to]) {
        expect(Math.hypot(point.x - 200, point.y - 200)).toBeCloseTo(100);
      }
    }
    expect(segments).toContainEqual({ from: { x: 200, y: 100 }, to: { x: 200, y: 300 } });
  });

  it("centers the camera on the circular arena midpoint", () => {
    expect(getBoundedCameraScroll({ x: 2200, y: 2200 }, 4400, 4400, 1600, 900)).toEqual({
      x: 1400,
      y: 1750
    });
  });

  it("preserves at least the distant 1600 by 900 logical view across screen shapes", () => {
    expect(getResponsiveViewport(1920, 1080)).toEqual({ zoom: 1.2, width: 1600, height: 900 });
    const wide = getResponsiveViewport(1366, 768);
    expect(wide.zoom).toBeCloseTo(768 / 900);
    expect(wide.width).toBeCloseTo(1366 / (768 / 900));
    expect(wide.height).toBeCloseTo(900);
    expect(getResponsiveViewport(1024, 768)).toEqual({ zoom: 0.64, width: 1600, height: 1200 });
  });

  it("converts a centered world view into Phaser renderer-space scroll", () => {
    expect(
      getPhaserCameraScroll({
        focus: { x: 2200, y: 2200 },
        worldWidth: 4400,
        worldHeight: 4400,
        rendererWidth: 1920,
        rendererHeight: 1080,
        viewportWidth: 1600,
        viewportHeight: 900,
        overscan: 0
      })
    ).toEqual({ x: 1240, y: 1660 });
  });

  it.each([
    [1920, 1080],
    [1366, 768],
    [1024, 768]
  ])(
    "keeps cardinal and diagonal rim positions inside the safe edge at %ix%i",
    (rendererWidth, rendererHeight) => {
      const viewport = getResponsiveViewport(rendererWidth, rendererHeight);
      const zoom = viewport.zoom;
      const radius = 52;
      const visualExtension = 42;
      const overscan = getCameraOverscan(radius, zoom);
      const center = 2200;
      const legalRadius = 2200 - radius;
      const diagonalOffset = legalRadius / Math.sqrt(2);
      const rimPositions = [
        { x: center - legalRadius, y: center },
        { x: center + legalRadius, y: center },
        { x: center, y: center - legalRadius },
        { x: center, y: center + legalRadius },
        { x: center - diagonalOffset, y: center - diagonalOffset },
        { x: center + diagonalOffset, y: center + diagonalOffset }
      ];

      for (const focus of rimPositions) {
        const worldView = getBoundedCameraScroll(
          focus,
          4400,
          4400,
          viewport.width,
          viewport.height,
          overscan
        );
        const visualLeft = (focus.x - radius - visualExtension - worldView.x) * zoom;
        const visualRight =
          (worldView.x + viewport.width - (focus.x + radius + visualExtension)) * zoom;
        const visualTop = (focus.y - radius - visualExtension - worldView.y) * zoom;
        const visualBottom =
          (worldView.y + viewport.height - (focus.y + radius + visualExtension)) * zoom;
        expect(Math.min(visualLeft, visualRight)).toBeGreaterThanOrEqual(160);
        expect(Math.min(visualTop, visualBottom)).toBeGreaterThanOrEqual(160);
      }
    }
  );

  it("centers an expanded world that is smaller than the visible viewport", () => {
    expect(getBoundedCameraScroll({ x: 50, y: 50 }, 100, 100, 500, 300, 25)).toEqual({
      x: -200,
      y: -100
    });
  });

  it("uses distinct active and inactive shield styles", () => {
    expect(getShieldVisualStyle(true)).toEqual({ lineWidth: 16, color: 0x65baff, alpha: 0.9 });
    expect(getShieldVisualStyle(false)).toEqual({ lineWidth: 6, color: 0x6f91a4, alpha: 0.35 });
  });

  it("uses the authoritative upgraded shield half-angle", () => {
    const arc = getShieldArcRange(1.2, 0.9);
    expect(arc.start).toBeCloseTo(0.3);
    expect(arc.end).toBeCloseTo(2.1);
  });

  it("interpolates toward snapshots without overshooting", () => {
    expect(interpolatePoint({ x: 10, y: 20 }, { x: 30, y: 40 }, 0.25)).toEqual({ x: 15, y: 25 });
    expect(interpolatePoint({ x: 10, y: 20 }, { x: 30, y: 40 }, 2)).toEqual({ x: 30, y: 40 });
  });

  it("plans stable create, update and authoritative removal by entity ID", () => {
    expect(reconcileStableIds(["enemy-1", "missile-1"], ["enemy-1", "asteroid-1"])).toEqual({
      create: ["asteroid-1"],
      update: ["enemy-1"],
      remove: ["missile-1"]
    });
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
      spaceship: { x: 1384, y: 712 },
      turretAngle: 1.2,
      shield: { angle: -0.8 }
    };
    const transitions = createSnappedVisualTransitions(latest, 375);

    expect(transitions.spaceship).toEqual({
      from: latest.spaceship,
      to: latest.spaceship,
      startedAt: 375
    });
    expect(transitions.turret).toEqual({ from: 1.2, to: 1.2, startedAt: 375 });
    expect(transitions.shield).toEqual({ from: -0.8, to: -0.8, startedAt: 375 });
  });

  it("preserves a hydration reset through delayed scene creation until the next snapshot", () => {
    const reset = new SnapshotResetLatch();
    reset.request();

    createSnappedVisualTransitions(
      { spaceship: { x: 1200, y: 800 }, turretAngle: 0, shield: { angle: 0 } },
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
      { spaceship: { x: 1320, y: 760 }, turretAngle: 0.4, shield: { angle: -0.2 } },
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
