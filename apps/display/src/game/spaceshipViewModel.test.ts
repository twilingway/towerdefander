import { describe, expect, it } from "vitest";

import {
  advancePlayback,
  backgroundTileOffset,
  createPlaybackClock,
  createPointTrack,
  createPointTransition,
  createSnappedVisualTransitions,
  getBackgroundCoverRect,
  getBoundedCameraScroll,
  getCameraOverscan,
  getCircularGridSegments,
  getPhaserCameraScroll,
  getResponsiveViewport,
  getSegmentAlpha,
  getShieldArcRange,
  getShieldCrescentPoints,
  getShieldDashSegments,
  getShieldVisualStyle,
  extendPointTrack,
  interpolateAngle,
  interpolatePoint,
  observePlaybackTick,
  reconcileStableIds,
  samplePointTrack,
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

  it("frames the tuned camera width instead of the design default", () => {
    const framed = getResponsiveViewport(1920, 1080, 3200, 3200 * (9 / 16));
    expect(framed.zoom).toBeCloseTo(0.6);
    expect(framed.width).toBeCloseTo(3200);
    expect(framed.height).toBeCloseTo(1800);
  });

  describe("background cover rect", () => {
    const framedViewport = (rendererWidth: number, rendererHeight: number) =>
      getResponsiveViewport(rendererWidth, rendererHeight, 2400, 2400 * (9 / 16));
    /** How Phaser puts a scroll-factor-0 world coordinate on screen: zoom around the camera origin. */
    const project = (world: number, rendererSize: number, zoom: number): number =>
      (rendererSize / 2) * (1 - zoom) + zoom * world;

    it.each([
      [1920, 1080],
      [1366, 768],
      [1278, 600],
      [2560, 1080]
    ])("covers the whole renderer at %ix%i", (rendererWidth, rendererHeight) => {
      const { zoom } = framedViewport(rendererWidth, rendererHeight);
      const cover = getBackgroundCoverRect(rendererWidth, rendererHeight, zoom);

      expect(project(cover.x, rendererWidth, zoom)).toBeLessThanOrEqual(0);
      expect(project(cover.y, rendererHeight, zoom)).toBeLessThanOrEqual(0);
      expect(project(cover.x + cover.width, rendererWidth, zoom)).toBeGreaterThanOrEqual(
        rendererWidth
      );
      expect(project(cover.y + cover.height, rendererHeight, zoom)).toBeGreaterThanOrEqual(
        rendererHeight
      );
    });

    it("pulls the layer off the world origin, which zoom below 1 leaves short of the screen", () => {
      const { zoom } = framedViewport(1278, 600);

      expect(zoom).toBeLessThan(1);
      // The old placement: origin at world 0 lands well inside the viewport, hence the bare strip.
      expect(project(0, 1278, zoom)).toBeGreaterThan(100);
      expect(getBackgroundCoverRect(1278, 600, zoom).x).toBeLessThan(0);
    });

    it("falls back to zoom 1 instead of exploding on a degenerate zoom", () => {
      expect(getBackgroundCoverRect(1600, 900, 0)).toEqual(getBackgroundCoverRect(1600, 900, 1));
    });
  });

  describe("background tile offset", () => {
    const nebulaB = { factorX: -0.095, factorY: 0.075, driftX: -7, driftY: 3.2 };

    it("scales the camera term with parallax strength and keeps per-axis factors independent", () => {
      expect(backgroundTileOffset(nebulaB, 1000, 400, 1, 0)).toEqual({ x: -95, y: 30 });
      expect(backgroundTileOffset(nebulaB, 1000, 400, 0.5, 0)).toEqual({ x: -47.5, y: 15 });
    });

    it("lets zero parallax strength kill only the camera term while drift keeps living", () => {
      const offset = backgroundTileOffset(nebulaB, 1000, 400, 0, 3);
      expect(offset.x).toBeCloseTo(-21);
      expect(offset.y).toBeCloseTo(9.6);
    });

    it("accumulates drift with elapsed time at the tuned speed without parallax scaling", () => {
      // driftSeconds = elapsedSeconds * driftSpeed: 40s at speed 1.5.
      const offset = backgroundTileOffset(nebulaB, 0, 0, 2, 60);
      expect(offset.x).toBe(-420);
      expect(offset.y).toBe(192);
    });

    it("moves nebula B against the camera on X while following it on Y", () => {
      const offset = backgroundTileOffset(nebulaB, 500, 500, 1, 0);
      expect(offset.x).toBeLessThan(0);
      expect(offset.y).toBeGreaterThan(0);
    });
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
    expect(getShieldVisualStyle(true)).toEqual({
      lineWidth: 11,
      color: 0x65baff,
      alpha: 0.85,
      dash: null,
      crescentThickness: 11
    });
    expect(getShieldVisualStyle(false)).toEqual({
      lineWidth: 6,
      color: 0x6f91a4,
      alpha: 0.35,
      dash: { lengthPx: 16, gapPx: 12 },
      crescentThickness: null
    });
  });

  it("tapers the raised shield to nothing at both tips", () => {
    const radius = 104;
    const thickness = 11;
    const points = getShieldCrescentPoints(0.3, 2.1, radius, thickness, 33);
    // Outer edge first, inner edge back: one closed band.
    expect(points).toHaveLength(66);

    const distance = (index: number) => {
      const point = points[index];
      if (point === undefined) throw new Error(`missing point ${String(index)}`);
      return Math.hypot(point.x, point.y);
    };
    // Both tips sit exactly on the shield radius, so the band closes on itself.
    expect(distance(0)).toBeCloseTo(radius);
    expect(distance(32)).toBeCloseTo(radius);
    expect(distance(33)).toBeCloseTo(radius);
    expect(distance(65)).toBeCloseTo(radius);
    // The middle of the sector is where it is widest.
    expect(distance(16)).toBeCloseTo(radius + thickness / 2);
    expect(distance(49)).toBeCloseTo(radius - thickness / 2);
  });

  it("widens monotonically from the tip to the middle of the sector", () => {
    const radius = 104;
    const points = getShieldCrescentPoints(0, 1.8, radius, 11, 21);
    const outerOffsets = points.slice(0, 11).map((point) => Math.hypot(point.x, point.y) - radius);

    for (let index = 1; index < outerOffsets.length; index += 1) {
      const previous = outerOffsets[index - 1];
      const current = outerOffsets[index];
      if (previous === undefined || current === undefined) throw new Error("missing offset");
      expect(current).toBeGreaterThan(previous);
    }
  });

  it("keeps the crescent inside the sector it is given", () => {
    const start = 0.3;
    const end = 2.1;
    const points = getShieldCrescentPoints(start, end, 104, 11, 24);
    for (const point of points) {
      const angle = Math.atan2(point.y, point.x);
      expect(angle).toBeGreaterThanOrEqual(start - 1e-9);
      expect(angle).toBeLessThanOrEqual(end + 1e-9);
    }
  });

  it("draws no crescent for a degenerate sector, radius or thickness", () => {
    expect(getShieldCrescentPoints(0.3, 0.3, 104, 11)).toEqual([]);
    expect(getShieldCrescentPoints(0.3, 2.1, 0, 11)).toEqual([]);
    expect(getShieldCrescentPoints(0.3, 2.1, 104, 0)).toEqual([]);
    expect(getShieldCrescentPoints(0.3, 2.1, 104, 11, 1)).toEqual([]);
  });

  it("dashes the inactive arc without moving the sector it covers", () => {
    const dash = { lengthPx: 16, gapPx: 12 };
    // Chosen so the final dash would run past the sector if it were not clipped:
    // the sweep is not a whole number of dash-and-gap periods.
    const start = 0.3;
    const end = 1.65;
    const segments = getShieldDashSegments(start, end, 104, dash);

    expect(segments.length).toBeGreaterThan(1);
    expect(segments[0]?.start).toBeCloseTo(start);
    expect(Math.max(...segments.map((segment) => segment.end))).toBeLessThanOrEqual(end + 1e-9);
    // The last dash ends exactly on the sector edge because it was clipped there.
    expect(segments.at(-1)?.end).toBeCloseTo(end);
    expect(segments.at(-1)?.end).toBeLessThan((segments.at(-1)?.start ?? 0) + 16 / 104);
    for (const segment of segments) {
      expect(segment.end).toBeGreaterThan(segment.start);
      expect(segment.start).toBeGreaterThanOrEqual(start);
    }
  });

  it("leaves a gap between dashes proportional to the shield radius", () => {
    const dash = { lengthPx: 16, gapPx: 12 };
    const near = getShieldDashSegments(0, 1.8, 104, dash);
    const far = getShieldDashSegments(0, 1.8, 208, dash);

    // Same world-unit dash on a bigger circle covers less angle, so a wider
    // shield gets more strokes rather than longer ones.
    expect(far.length).toBeGreaterThan(near.length);
    const firstNear = near[0];
    const firstFar = far[0];
    if (firstNear === undefined || firstFar === undefined) throw new Error("Expected dashes.");
    expect(firstNear.end - firstNear.start).toBeCloseTo(16 / 104);
    expect(firstFar.end - firstFar.start).toBeCloseTo(16 / 208);
  });

  it("falls back to one stroke when a dash covers the whole sector", () => {
    expect(getShieldDashSegments(0, 0.1, 104, { lengthPx: 200, gapPx: 12 })).toEqual([
      { start: 0, end: 0.1 }
    ]);
  });

  it("draws nothing for a degenerate arc or radius", () => {
    const dash = { lengthPx: 16, gapPx: 12 };
    expect(getShieldDashSegments(0.3, 0.3, 104, dash)).toEqual([]);
    expect(getShieldDashSegments(0.3, 2.1, 0, dash)).toEqual([]);
    expect(getShieldDashSegments(0.3, 2.1, 104, { lengthPx: 0, gapPx: 12 })).toEqual([]);
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
    const trace = (framesPerSecond: number) => {
      const frameMs = 1000 / framesPerSecond;
      let clock = createPlaybackClock(0);
      clock = observePlaybackTick(clock, 4, 200);
      return Array.from({ length: Math.round(framesPerSecond * 0.05) }, () => {
        clock = advancePlayback(clock, frameMs);
        return interpolatePoint(
          { x: 0, y: 0 },
          { x: 100, y: 40 },
          getSegmentAlpha(0, 4, clock.tick)
        );
      });
    };
    const sixtyHzTrace = trace(60);
    const oneTwentyHzTrace = trace(120);

    for (let index = 0; index < sixtyHzTrace.length; index += 1) {
      const sixtyHzPoint = sixtyHzTrace[index];
      const oneTwentyHzPoint = oneTwentyHzTrace[index * 2 + 1];
      if (sixtyHzPoint === undefined || oneTwentyHzPoint === undefined) {
        throw new Error("Expected matching 60 Hz and 120 Hz samples.");
      }
      expect(oneTwentyHzPoint.x).toBeCloseTo(sixtyHzPoint.x, 8);
      expect(oneTwentyHzPoint.y).toBeCloseTo(sixtyHzPoint.y, 8);
    }
  });

  it("keeps playing when snapshots arrive slower than the nominal tick", () => {
    const frameMs = 1000 / 60;
    const snapshotMs = 62;
    let clock = createPlaybackClock(0);
    let latestTick = 0;
    let nextSnapshotAt = snapshotMs;
    let elapsedMs = 0;
    let previousTick = -1;
    const stalledFrames: number[] = [];

    for (let frame = 0; frame < 240; frame += 1) {
      elapsedMs += frameMs;
      while (elapsedMs >= nextSnapshotAt) {
        latestTick += 1;
        clock = observePlaybackTick(clock, latestTick, snapshotMs);
        nextSnapshotAt += snapshotMs;
      }
      clock = advancePlayback(clock, frameMs);
      // The first second is the pace estimate settling; after that a stall
      // would be the freeze this playback exists to remove.
      if (frame > 60 && clock.tick === previousTick) stalledFrames.push(frame);
      previousTick = clock.tick;
    }

    expect(stalledFrames).toEqual([]);
    expect(clock.msPerTick).toBeCloseTo(snapshotMs, 1);
    expect(latestTick - clock.tick).toBeLessThan(3);
  });

  it("keeps the drawn point moving, not just the playback clock", () => {
    // The runtime holds one segment: previous authoritative sample to newest.
    // Playback therefore has to stay inside it - lag it past the segment start
    // and every frame draws the same point until the next patch lands, which
    // reads as a frozen picture however fast the renderer runs.
    const frameMs = 1000 / 165;
    const snapshotMs = 62.5;
    const positionAt = (tick: number) => ({ x: tick * 10, y: 0 });
    let clock = createPlaybackClock(0);
    let track = createPointTrack(positionAt(0), 0);
    let latestTick = 0;
    let elapsedMs = 0;
    let nextSnapshotAt = snapshotMs;
    let previousX = -1;
    let frozenFrames = 0;

    for (let frame = 0; frame < 1200; frame += 1) {
      elapsedMs += frameMs;
      while (elapsedMs >= nextSnapshotAt) {
        // A 20 Hz room behind a 16 Hz patch timer: three singles, then a double.
        const carried = latestTick % 4 === 3 ? 2 : 1;
        const nextTick = latestTick + carried;
        track = extendPointTrack(track, positionAt(nextTick), nextTick);
        latestTick = nextTick;
        clock = observePlaybackTick(clock, nextTick, snapshotMs);
        nextSnapshotAt += snapshotMs;
      }
      clock = advancePlayback(clock, frameMs);
      const drawn = samplePointTrack(track, clock.tick);
      if (frame > 165 && drawn.x <= previousX) frozenFrames += 1;
      previousX = drawn.x;
    }

    expect(frozenFrames).toBe(0);
  });

  it("re-anchors on a tick that moved backwards instead of freezing", () => {
    let clock = createPlaybackClock(0);
    clock = observePlaybackTick(clock, 400, 50);
    clock = advancePlayback(clock, 16);

    // A fresh run restarts the tick counter; playback has to follow it down.
    clock = observePlaybackTick(clock, 3, 50);

    expect(clock.latestTick).toBe(3);
    expect(clock.tick).toBe(3);
  });

  it("walks through a patch that carried more than one tick", () => {
    const segment = createPointTransition({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 12);

    expect(getSegmentAlpha(segment.fromTick, segment.toTick, 11)).toBeCloseTo(0.5, 8);
    expect(getSegmentAlpha(segment.fromTick, segment.toTick, 12)).toBe(1);
    // A segment with no span at all - a snap - is simply finished.
    expect(getSegmentAlpha(10, 10, 10)).toBe(1);
  });

  it("snaps delayed scene creation and hydration to the latest snapshot", () => {
    const latest = {
      spaceship: { x: 1384, y: 712 },
      turretAngle: 1.2,
      shield: { angle: -0.8 }
    };
    const transitions = createSnappedVisualTransitions(latest, 375);

    const snapped = { fromTick: 375, toTick: 375 };
    expect(transitions.spaceship.current).toEqual({
      from: latest.spaceship,
      to: latest.spaceship,
      ...snapped
    });
    expect(transitions.spaceship.previous).toEqual(transitions.spaceship.current);
    expect(transitions.turret.current).toEqual({ from: 1.2, to: 1.2, ...snapped });
    expect(transitions.shield.current).toEqual({ from: -0.8, to: -0.8, ...snapped });
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
        const playbackTick = Math.min((index * 1000) / framesPerSecond / 50, 1);
        return interpolateAngle(from, to, getSegmentAlpha(0, 1, playbackTick));
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
