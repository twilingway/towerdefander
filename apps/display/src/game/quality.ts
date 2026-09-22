/**
 * How much the display draws, in three steps.
 *
 * Measured on a Redmi 4X over USB (docs/performance/weak-devices.md): with the
 * whole scene and HUD hidden the phone holds 59 fps, so there is no fixed cost
 * in the way - the frame is spent drawing, spread over many small things. The
 * steps below drop the ones that cost the most and carry the least of the game:
 *
 * - `high`: everything, at the display's own rate.
 * - `mid`: without the per-frame vector overlays (aim envelope, focus rings,
 *   shield sector, beams), the muzzle flashes and the exhaust, and the arena
 *   floor's translucent fill - its rings, spokes and rim band stay. On the
 *   phone this took 38 fps with 45% stutter to 52 fps with 13%.
 * - `low`: `mid`, paced to an even 30 frames a second. A device that cannot
 *   hold 60 alternates 16 and 33 ms frames, which reads as judder; every
 *   second frame, evenly, reads as smooth.
 */
export type QualityLevel = "high" | "mid" | "low";

export interface QualitySettings {
  readonly vectors: boolean;
  readonly muzzleFlashes: boolean;
  readonly exhaust: boolean;
  readonly floorFill: boolean;
  /** Frames a second the scene is drawn at; 60 means the display's own rate. */
  readonly frameCap: 60 | 30;
}

export const QUALITY_SETTINGS: Readonly<Record<QualityLevel, QualitySettings>> = {
  high: { vectors: true, muzzleFlashes: true, exhaust: true, floorFill: true, frameCap: 60 },
  mid: { vectors: false, muzzleFlashes: false, exhaust: false, floorFill: false, frameCap: 60 },
  low: { vectors: false, muzzleFlashes: false, exhaust: false, floorFill: false, frameCap: 30 }
};

/** What the player picked: a level, or leaving it to the measurement. */
export type QualityChoice = "auto" | QualityLevel;

export const QUALITY_CHOICES: readonly QualityChoice[] = ["auto", "high", "mid", "low"];

function isChoice(value: string | null | undefined): value is QualityChoice {
  return QUALITY_CHOICES.includes(value as QualityChoice);
}

/**
 * The choice in force: `?quality=` first, because a measuring script and a bug
 * report both need to pin it from an address, then what the player saved, then
 * automatic.
 */
export function readQualityChoice(search: string, stored: string | null): QualityChoice {
  const fromAddress = new URLSearchParams(search).get("quality");
  if (isChoice(fromAddress)) return fromAddress;
  return isChoice(stored) ? stored : "auto";
}

/** The level an automatic choice starts a run at. */
export const AUTO_START: QualityLevel = "high";

/**
 * Frames a second under which each level steps down, and for how long.
 *
 * `high` goes at fifty rather than the density ladder's thirty: that ladder is
 * about a phone that cannot run the game at all, this one about a phone that
 * runs it with a judder - 35 to 45 fps on a 60 Hz panel is exactly that.
 *
 * `mid` goes only at forty. On the Redmi 4X `mid` settles around 49-51 with
 * two thirds of its frames on time, and `low`'s even 30 measured no better
 * there - a fifth of its frames still missed a refresh - so a phone near fifty
 * is left where it is, and `low` is kept for one that `mid` still leaves
 * juddering.
 *
 * Ten samples at the canvas's half-second clock is five seconds, long enough
 * that one crowded moment does not cost a player the flashes for the run.
 */
export const QUALITY_FALLBACK_FPS: Readonly<Record<"high" | "mid", number>> = { high: 50, mid: 40 };
export const QUALITY_FALLBACK_SAMPLES = 10;

const LADDER: readonly QualityLevel[] = ["high", "mid", "low"];

/**
 * The next level for an automatic choice, given the one in force and the last
 * samples. Down only, and never below `low`: a run that recovered because a
 * wave ended would otherwise climb and fall again with the next one.
 *
 * `low` is never left for a lower level by this, because under `low` the scene
 * is drawn at 30 on purpose and its frame rate says nothing about the device.
 */
export function nextAutoQuality(current: QualityLevel, recentFps: readonly number[]): QualityLevel {
  if (current === "low") return current;
  if (recentFps.length < QUALITY_FALLBACK_SAMPLES) return current;
  const window = recentFps.slice(-QUALITY_FALLBACK_SAMPLES);
  // A zero is a scene that has not started rather than one that is struggling.
  const floor = QUALITY_FALLBACK_FPS[current];
  if (!window.every((fps) => fps > 0 && fps < floor)) return current;
  return LADDER[LADDER.indexOf(current) + 1] ?? current;
}

const STORAGE_KEY = "spaceship-defender:quality";

export function readStoredQuality(): string | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function storeQuality(choice: QualityChoice): void {
  try {
    (globalThis as { localStorage?: Storage }).localStorage?.setItem(STORAGE_KEY, choice);
  } catch {
    // A device that cannot keep it gets the same choice for this page only.
  }
}
