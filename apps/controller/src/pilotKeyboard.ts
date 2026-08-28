import { getKeyboardVector, type ControlVector } from "./controlInput.js";

/**
 * Matches `headingMaxAngularSpeedPerSecond` in the simulation config, so the
 * requested course never runs ahead of the hull the server is actually turning.
 */
export const TURN_RATE_RADIANS_PER_SECOND = (13 * Math.PI) / 15;

export const THROTTLE_KEY = "KeyW";
export const BRAKE_KEY = "KeyS";
export const TURN_LEFT_KEY = "KeyA";
export const TURN_RIGHT_KEY = "KeyD";
export const MG_FIRE_KEY = "Space";
export const TURRET_FIRE_KEY = "Enter";
export const TURRET_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;
/** Keys that own the course, and therefore reseat it from the authoritative nose. */
export const PILOT_HELM_KEYS: readonly string[] = [THROTTLE_KEY, TURN_LEFT_KEY, TURN_RIGHT_KEY];

export const PILOT_KEYS: readonly string[] = [
  THROTTLE_KEY,
  BRAKE_KEY,
  TURN_LEFT_KEY,
  TURN_RIGHT_KEY,
  MG_FIRE_KEY,
  TURRET_FIRE_KEY,
  ...TURRET_KEYS
];

/**
 * Share of full thrust that a turn without the engine costs. The core reads the
 * course from the direction of the pilot vector, so a strictly zero vector
 * cannot steer; this is the smallest push that still turns the hull, and it
 * creeps at about 6 units per second against a top speed of 320.
 */
export const ROTATE_IN_PLACE_THROTTLE = 0.02;

export interface HeadingDrive {
  /** The course the player is asking for, in radians. */
  readonly heading: number;
  /** What goes on the wire: full thrust, a turning nudge, or a dead stop. */
  readonly vector: ControlVector;
}

/**
 * One tick of the solo keyboard drive, shaped like a tank: the turn keys spin
 * the hull whether or not the engine is on. Standing still is not literally
 * still — the course the core follows is the direction of the pilot vector, so
 * turning in place rides on a token amount of thrust.
 */
export function advanceHeadingDrive(
  heading: number,
  keys: ReadonlySet<string>,
  elapsedSeconds: number,
  turnRate = TURN_RATE_RADIANS_PER_SECOND
): HeadingDrive {
  const throttling = keys.has(THROTTLE_KEY) && !keys.has(BRAKE_KEY);
  const turn = Number(keys.has(TURN_RIGHT_KEY)) - Number(keys.has(TURN_LEFT_KEY));
  const next = heading + turn * turnRate * Math.max(0, elapsedSeconds);
  if (throttling) {
    return { heading: next, vector: { x: Math.cos(next), y: Math.sin(next) } };
  }
  if (turn === 0) {
    return { heading: next, vector: { x: 0, y: 0 } };
  }
  return {
    heading: next,
    vector: {
      x: Math.cos(next) * ROTATE_IN_PLACE_THROTTLE,
      y: Math.sin(next) * ROTATE_IN_PLACE_THROTTLE
    }
  };
}

/**
 * Arrow keys as a second helm: up is the throttle, left and right turn. A pilot
 * without the turret gets the same drive under either hand.
 */
export function toHelmKeys(keys: ReadonlySet<string>): ReadonlySet<string> {
  const helm = new Set(keys);
  if (keys.has("ArrowUp")) helm.add(THROTTLE_KEY);
  if (keys.has("ArrowDown")) helm.add(BRAKE_KEY);
  if (keys.has("ArrowLeft")) helm.add(TURN_LEFT_KEY);
  if (keys.has("ArrowRight")) helm.add(TURN_RIGHT_KEY);
  return helm;
}

/** The turret bearing the arrow keys ask for; empty means "leave it alone". */
export function getTurretKeyboardVector(keys: ReadonlySet<string>): ControlVector {
  return getKeyboardVector(
    new Set([...keys].filter((key) => TURRET_KEYS.includes(key as (typeof TURRET_KEYS)[number])))
  );
}
