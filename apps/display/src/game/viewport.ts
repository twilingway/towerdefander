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
 * The frame every crew sees, fitted into whatever glass they have.
 *
 * The slice shown takes the glass's own shape, held between `narrowestAspect`
 * and `widestAspect`, so glass inside that range fills edge to edge. At the
 * frame's shape or wider the slice keeps the frame's height and grows across;
 * past `widestAspect` bars appear at the sides. Narrower than the frame it keeps
 * the frame's area instead, a little narrower and taller; past `narrowestAspect`
 * bars appear above and below. Without the caps an ultrawide monitor would see
 * a third more arena across than a phone and a 4:3 tablet a quarter more of its
 * height, and that much more warning about what is flying at you is not a
 * display setting; about a tenth either way, at 21:9 and at 16:9, was the
 * operator's call.
 *
 * Left at their defaults both caps are the frame's own shape, which is the plain
 * letterbox: every device shows exactly the frame.
 *
 * `width` and `height` are the world the camera shows; `screen` is where that
 * lands in pixels. Everything outside `screen` is a bar.
 */
export function getResponsiveViewport(
  actualWidth: number,
  actualHeight: number,
  baseWidth = 1600,
  baseHeight = 900,
  widestAspect = baseWidth / baseHeight,
  narrowestAspect = baseWidth / baseHeight
): ResponsiveViewport {
  const safeWidth = Number.isFinite(actualWidth) && actualWidth > 0 ? actualWidth : baseWidth;
  const safeHeight = Number.isFinite(actualHeight) && actualHeight > 0 ? actualHeight : baseHeight;
  const frame = baseWidth / baseHeight;
  const shape = Math.min(
    Math.max(safeWidth / safeHeight, Math.min(narrowestAspect, frame)),
    Math.max(widestAspect, frame)
  );
  // The frame's height at its shape or wider, its area when narrower; the frame
  // itself, to the unit, when the glass has its shape.
  const height = shape < frame ? Math.sqrt((baseWidth * baseHeight) / shape) : baseHeight;
  const width = shape === frame ? baseWidth : height * shape;
  const zoom = Math.min(safeWidth / width, safeHeight / height);
  const screenWidth = width * zoom;
  const screenHeight = height * zoom;
  return {
    zoom,
    width,
    height,
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
export function nextPixelRatioCap(
  currentCap: number,
  recentFps: readonly number[],
  frameCap = 60
): number {
  if (recentFps.length < PIXEL_RATIO_FALLBACK_SAMPLES) return currentCap;
  const window = recentFps.slice(-PIXEL_RATIO_FALLBACK_SAMPLES);
  /*
   * Judged against the rate the scene is paced to, not the display's: a scene
   * held to an even 30 on purpose reads 29-30 fps, and against the plain
   * threshold that walked the low quality level down to one pixel a pixel.
   */
  const threshold = (PIXEL_RATIO_FALLBACK_FPS * frameCap) / 60;
  // A zero is a scene that has not started rather than one that is struggling.
  if (!window.every((fps) => fps > 0 && fps < threshold)) return currentCap;
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
 * Share of the camera's travel the nebula follows.
 *
 * The farthest layer of the sky, so slower than any star in front of it. It used to be measured in
 * arena radii instead - the picture reached the end of its margin exactly at the rim - which made
 * its pace a property of the field: under a twentieth of the camera on the preset's arena, under a
 * hundredth on the largest, and slower than the stars that are meant to lie in front of it.
 */
export const NEBULA_PARALLAX = 0.08;
/** The picture is never drawn smaller than this multiple of the frame: the slack it always had. */
export const PICTURE_SLACK_MIN = 1.18;
/** Nor larger than this one: past it the picture is stretched well beyond its own texels. */
export const PICTURE_SLACK_MAX = 1.6;

/**
 * How much to scale the sky picture so it covers the frame with room to move.
 *
 * The nebula needs `pace × radius` of margin past the frame on each side to keep its pace all the
 * way to the rim. It gets that, but never less than the old slack and never more than the ceiling;
 * on a field too large for the ceiling it reaches its margin before the rim and waits there.
 */
export function backdropPictureScale(
  picture: { readonly width: number; readonly height: number },
  cover: { readonly width: number; readonly height: number },
  arenaRadius: number,
  parallaxStrength: number
): number {
  const reach = NEBULA_PARALLAX * Math.max(0, parallaxStrength) * Math.max(0, arenaRadius);
  const fit = (width: number, height: number): number =>
    Math.max(width / picture.width, height / picture.height);
  const floor = fit(cover.width * PICTURE_SLACK_MIN, cover.height * PICTURE_SLACK_MIN);
  const ceiling = fit(cover.width * PICTURE_SLACK_MAX, cover.height * PICTURE_SLACK_MAX);
  return Math.min(ceiling, Math.max(floor, fit(cover.width + reach * 2, cover.height + reach * 2)));
}

/**
 * How far the sky picture is pushed against the camera from the frame's centre: the nebula's pace
 * times the camera's distance from the arena centre, clamped to the margin the picture has on each
 * axis, so the void is never bared.
 */
export function backdropShift(
  cameraX: number,
  cameraY: number,
  centerX: number,
  centerY: number,
  parallaxStrength: number,
  marginX: number,
  marginY: number
): { readonly x: number; readonly y: number } {
  const pace = NEBULA_PARALLAX * parallaxStrength;
  const shift = (delta: number, margin: number): number =>
    Math.max(-margin, Math.min(margin, delta * pace));
  return { x: shift(centerX - cameraX, marginX), y: shift(centerY - cameraY, marginY) };
}

/** Share of the camera's travel a star at full depth follows: the nearest stars, a third of it. */
export const STAR_PARALLAX = 0.36;

/** One layer of stars: how many, how large its baked dot is, and the depths they are drawn from. */
export interface StarLayer {
  readonly count: number;
  /** The dot's radius, in the units the frame rectangle is measured in. */
  readonly radius: number;
  readonly depthMin: number;
  readonly depthMax: number;
}

/**
 * The three layers of stars, far to near.
 *
 * Depth sets both how fast a star moves and how bright it is, so a nearer layer is faster and
 * brighter, and its dot is larger. The ranges do not overlap: every star of a nearer layer outruns
 * every star of the layer behind it.
 */
export const STAR_LAYERS: readonly StarLayer[] = [
  { count: 140, radius: 1.6, depthMin: 0.33, depthMax: 0.5 },
  { count: 60, radius: 2.4, depthMin: 0.55, depthMax: 0.7 },
  { count: 22, radius: 3.6, depthMin: 0.85, depthMax: 1 }
];

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
