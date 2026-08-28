import { getKeyboardVector, type ControlVector } from "./controlInput.js";

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

/**
 * How far ahead of the nose the requested course sits while a turn key is held.
 * The hull chases a target at `sqrt(2 * braking * delta)`, so this angle alone
 * sets the turn rate: about 2.6 rad/s here, near the hull ceiling of 2.7. A
 * course carried on the client instead would run away from the hull and leave
 * it swinging long after the player let go.
 */
export const HEADING_LEAD_RADIANS = 0.5;

/**
 * Ticks of "aim at the nose you already have" sent when a turn key comes up. A
 * zero vector keeps the previous target, so without this the hull would coast
 * the whole lead angle after every turn; pointing the request at the current
 * nose is what actually brakes the spin.
 */
export const HELM_STOP_TICKS = 5;

/**
 * How far *behind* the last seen nose the braking request points. The client
 * only ever sees a course that is a network hop old, so aiming at it exactly
 * lets the hull drift on; a small counter-angle cancels that lag.
 */
export const HELM_STOP_COUNTER_RADIANS = 0.12;

export interface HeadingDrive {
  /** The course being asked for, in radians. */
  readonly heading: number;
  /** What goes on the wire: full thrust, a turning nudge, or a dead stop. */
  readonly vector: ControlVector;
}

/**
 * One tick of the keyboard helm, shaped like a tank: the turn keys spin the
 * hull whether or not the engine is on, and the request is always anchored to
 * the authoritative nose, so releasing a key stops the turn instead of letting
 * a stale course drag the hull onwards.
 */
export function advanceHeadingDrive(
  heading: number,
  keys: ReadonlySet<string>,
  options: {
    /** Direction of the turn being braked: -1, 0 or 1. */
    readonly stopping?: -1 | 0 | 1;
    readonly lead?: number;
  } = {}
): HeadingDrive {
  const { stopping = 0, lead = HEADING_LEAD_RADIANS } = options;
  const throttling = keys.has(THROTTLE_KEY) && !keys.has(BRAKE_KEY);
  const turn = Number(keys.has(TURN_RIGHT_KEY)) - Number(keys.has(TURN_LEFT_KEY));
  if (turn === 0 && !throttling && stopping === 0) {
    return { heading, vector: { x: 0, y: 0 } };
  }
  const target =
    turn === 0 ? heading - stopping * HELM_STOP_COUNTER_RADIANS : heading + turn * lead;
  const thrust = throttling ? 1 : ROTATE_IN_PLACE_THROTTLE;
  return {
    heading: target,
    vector: { x: Math.cos(target) * thrust, y: Math.sin(target) * thrust }
  };
}

/** Which way the helm is turning right now: -1, 0 or 1. */
export function turnDirection(keys: ReadonlySet<string>): -1 | 0 | 1 {
  if (keys.has(TURN_RIGHT_KEY) === keys.has(TURN_LEFT_KEY)) return 0;
  return keys.has(TURN_RIGHT_KEY) ? 1 : -1;
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
