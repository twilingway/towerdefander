import { getKeyboardVector, type ControlVector } from "./controlInput.js";

export const THROTTLE_KEY = "KeyW";
export const BRAKE_KEY = "KeyS";
export const TURN_LEFT_KEY = "KeyA";
export const TURN_RIGHT_KEY = "KeyD";
export const MG_FIRE_KEY = "Space";
export const TURRET_FIRE_KEY = "Enter";
export const TURRET_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;

export const PILOT_KEYS: readonly string[] = [
  THROTTLE_KEY,
  BRAKE_KEY,
  TURN_LEFT_KEY,
  TURN_RIGHT_KEY,
  MG_FIRE_KEY,
  TURRET_FIRE_KEY,
  ...TURRET_KEYS
];

export interface HelmIntent {
  /** -1 spins the hull left, 1 right, 0 asks it to stop turning. */
  readonly turn: -1 | 0 | 1;
  /** 1 burns along the nose, -1 backs up along it, 0 coasts. */
  readonly thrust: -1 | 0 | 1;
}

/**
 * One tick of the tank helm. No bearing is named and nothing is predicted:
 * the hull spins while a turn key is down and the simulation brakes it when
 * the key comes up, so latency cannot put the request behind the hull.
 */
export function getHelmIntent(keys: ReadonlySet<string>): HelmIntent {
  const forward = keys.has(THROTTLE_KEY);
  const back = keys.has(BRAKE_KEY);
  return { turn: turnDirection(keys), thrust: forward === back ? 0 : forward ? 1 : -1 };
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
