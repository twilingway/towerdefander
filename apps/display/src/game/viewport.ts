import type { Point } from "./spaceshipViewModel.js";

/**
 * The glass, and the slice of world drawn onto it.
 *
 * Everything here is arithmetic about pixels rather than about the field: how
 * large a buffer to ask for, how much of it the camera gets, where the frame
 * sits inside it and how wide the bars are left over. The field's own geometry
 * lives next door in `spaceshipViewModel`.
 */

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

/**
 * How far the sky picture is pushed against the camera, as a share of its own margin past the
 * frame on each axis, from -1 to 1.
 *
 * The reference shifted its picture by a fixed fraction of the ship's position, which on a field
 * ten thousand units across walks it hundreds of pixels past its margin and bares the void at the
 * rim. Measured in arena radii instead, and clamped, the picture reaches the end of its margin no
 * nearer the centre than the parallax strength allows and never further than the margin itself.
 */
export function backdropShiftShare(
  cameraX: number,
  cameraY: number,
  centerX: number,
  centerY: number,
  arenaRadius: number,
  parallaxStrength: number
): { readonly x: number; readonly y: number } {
  const radius = arenaRadius > 0 ? arenaRadius : 1;
  const share = (delta: number): number =>
    Math.max(-1, Math.min(1, (delta / radius) * parallaxStrength));
  return { x: share(centerX - cameraX), y: share(centerY - cameraY) };
}

/** Share of the camera's travel a star at full depth follows; the reference's number. */
export const STAR_PARALLAX = 0.018;

/**
 * Where one star sits inside the rectangle the field covers: its home, shifted against the camera
 * by its depth, wrapped so the field never runs out however far the ship flies.
 */
export function starPosition(
  home: { readonly u: number; readonly v: number; readonly depth: number },
  cameraX: number,
  cameraY: number,
  width: number,
  height: number,
  parallaxStrength: number
): { readonly x: number; readonly y: number } {
  const wrap = (value: number, size: number): number => ((value % size) + size) % size;
  const pull = home.depth * STAR_PARALLAX * parallaxStrength;
  return {
    x: wrap(home.u * width - cameraX * pull, width),
    y: wrap(home.v * height - cameraY * pull, height)
  };
}

/** A star's opacity: nearer stars brighter, a slow twinkle unless motion is to be reduced. */
export function starAlpha(depth: number, phase: number, seconds: number, twinkle: boolean): number {
  const base = 0.25 + 0.55 * depth;
  const flicker = twinkle ? 0.1 * Math.sin(seconds * 2 + phase) : 0;
  return Math.max(0, Math.min(1, base + flicker));
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
