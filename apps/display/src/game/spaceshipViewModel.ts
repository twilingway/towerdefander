export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A segment between two authoritative samples, addressed in gameplay ticks
 * rather than in arrival milliseconds: the server decides when a tick exists,
 * the display only decides how fast it plays them back.
 */
export interface PointTransition {
  readonly from: Point;
  readonly to: Point;
  readonly fromTick: number;
  readonly toTick: number;
}

export interface AngleTransition {
  readonly from: number;
  readonly to: number;
  readonly fromTick: number;
  readonly toTick: number;
}

export interface VisualSnapshot {
  readonly spaceship: Point;
  readonly turretAngle: number;
  readonly shield: { readonly angle: number };
}

export interface VisualTransitions {
  readonly spaceship: PointTrack;
  readonly turret: AngleTrack;
  readonly shield: AngleTrack;
}

export interface ResponsiveViewport {
  readonly zoom: number;
  /** Where the frame lands in screen pixels; outside it the glass is a bar. */
  readonly screen: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly width: number;
  readonly height: number;
}

export interface ShieldDash {
  /** Along the arc, in world units at the shield radius. */
  readonly lengthPx: number;
  readonly gapPx: number;
}

export interface ShieldVisualStyle {
  readonly lineWidth: number;
  readonly color: number;
  readonly alpha: number;
  /** Null draws one solid arc; a dash splits it into strokes. */
  readonly dash: ShieldDash | null;
  /**
   * Widest point of a filled crescent, in world units. Null strokes the arc at
   * `lineWidth` instead.
   */
  readonly crescentThickness: number | null;
}

export interface GridSegment {
  readonly from: Point;
  readonly to: Point;
}

export interface RimBandStroke {
  /** Circle the stroke is centred on, so it covers [arena - width, arena]. */
  readonly radius: number;
  readonly thickness: number;
}

/**
 * The elastic band drawn as one thick stroked circle rather than two fills:
 * a stroke of width `w` centred on `arenaRadius - w / 2` covers exactly the
 * ring the simulation slows a hull in. Null means there is no band to show.
 */
export function getRimBandStroke(arenaRadius: number, bandWidth: number): RimBandStroke | null {
  if (!Number.isFinite(arenaRadius) || !Number.isFinite(bandWidth)) return null;
  if (arenaRadius <= 0 || bandWidth <= 0) return null;
  const thickness = Math.min(bandWidth, arenaRadius);
  return { radius: arenaRadius - thickness / 2, thickness };
}

/**
 * Distance rings inside the arena, evenly spaced and leaving the rim to the
 * border stroke. The count is fixed and the spacing follows the radius, so a
 * larger arena reads the same rather than turning into a denser field.
 */
export function getArenaRingRadii(arenaRadius: number, count = 3): readonly number[] {
  if (!Number.isFinite(arenaRadius) || arenaRadius <= 0) return [];
  const rings = Math.max(0, Math.trunc(count));
  return Array.from({ length: rings }, (_, index) => (arenaRadius * (index + 1)) / (rings + 1));
}

/**
 * Radial spokes from a clearing at the centre out to the rim. The clearing
 * keeps sixteen lines from converging into a blot where the ship starts.
 */
export function getArenaSpokes(
  centerX: number,
  centerY: number,
  arenaRadius: number,
  count = 16,
  innerFraction = 0.06
): readonly GridSegment[] {
  if (!Number.isFinite(arenaRadius) || arenaRadius <= 0) return [];
  const spokes = Math.max(0, Math.trunc(count));
  const inner = arenaRadius * clamp(innerFraction, 0, 1);
  return Array.from({ length: spokes }, (_, index) => {
    const angle = (index / spokes) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      from: { x: centerX + cos * inner, y: centerY + sin * inner },
      to: { x: centerX + cos * arenaRadius, y: centerY + sin * arenaRadius }
    };
  });
}

export function getShieldArcRange(
  angle: number,
  arcHalfAngle: number
): { readonly start: number; readonly end: number } {
  return { start: angle - arcHalfAngle, end: angle + arcHalfAngle };
}

export interface StableIdReconciliation {
  readonly create: readonly string[];
  readonly update: readonly string[];
  readonly remove: readonly string[];
}

export function reconcileStableIds(
  existingIds: Iterable<string>,
  incomingIds: Iterable<string>
): StableIdReconciliation {
  const existing = new Set(existingIds);
  const incoming = new Set(incomingIds);
  const create: string[] = [];
  const update: string[] = [];
  const remove: string[] = [];
  for (const id of incoming) (existing.has(id) ? update : create).push(id);
  for (const id of existing) if (!incoming.has(id)) remove.push(id);
  return { create, update, remove };
}

export interface CameraScrollInput {
  readonly focus: Point;
  readonly rendererWidth: number;
  readonly rendererHeight: number;
}

/**
 * The frame every crew sees, letterboxed into whatever glass they have.
 *
 * The zoom is the same fit it always was - the largest that puts the frame
 * inside the screen. What changed is that the visible world is the frame
 * itself, not the screen divided by that zoom: dividing it back out handed the
 * looser axis to the device, so an ultrawide monitor saw a third more arena
 * than a laptop and a 4:3 tablet a third more sky. Thirty per cent more warning
 * about what is flying at you is not a display setting.
 *
 * `screen` is where that frame lands in pixels. Everything outside it is a bar.
 */
export function getResponsiveViewport(
  actualWidth: number,
  actualHeight: number,
  baseWidth = 1600,
  baseHeight = 900
): ResponsiveViewport {
  const safeWidth = Number.isFinite(actualWidth) && actualWidth > 0 ? actualWidth : baseWidth;
  const safeHeight = Number.isFinite(actualHeight) && actualHeight > 0 ? actualHeight : baseHeight;
  const zoom = Math.min(safeWidth / baseWidth, safeHeight / baseHeight);
  const screenWidth = baseWidth * zoom;
  const screenHeight = baseHeight * zoom;
  return {
    zoom,
    width: baseWidth,
    height: baseHeight,
    screen: {
      x: (safeWidth - screenWidth) / 2,
      y: (safeHeight - screenHeight) / 2,
      width: screenWidth,
      height: screenHeight
    }
  };
}

/**
 * How many device pixels the scene is willing to draw per pixel of glass.
 *
 * A canvas draws into a buffer sized in CSS pixels unless someone says
 * otherwise, and a phone shows three device pixels for each of those - so the
 * arena was rasterised at a third of the linear resolution of the panel and
 * then blown back up, which is why the battlefield read as mush beside a HUD
 * the browser had drawn at full density. The cost is the square of this
 * number, on a scene that is already fill-bound: two is four times the pixels,
 * three is nine. So this is a ceiling rather than a target - a panel gets what
 * it has, up to here - and it sits high because two other things bound it
 * better than a guess does. The edge clamp in `getBackingStoreSize` keeps the
 * buffer inside what the GPU will allocate, which is what actually bites on a
 * large dense screen; and `nextPixelRatioCap` walks it down on a machine that
 * cannot keep up. Measured: a mid-range phone at 2.75 holds 51 frames in a
 * crowd once the shield stopped running its bloom over the whole canvas.
 */
export const DEVICE_PIXEL_RATIO_CAP = 4;

/**
 * Frames a second below which the scene is not keeping up in a way anyone can
 * miss, and how long it has to stay there before the resolution is given up.
 *
 * Ten seconds, because a wave that briefly puts forty ships on the field is not
 * a phone that cannot run the game, and a picture that changes sharpness every
 * time a crowd arrives is worse than one that is simply softer.
 */
export const PIXEL_RATIO_FALLBACK_FPS = 30;
export const PIXEL_RATIO_FALLBACK_SAMPLES = 20;

/** The ladder the ceiling walks down, and never back up inside a run. */
const PIXEL_RATIO_STEPS = [3, 2, 1] as const;
// Note the ladder starts below the ceiling on purpose: a panel drawn at four
// steps to three first, and one already at two steps to one.

/**
 * The ceiling to draw at next, given the one in force and how the last samples
 * went.
 *
 * Down only: a run that recovers because the wave ended would otherwise climb
 * back and drop again on the next one, and a picture that keeps changing its
 * mind is the worst of both.
 */
export function nextPixelRatioCap(currentCap: number, recentFps: readonly number[]): number {
  if (recentFps.length < PIXEL_RATIO_FALLBACK_SAMPLES) return currentCap;
  const window = recentFps.slice(-PIXEL_RATIO_FALLBACK_SAMPLES);
  // A zero is a scene that has not started rather than one that is struggling.
  if (!window.every((fps) => fps > 0 && fps < PIXEL_RATIO_FALLBACK_FPS)) return currentCap;
  const lower = PIXEL_RATIO_STEPS.filter((step) => step < currentCap);
  return lower[0] ?? currentCap;
}

export interface BackingStoreInput {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly cap?: number;
  /**
   * Largest edge the GPU will hand out. The shield's glow allocates a target
   * the size of the frame, and older mobile parts stop at 4096.
   */
  readonly maxDimension?: number;
}

export interface BackingStoreSize {
  readonly width: number;
  readonly height: number;
  /** What the sizes were multiplied by, after the cap and the clamp. */
  readonly ratio: number;
}

/**
 * The buffer to draw into for a given piece of glass. Everything downstream
 * stays honest because `getResponsiveViewport` is homogeneous: multiply the
 * sizes by this ratio and the zoom comes out multiplied by the same ratio, so
 * `screen.width / zoom` - the slice of world a crew is shown - does not move.
 */
export function getBackingStoreSize(input: BackingStoreInput): BackingStoreSize {
  const cssWidth = Number.isFinite(input.cssWidth) && input.cssWidth > 0 ? input.cssWidth : 1;
  const cssHeight = Number.isFinite(input.cssHeight) && input.cssHeight > 0 ? input.cssHeight : 1;
  // jsdom reports no ratio at all, and a browser can report a zero mid-resize.
  const density =
    Number.isFinite(input.devicePixelRatio) && input.devicePixelRatio > 0
      ? input.devicePixelRatio
      : 1;
  const asked = input.cap ?? DEVICE_PIXEL_RATIO_CAP;
  const cap = Number.isFinite(asked) && asked > 0 ? asked : DEVICE_PIXEL_RATIO_CAP;
  const maxDimension =
    Number.isFinite(input.maxDimension) && (input.maxDimension ?? 0) > 0
      ? (input.maxDimension ?? Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY;
  const longest = Math.max(cssWidth, cssHeight);
  const ratio = Math.max(1, Math.min(density, cap, maxDimension / longest));
  return {
    width: Math.round(cssWidth * ratio),
    height: Math.round(cssHeight * ratio),
    ratio
  };
}

/**
 * Thinnest bar worth putting a readout in. Below this a stacked chip is a
 * column of clipped words, and the readouts are better off overlaying the
 * battlefield the way they do on a screen with no bars at all.
 */
export const USABLE_BAR_THICKNESS_PX = 56;

export interface LetterboxBars {
  /** Thickness of one bar, in the same pixels the sizes came in. */
  readonly thickness: number;
  /** Which pair of bars the frame leaves, and whether they are worth using. */
  readonly placement: "side" | "top" | "none";
}

/**
 * Where the letterbox leaves room, and whether there is enough of it to hold
 * anything.
 *
 * The frame is a fixed slice of world, so glass that is not its shape has bars
 * - and on a phone held sideways that is a fifth of the screen sitting empty
 * while the readouts lie on top of the battlefield. This says which side the
 * empty strip is on, so the readouts can be put in it instead.
 */
export function getLetterboxBars(
  glassWidth: number,
  glassHeight: number,
  frame: { readonly width: number; readonly height: number },
  minimumThickness = USABLE_BAR_THICKNESS_PX
): LetterboxBars {
  const sideBar = (glassWidth - frame.width) / 2;
  const topBar = (glassHeight - frame.height) / 2;
  if (sideBar >= topBar && sideBar >= minimumThickness) {
    return { thickness: sideBar, placement: "side" };
  }
  if (topBar > sideBar && topBar >= minimumThickness) {
    return { thickness: topBar, placement: "top" };
  }
  return { thickness: Math.max(0, Math.max(sideBar, topBar)), placement: "none" };
}

/** Screen pixels of slack kept past every renderer edge, so rounding never bares the void. */
export const BACKGROUND_COVER_MARGIN_PX = 64;

export interface BackgroundCoverRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * World rectangle for a screen-fixed background layer (scrollFactor 0) that has to cover the
 * whole renderer. Zoom still applies to such a sprite, around the camera origin:
 * `screen = half * (1 - zoom) + zoom * world`. A layer pinned to the world origin therefore
 * lands `half * (1 - zoom)` off the screen corner and leaves a bare strip on one side at every
 * zoom but 1 — the strip is widest when the tuned camera width forces zoom well under 1.
 */
export function getBackgroundCoverRect(
  rendererWidth: number,
  rendererHeight: number,
  zoom: number,
  marginPx = BACKGROUND_COVER_MARGIN_PX
): BackgroundCoverRect {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    x: rendererWidth / 2 - (rendererWidth / 2 + marginPx) / safeZoom,
    y: rendererHeight / 2 - (rendererHeight / 2 + marginPx) / safeZoom,
    width: (rendererWidth + marginPx * 2) / safeZoom,
    height: (rendererHeight + marginPx * 2) / safeZoom
  };
}

export interface BackgroundLayerMotion {
  /** Fraction of camera scroll the layer follows, per axis (demo values; may be negative). */
  readonly factorX: number;
  readonly factorY: number;
  /** Idle drift in texture pixels per second at driftSpeed multiplier 1. */
  readonly driftX: number;
  readonly driftY: number;
}

/**
 * Tile offset for a screen-fixed parallax layer (scrollFactor 0). The scroll term is the
 * fraction of camera movement the layer follows, scaled by the admin's parallax strength;
 * the drift term keeps the background alive while idle and ignores both zoom and strength.
 * No extra zoom factor: for a scroll-factor-0 sprite texture offsets are world units that the
 * camera already scales on screen, so this keeps the depth ratio at any camera distance.
 */
export function backgroundTileOffset(
  layer: BackgroundLayerMotion,
  scrollX: number,
  scrollY: number,
  parallaxStrength: number,
  driftSeconds: number
): { readonly x: number; readonly y: number } {
  return {
    x: scrollX * layer.factorX * parallaxStrength + driftSeconds * layer.driftX,
    y: scrollY * layer.factorY * parallaxStrength + driftSeconds * layer.driftY
  };
}

export function getShieldVisualStyle(active: boolean): ShieldVisualStyle {
  return active
    ? { lineWidth: 11, color: 0x65baff, alpha: 0.85, dash: null, crescentThickness: 11 }
    : {
        lineWidth: 6,
        color: 0x6f91a4,
        alpha: 0.35,
        dash: { lengthPx: 16, gapPx: 12 },
        crescentThickness: null
      };
}

/** Samples along the sector; enough that the tapered edge reads as a curve. */
export const SHIELD_CRESCENT_SAMPLES = 48;

/**
 * Outlines the raised shield as a crescent: a band that is widest at the middle
 * of the sector and narrows to nothing at both tips.
 *
 * Graphics strokes at one width per path, so a band that changes thickness has
 * to be a filled shape rather than a thicker line. The outline runs along the
 * outer edge and returns along the inner one, which also gives the glow filter
 * a soft tapered silhouette to bloom around instead of a blunt stroke.
 */
export function getShieldCrescentPoints(
  start: number,
  end: number,
  radius: number,
  thickness: number,
  samples: number = SHIELD_CRESCENT_SAMPLES
): readonly Point[] {
  const sweep = end - start;
  const steps = Math.floor(samples);
  if (!(radius > 0) || !(sweep > 0) || !(thickness > 0) || steps < 2) return [];

  const halfThickness = thickness / 2;
  const outer: Point[] = [];
  const inner: Point[] = [];
  for (let index = 0; index < steps; index += 1) {
    const progress = index / (steps - 1);
    const angle = start + sweep * progress;
    // A sine profile reaches zero at both tips and its widest in the middle, so
    // the band closes on itself without a visible seam.
    const halfWidth = halfThickness * Math.sin(Math.PI * progress);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    outer.push({ x: cos * (radius + halfWidth), y: sin * (radius + halfWidth) });
    inner.push({ x: cos * (radius - halfWidth), y: sin * (radius - halfWidth) });
  }
  return [...outer, ...inner.reverse()];
}

export interface ShieldArcSegment {
  readonly start: number;
  readonly end: number;
}

/**
 * Splits a shield arc into dashes. Phaser Graphics strokes solid lines only, so
 * the dashing is geometry rather than a line style. The sector keeps its own
 * ends: the first dash starts at `start` and the last one is clipped at `end`
 * rather than allowed to overshoot it.
 */
export function getShieldDashSegments(
  start: number,
  end: number,
  radius: number,
  dash: ShieldDash
): readonly ShieldArcSegment[] {
  const sweep = end - start;
  const period = dash.lengthPx + dash.gapPx;
  if (!(radius > 0) || !(sweep > 0) || !(dash.lengthPx > 0) || !(period > 0)) return [];

  const dashAngle = dash.lengthPx / radius;
  const periodAngle = period / radius;
  // A dash longer than the whole sector degenerates to the solid arc.
  if (dashAngle >= sweep) return [{ start, end }];

  const segments: ShieldArcSegment[] = [];
  for (let offset = 0; offset < sweep; offset += periodAngle) {
    segments.push({ start: start + offset, end: Math.min(end, start + offset + dashAngle) });
  }
  return segments;
}

/**
 * Phaser centres the view on `scroll + camera size / 2`, in unzoomed pixels,
 * so centring on the ship is just that offset. Nothing clamps it to the world:
 * a camera that stops at the rim leaves the snapshot pace visible on the ship
 * itself, while a camera that keeps moving carries it along unseen.
 */
export function getPhaserCameraScroll(input: CameraScrollInput): Point {
  return {
    x: input.focus.x - input.rendererWidth / 2,
    y: input.focus.y - input.rendererHeight / 2
  };
}

export class SnapshotResetLatch {
  private pending = false;

  request(): void {
    this.pending = true;
  }

  consumeForSnapshot(): boolean {
    const shouldReset = this.pending;
    this.pending = false;
    return shouldReset;
  }
}

export function createSnappedVisualTransitions(
  snapshot: VisualSnapshot,
  tick: number
): VisualTransitions {
  return {
    spaceship: createPointTrack(snapshot.spaceship, tick),
    turret: createAngleTrack(snapshot.turretAngle, tick),
    shield: createAngleTrack(snapshot.shield.angle, tick)
  };
}

/**
 * Two contiguous segments rather than one. Playback runs behind the newest
 * tick, and a patch that carried several ticks shortens the segment that
 * follows it, so a single segment leaves playback with nothing to draw and the
 * picture stands still. Keeping the displaced segment covers those excursions.
 */
export interface PointTrack {
  readonly previous: PointTransition;
  readonly current: PointTransition;
}

export interface AngleTrack {
  readonly previous: AngleTransition;
  readonly current: AngleTransition;
}

export function createPointTrack(value: Point, tick: number): PointTrack {
  const segment = createPointTransition(value, value, tick, tick);
  return { previous: segment, current: segment };
}

export function createAngleTrack(value: number, tick: number): AngleTrack {
  const segment = createAngleTransition(value, value, tick, tick);
  return { previous: segment, current: segment };
}

/** Adds the newest authoritative sample, displacing the oldest segment. */
export function extendPointTrack(track: PointTrack, to: Point, toTick: number): PointTrack {
  return {
    previous: track.current,
    current: createPointTransition(track.current.to, to, track.current.toTick, toTick)
  };
}

export function extendAngleTrack(track: AngleTrack, to: number, toTick: number): AngleTrack {
  return {
    previous: track.current,
    current: createAngleTransition(track.current.to, to, track.current.toTick, toTick)
  };
}

export function samplePointTrack(track: PointTrack, playbackTick: number): Point {
  const segment = playbackTick < track.current.fromTick ? track.previous : track.current;
  return interpolatePoint(
    segment.from,
    segment.to,
    getSegmentAlpha(segment.fromTick, segment.toTick, playbackTick)
  );
}

export function sampleAngleTrack(track: AngleTrack, playbackTick: number): number {
  const segment = playbackTick < track.current.fromTick ? track.previous : track.current;
  return interpolateAngle(
    segment.from,
    segment.to,
    getSegmentAlpha(segment.fromTick, segment.toTick, playbackTick)
  );
}

export function createPointTransition(
  from: Point,
  to: Point,
  fromTick: number,
  toTick: number
): PointTransition {
  return {
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    fromTick,
    toTick
  };
}

export function createAngleTransition(
  from: number,
  to: number,
  fromTick: number,
  toTick: number
): AngleTransition {
  return { from, to, fromTick, toTick };
}

/**
 * Playback of authoritative ticks. The server owns when a tick exists; the
 * display owns how fast it walks through them - and it cannot walk at the
 * nominal 50 ms per tick, because nothing guarantees the room emits them that
 * often. So the pace is measured from what actually arrives, and playback runs
 * a fixed lag behind the newest tick; that lag is what keeps a late patch from
 * showing up as a stall.
 */
export interface PlaybackClock {
  /** Where playback sits, in authoritative ticks; fractional between them. */
  readonly tick: number;
  /** Newest authoritative tick received. */
  readonly latestTick: number;
  /** Measured real milliseconds per authoritative tick. */
  readonly msPerTick: number;
  /** Smoothed arrival gap and ticks per arrival, kept apart on purpose. */
  readonly gapEmaMs: number;
  readonly tickEma: number;
}

/** Stands in until the first pair of snapshots has been timed. */
export const NOMINAL_MS_PER_TICK = 50;
const MIN_MS_PER_TICK = 20;
const MAX_MS_PER_TICK = 250;
/**
 * How far behind the newest tick playback aims to stay. One tick of slack
 * absorbs an arrival that runs late without ever leaving what the two kept
 * segments cover, so nothing has to be drawn twice while waiting.
 */
export const PLAYBACK_LAG_TICKS = 1;
/** Past this drift, correcting by rate is hopeless and playback jumps instead. */
export const PLAYBACK_RESYNC_TICKS = 6;
/** Weight of the newest measurement in the pace estimate. */
const PACE_SMOOTHING = 0.2;
/** Share of the drift taken back per tick of playback. */
const DRIFT_CORRECTION = 0.25;
const MIN_PLAYBACK_RATE = 0.85;
const MAX_PLAYBACK_RATE = 1.15;

export function createPlaybackClock(tick: number, msPerTick = NOMINAL_MS_PER_TICK): PlaybackClock {
  const pace = clamp(msPerTick, MIN_MS_PER_TICK, MAX_MS_PER_TICK);
  return { tick, latestTick: tick, msPerTick: pace, gapEmaMs: pace, tickEma: 1 };
}

/**
 * Folds one arrival into the pace estimate: `arrivalGapMs` is real time since
 * the previous snapshot, `tick` is its authoritative tick. A patch that carried
 * several ticks therefore lowers the per-tick pace instead of raising it.
 */
export function observePlaybackTick(
  clock: PlaybackClock,
  tick: number,
  arrivalGapMs: number
): PlaybackClock {
  const ticks = tick - clock.latestTick;
  // A tick that moved backwards is a different run, not a late patch. Without
  // re-anchoring, playback would sit at the old newest tick and never move
  // again, because nothing would ever raise it.
  if (ticks < 0) return createPlaybackClock(tick, clock.msPerTick);
  if (ticks === 0) return clock;
  if (!Number.isFinite(arrivalGapMs) || arrivalGapMs <= 0) return { ...clock, latestTick: tick };
  // Gap and tick count are smoothed apart and divided at the end. Smoothing the
  // ratio instead would average 62 ms and 31 ms across single- and double-tick
  // patches and land on 54 ms per tick where the room really runs 50.
  const gapEmaMs = clock.gapEmaMs + (arrivalGapMs - clock.gapEmaMs) * PACE_SMOOTHING;
  const tickEma = clock.tickEma + (ticks - clock.tickEma) * PACE_SMOOTHING;
  return {
    tick: clock.tick,
    latestTick: tick,
    msPerTick: clamp(gapEmaMs / tickEma, MIN_MS_PER_TICK, MAX_MS_PER_TICK),
    gapEmaMs,
    tickEma
  };
}

/**
 * Advances playback by one rendered frame. Drift is taken back by bending the
 * rate rather than by moving the position, so a correction never reads as a
 * jump; only a hopeless gap resyncs outright.
 */
export function advancePlayback(clock: PlaybackClock, deltaMs: number): PlaybackClock {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return clock;
  const target = clock.latestTick - PLAYBACK_LAG_TICKS;
  const drift = target - clock.tick;
  if (Math.abs(drift) > PLAYBACK_RESYNC_TICKS) return { ...clock, tick: target };
  const rate = clamp(1 + drift * DRIFT_CORRECTION, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE);
  const advanced = clock.tick + (deltaMs / clock.msPerTick) * rate;
  // Never render past the newest sample: there is nothing to interpolate
  // towards there, so the picture would have to guess.
  return { ...clock, tick: Math.min(advanced, clock.latestTick) };
}

export function interpolatePoint(current: Point, target: Point, amount: number): Point {
  const safeAmount = clamp(amount, 0, 1);
  return {
    x: current.x + (target.x - current.x) * safeAmount,
    y: current.y + (target.y - current.y) * safeAmount
  };
}

/**
 * Where playback sits inside one authoritative segment. A segment that spans
 * several ticks - a patch that carried more than one step - is played as one
 * longer move rather than as a jump, because the span comes from the ticks
 * themselves instead of from a fixed window.
 */
export function getSegmentAlpha(fromTick: number, toTick: number, playbackTick: number): number {
  const span = toTick - fromTick;
  if (!Number.isFinite(span) || !Number.isFinite(playbackTick) || span <= 0) return 1;
  return clamp((playbackTick - fromTick) / span, 0, 1);
}

export function interpolateAngle(current: number, target: number, amount: number): number {
  const safeAmount = clamp(amount, 0, 1);
  const fullTurn = Math.PI * 2;
  const wrappedDelta =
    ((((target - current + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
  // Match the authoritative core convention: an exact antipode turns in the
  // positive screen-clockwise direction instead of depending on modulo sign.
  const delta = wrappedDelta === -Math.PI ? Math.PI : wrappedDelta;
  return current + delta * safeAmount;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
