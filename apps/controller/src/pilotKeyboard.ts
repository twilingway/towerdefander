import type { HelmTuning } from "@spaceship-defender/protocol";

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
 * Ticks of braking request sent when a turn key comes up. A zero vector keeps
 * the previous target, so without this the hull would coast the whole lead
 * angle after every turn.
 */
export const HELM_STOP_TICKS = 5;

/**
 * Matches `headingAngularBrakingPerSecondSquared` in the simulation config. The
 * client cannot depend on game-core, so the braking rate is mirrored here to
 * predict where a spin comes to rest.
 */
export const HULL_ANGULAR_BRAKING_PER_SECOND_SQUARED = (13 * Math.PI) / 5;

/**
 * Where the hull will stop on its own, in radians from where it is now, given
 * how fast it is turning. Aiming the release exactly here is what removes both
 * the coast past the target and the swing back to it.
 */
export function coastToStopRadians(
  angularVelocity: number,
  /**
   * Seconds the request needs to reach the hull: one authoritative step plus
   * the measured round trip. The hull keeps turning across that window, so the
   * prediction has to include it or the spin stops short of where it lands.
   */
  latencySeconds = 0,
  braking = HULL_ANGULAR_BRAKING_PER_SECOND_SQUARED
): number {
  const stopping = (angularVelocity * angularVelocity) / (2 * braking);
  return Math.sign(angularVelocity) * (stopping + Math.abs(angularVelocity) * latencySeconds);
}

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
    /** True while a released turn is still being braked. */
    readonly stopping?: boolean;
    /** Where the hull would coast to a halt, in radians from the nose. */
    readonly coastRadians?: number;
    /** Feel from the active preset; the built-ins stand in until it arrives. */
    readonly tuning?: HelmTuning | undefined;
  } = {}
): HeadingDrive {
  const { stopping = false, coastRadians = 0, tuning } = options;
  const lead = tuning?.headingLeadRadians ?? HEADING_LEAD_RADIANS;
  const dampening = tuning?.stopDampening ?? 1;
  const nudge = tuning?.rotateInPlaceThrottle ?? ROTATE_IN_PLACE_THROTTLE;
  const throttling = keys.has(THROTTLE_KEY) && !keys.has(BRAKE_KEY);
  const turn = Number(keys.has(TURN_RIGHT_KEY)) - Number(keys.has(TURN_LEFT_KEY));

  if (tuning?.scheme === "absolute") {
    // The twin-stick shape: the keys name a direction in the world and the hull
    // follows it, so there is no course to carry and nothing to brake.
    return { heading, vector: getKeyboardVector(keys) };
  }

  if (turn === 0 && !throttling && !stopping) {
    return { heading, vector: { x: 0, y: 0 } };
  }
  // Braking aims at the resting point rather than at the nose: aiming short
  // rocks the hull back, aiming at a stale course lets it drift on.
  const target = turn === 0 ? heading + coastRadians * dampening : heading + turn * lead;
  const thrust = throttling ? 1 : nudge;
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
