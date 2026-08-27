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

export const SOLO_KEYS: readonly string[] = [
  SOLO_THROTTLE_KEY,
  SOLO_BRAKE_KEY,
  SOLO_TURN_LEFT_KEY,
  SOLO_TURN_RIGHT_KEY,
  SOLO_MG_FIRE_KEY,
  SOLO_CANNON_FIRE_KEY,
  ...SOLO_TURRET_KEYS
];

export interface HeadingDrive {
  /** The course the player is asking for, in radians. */
  readonly heading: number;
  /** What goes on the wire: full thrust along that course, or a dead stop. */
  readonly vector: ControlVector;
}

/**
 * One tick of the solo keyboard drive. The hull turns only while the throttle
 * is held, because the course the core follows is the direction of the pilot
 * vector: a zero vector brakes and keeps the bearing, so there is nothing to
 * steer with when the engine is off.
 */
export function advanceHeadingDrive(
  heading: number,
  keys: ReadonlySet<string>,
  elapsedSeconds: number,
  turnRate = SOLO_TURN_RATE_RADIANS_PER_SECOND
): HeadingDrive {
  const throttling = keys.has(SOLO_THROTTLE_KEY) && !keys.has(SOLO_BRAKE_KEY);
  if (!throttling) {
    return { heading, vector: { x: 0, y: 0 } };
  }
  const turn = Number(keys.has(SOLO_TURN_RIGHT_KEY)) - Number(keys.has(SOLO_TURN_LEFT_KEY));
  const next = heading + turn * turnRate * Math.max(0, elapsedSeconds);
  return { heading: next, vector: { x: Math.cos(next), y: Math.sin(next) } };
}

/** The turret bearing the arrow keys ask for; empty means "leave it alone". */
export function getTurretKeyboardVector(keys: ReadonlySet<string>): ControlVector {
  return getKeyboardVector(
    new Set(
      [...keys].filter((key) => SOLO_TURRET_KEYS.includes(key as (typeof SOLO_TURRET_KEYS)[number]))
    )
  );
}
