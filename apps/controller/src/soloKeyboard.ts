import { getKeyboardVector, type ControlVector } from "./controlInput.js";

/**
 * Matches `headingMaxAngularSpeedPerSecond` in the simulation config, so the
 * requested course never runs ahead of the hull the server is actually turning.
 */
export const SOLO_TURN_RATE_RADIANS_PER_SECOND = (13 * Math.PI) / 15;

export const SOLO_THROTTLE_KEY = "KeyW";
export const SOLO_BRAKE_KEY = "KeyS";
export const SOLO_TURN_LEFT_KEY = "KeyA";
export const SOLO_TURN_RIGHT_KEY = "KeyD";
export const SOLO_MG_FIRE_KEY = "Space";
export const SOLO_CANNON_FIRE_KEY = "Enter";
export const SOLO_TURRET_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;
/** Keys that own the course, and therefore reseat it from the authoritative nose. */
export const SOLO_HELM_KEYS: readonly string[] = [
  SOLO_THROTTLE_KEY,
  SOLO_TURN_LEFT_KEY,
  SOLO_TURN_RIGHT_KEY
];

export const SOLO_KEYS: readonly string[] = [
  SOLO_THROTTLE_KEY,
  SOLO_BRAKE_KEY,
  SOLO_TURN_LEFT_KEY,
  SOLO_TURN_RIGHT_KEY,
  SOLO_MG_FIRE_KEY,
  SOLO_CANNON_FIRE_KEY,
  ...SOLO_TURRET_KEYS
];

/**
 * Share of full thrust that a turn without the engine costs. The core reads the
 * course from the direction of the pilot vector, so a strictly zero vector
 * cannot steer; this is the smallest push that still turns the hull, and it
 * creeps at about 6 units per second against a top speed of 320.
 */
export const SOLO_ROTATE_IN_PLACE_THROTTLE = 0.02;

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
  turnRate = SOLO_TURN_RATE_RADIANS_PER_SECOND
): HeadingDrive {
  const throttling = keys.has(SOLO_THROTTLE_KEY) && !keys.has(SOLO_BRAKE_KEY);
  const turn = Number(keys.has(SOLO_TURN_RIGHT_KEY)) - Number(keys.has(SOLO_TURN_LEFT_KEY));
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
      x: Math.cos(next) * SOLO_ROTATE_IN_PLACE_THROTTLE,
      y: Math.sin(next) * SOLO_ROTATE_IN_PLACE_THROTTLE
    }
  };
}

/** The turret bearing the arrow keys ask for; empty means "leave it alone". */
export function getTurretKeyboardVector(keys: ReadonlySet<string>): ControlVector {
  return getKeyboardVector(
    new Set(
      [...keys].filter((key) => SOLO_TURRET_KEYS.includes(key as (typeof SOLO_TURRET_KEYS)[number]))
    )
  );
}
