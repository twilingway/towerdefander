import { describe, expect, it } from "vitest";

import {
  advancePlayback,
  backgroundTileOffset,
  createPlaybackClock,
  createPointTrack,
  createPointTransition,
  createSnappedVisualTransitions,
  getArenaRingRadii,
  getRimBandStroke,
  getArenaSpokes,
  DEVICE_PIXEL_RATIO_CAP,
  getBackgroundCoverRect,
  getBackingStoreSize,
  getLetterboxBars,
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

describe("getLetterboxBars", () => {
  const frameFor = (glassWidth: number, glassHeight: number) => {
    const viewport = getResponsiveViewport(glassWidth, glassHeight, 2500, 2500 * (9 / 16));
    return { width: viewport.screen.width, height: viewport.screen.height };
  };

  it("finds the empty fifth of a phone held sideways", () => {
    // 844x390 fits the frame by height, so what is left is a bar down each
    // side - and it is where the readouts belong, not on top of the arena.
    const bars = getLetterboxBars(844, 390, frameFor(844, 390));
    expect(bars.placement).toBe("side");
    expect(bars.thickness).toBeCloseTo((844 - 390 * (16 / 9)) / 2, 6);
  });

  it("finds the band a squarer screen leaves above and below", () => {
    const bars = getLetterboxBars(1024, 768, frameFor(1024, 768));
    expect(bars.placement).toBe("top");
  });

  it("says so when there is nothing worth using", () => {
    // Exactly the frame's shape, and a hair off it: a two-pixel strip holds no
    // readout, so the layout stays as it is on a screen with no bars at all.
    expect(getLetterboxBars(1920, 1080, frameFor(1920, 1080)).placement).toBe("none");
    expect(getLetterboxBars(1930, 1080, frameFor(1930, 1080)).placement).toBe("none");
  });
});

describe("getBackingStoreSize", () => {
  const glass = { cssWidth: 844, cssHeight: 390 };

  it("draws a phone at its own density, up to the cap", () => {
    const capped = getBackingStoreSize({ ...glass, devicePixelRatio: 2.75 });
    expect(capped.ratio).toBe(DEVICE_PIXEL_RATIO_CAP);
    expect(capped).toMatchObject({ width: 1688, height: 780 });

    // Under the cap the device gets exactly what it asks for.
    const modest = getBackingStoreSize({ ...glass, devicePixelRatio: 1.5 });
    expect(modest.ratio).toBe(1.5);
    expect(modest).toMatchObject({ width: 1266, height: 585 });
  });

  it("leaves an ordinary screen exactly as it was", () => {
    // The change has to be a no-op at density one, or every measurement taken
    // before it stops meaning anything.
    const desktop = getBackingStoreSize({ cssWidth: 1920, cssHeight: 1080, devicePixelRatio: 1 });
    expect(desktop).toEqual({ width: 1920, height: 1080, ratio: 1 });
  });

  it("never asks the GPU for an edge it does not have", () => {
    // The shield's glow allocates a target the size of the frame, and older
    // mobile parts refuse past 4096.
    const clamped = getBackingStoreSize({
      cssWidth: 2560,
      cssHeight: 1440,
      devicePixelRatio: 3,
      cap: 3,
      maxDimension: 4096
    });
    expect(clamped.width).toBeLessThanOrEqual(4096);
    expect(clamped.ratio).toBeCloseTo(4096 / 2560, 12);
  });

  it("falls back to the glass when the browser reports no density", () => {
    // jsdom has none, and a browser can report zero in the middle of a resize.
    for (const devicePixelRatio of [0, Number.NaN, -2]) {
      expect(getBackingStoreSize({ ...glass, devicePixelRatio }).ratio).toBe(1);
    }
  });

  it("keeps the slice of world the crew is shown", () => {
    // The invariant the whole change rests on: more pixels, same arena.
    const frame = { width: 2500, height: 2500 * (9 / 16) };
    const plain = getResponsiveViewport(844, 390, frame.width, frame.height);
    const dense = getBackingStoreSize({ ...glass, devicePixelRatio: 2 });
    const denser = getResponsiveViewport(dense.width, dense.height, frame.width, frame.height);
    expect(denser.screen.width / denser.zoom).toBeCloseTo(plain.screen.width / plain.zoom, 6);
    expect(denser.screen.height / denser.zoom).toBeCloseTo(plain.screen.height / plain.zoom, 6);
  });
});

describe("spaceship view model", () => {
  it("strokes the rim band as the ring the simulation slows a hull in", () => {
    const band = getRimBandStroke(2200, 260);

    // A stroke of width 260 centred on 2070 covers exactly 1940 to 2200, which
    // is the band measured inward from the arena radius.
    expect(band).toEqual({ radius: 2070, thickness: 260 });
    expect((band?.radius ?? 0) - (band?.thickness ?? 0) / 2).toBe(1940);
    expect((band?.radius ?? 0) + (band?.thickness ?? 0) / 2).toBe(2200);

    expect(getRimBandStroke(2200, 0)).toBeNull();
    expect(getRimBandStroke(0, 260)).toBeNull();
    // A band wider than the arena fills it rather than reaching outside.
    expect(getRimBandStroke(200, 900)).toEqual({ radius: 100, thickness: 200 });
  });

  it("spaces the distance rings inside the arena, leaving the rim to the border", () => {
    expect(getArenaRingRadii(2200)).toEqual([550, 1100, 1650]);
    // The count is fixed, so a larger arena reads the same instead of denser.
    expect(getArenaRingRadii(4400)).toHaveLength(3);
    expect(getArenaRingRadii(4400).at(-1)).toBeLessThan(4400);
    expect(getArenaRingRadii(0)).toEqual([]);
  });

  it("runs the spokes from a centre clearing out to the rim", () => {
    const spokes = getArenaSpokes(2200, 2200, 2200);

    expect(spokes).toHaveLength(16);
    for (const spoke of spokes) {
      const inner = Math.hypot(spoke.from.x - 2200, spoke.from.y - 2200);
      const outer = Math.hypot(spoke.to.x - 2200, spoke.to.y - 2200);
      expect(inner).toBeCloseTo(2200 * 0.06, 6);
      expect(outer).toBeCloseTo(2200, 6);
    }
    // The first spoke points along +X, and they go all the way round.
    expect(spokes[0]?.to.y).toBeCloseTo(2200, 6);
    expect(getArenaSpokes(2200, 2200, 0)).toEqual([]);
  });

  it("shows every device the same slice of the world", () => {
    // The whole point: what a crew can see must not depend on the shape of the
    // glass. Measured before this held, on a 2500 by 1406 frame, an ultrawide
    // saw 34% more width than a laptop and a 4:3 tablet 33% more height - which
    // is thirty per cent more warning about what is flying at you.
    const frame = { width: 2500, height: 2500 * (9 / 16) };
    const devices: readonly (readonly [string, number, number])[] = [
      ["1920x1080", 1920, 1080],
      ["2560x1440", 2560, 1440],
      ["3840x2160", 3840, 2160],
      ["3440x1440 ultrawide", 3440, 1440],
      ["iPhone 14 landscape", 844, 390],
      ["iPhone SE landscape", 667, 375],
      ["iPad", 1180, 820],
      ["iPad mini 4:3", 1024, 768],
      ["folding phone portrait", 1812, 2176]
    ];
    for (const [name, width, height] of devices) {
      const viewport = getResponsiveViewport(width, height, frame.width, frame.height);
      expect(viewport.width, `${name} sees a different width`).toBeCloseTo(frame.width, 6);
      expect(viewport.height, `${name} sees a different height`).toBeCloseTo(frame.height, 6);
    }
  });

  it("centres the frame in the glass and leaves the rest as bars", () => {
    const frame = { width: 2500, height: 2500 * (9 / 16) };
    // Ultrawide: the frame is as tall as the screen, so the bars are at the sides.
    const wide = getResponsiveViewport(3440, 1440, frame.width, frame.height);
    expect(wide.screen.height).toBeCloseTo(1440, 6);
    expect(wide.screen.width).toBeLessThan(3440);
    expect(wide.screen.x).toBeCloseTo((3440 - wide.screen.width) / 2, 6);
    expect(wide.screen.y).toBeCloseTo(0, 6);

    // A 4:3 tablet is the other way round: full width, bars above and below.
    const tall = getResponsiveViewport(1024, 768, frame.width, frame.height);
    expect(tall.screen.width).toBeCloseTo(1024, 6);
    expect(tall.screen.height).toBeLessThan(768);
    expect(tall.screen.y).toBeCloseTo((768 - tall.screen.height) / 2, 6);

    // And a 16:9 screen has no bars at all.
    const exact = getResponsiveViewport(1920, 1080, frame.width, frame.height);
    expect(exact.screen).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
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
        rendererWidth: 1920,
        rendererHeight: 1080
      })
    ).toEqual({ x: 1240, y: 1660 });
  });

  it.each([
    [1920, 1080],
    [1366, 768],
    [1024, 768]
  ])(
    "keeps the ship centred at cardinal and diagonal rim positions at %ix%i",
    (rendererWidth, rendererHeight) => {
      const viewport = getResponsiveViewport(rendererWidth, rendererHeight);
      const zoom = viewport.zoom;
      const radius = 52;
      const visualExtension = 42;
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
        const scroll = getPhaserCameraScroll({ focus, rendererWidth, rendererHeight });
        // Phaser zooms around the camera midpoint, so the visible world rect
        // sits half the difference in from the raw scroll.
        const worldView = {
          x: scroll.x + (rendererWidth - viewport.width) / 2,
          y: scroll.y + (rendererHeight - viewport.height) / 2
        };
        // Nothing clamps any more: the rim looks exactly like the middle.
        expect(worldView.x + viewport.width / 2).toBeCloseTo(focus.x, 10);
        expect(worldView.y + viewport.height / 2).toBeCloseTo(focus.y, 10);
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
