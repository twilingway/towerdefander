import { useEffect, useRef } from "react";

import { advanceAngularRate, advanceAngularTraverse } from "@spaceship-defender/game-core";

/**
 * Client-side prediction, for the two angles a thumb feels first.
 *
 * The shape of the problem is the oldest one in networked games: the screen
 * draws what the server said, and the server said it a ping ago. Here that is
 * compounded — the display also runs a playback buffer, so a hull turn shows up
 * after the input scheduler, the round trip, a server tick and the buffer, all
 * in a row.
 *
 * The cure is equally old and has three parts: predict your own ship locally,
 * reconcile against the authority when it answers, and interpolate everybody
 * else. The third is already here (`PlaybackClock`). This is the first two,
 * narrowed to heading and turret angle on purpose:
 *
 *   - they are what the hand notices, far more than position;
 *   - being wrong about an angle is harmless and self-correcting, while being
 *     wrong about a position walks the ship through a rock;
 *   - and they need no rewind-and-replay of a whole simulation, so this is a
 *     first step rather than a rewrite.
 *
 * What makes it legitimate is that the arithmetic is the SAME arithmetic: these
 * two functions are imported from `game-core`, the very ones the room steps
 * with. A prediction written twice is a prediction that drifts.
 */

export interface PredictionDrive {
  readonly hullAngularMaxSpeed: number;
  readonly hullAngularAcceleration: number;
  readonly hullAngularBraking: number;
  readonly turretAngularMaxSpeed: number;
  readonly turretAngularAcceleration: number;
  readonly turretAngularBraking: number;
}

export interface PredictionInputs {
  /** Requested spin in `[-1, 1]`, or null when the pilot named a bearing. */
  readonly hullTurn: number | null;
  /** The bearing the pilot's stick names, when it names one. */
  readonly hullTargetAngle: number | null;
  /** Requested traverse in `[-1, 1]`. Zero is an order: stop. */
  readonly turretTurn: number;
}

export interface PredictedAngles {
  readonly heading: number;
  readonly turretAngle: number;
}

/**
 * How fast a wrong guess is walked back onto the authoritative value.
 *
 * Not a snap: a snap is a visible jerk every time a packet lands, which is
 * worse to look at than the lag it fixes. Not a slow blend either — that leaves
 * the gun pointing somewhere the server does not agree with while shots come
 * out of it. Eight per second closes half the error in about ninety
 * milliseconds, which is under the eye's notice and over the wire's jitter.
 */
const RECONCILE_PER_SECOND = 8;
/** Past this the guess was not wrong, it was about a different run. */
const RESYNC_RADIANS = Math.PI / 2;

const TAU = Math.PI * 2;

function shortestArc(from: number, to: number): number {
  return ((((to - from + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

interface PredictedAxis {
  angle: number;
  angularVelocity: number;
}

export interface CockpitPredictionOptions {
  readonly enabled: boolean;
  readonly drive: PredictionDrive | undefined;
  /** The authoritative angles, as they arrive. */
  readonly authoritative: PredictedAngles | undefined;
  /** What this client last asked for; read every frame, never stale. */
  readonly readInputs: () => PredictionInputs;
  readonly onPredicted: (angles: PredictedAngles | undefined) => void;
}

export function useCockpitPrediction({
  enabled,
  drive,
  authoritative,
  readInputs,
  onPredicted
}: CockpitPredictionOptions): void {
  const driveReference = useRef(drive);
  driveReference.current = drive;
  const authoritativeReference = useRef(authoritative);
  authoritativeReference.current = authoritative;
  const readInputsReference = useRef(readInputs);
  readInputsReference.current = readInputs;
  const onPredictedReference = useRef(onPredicted);
  onPredictedReference.current = onPredicted;

  useEffect(() => {
    if (!enabled) {
      onPredictedReference.current(undefined);
      return;
    }
    let frame = 0;
    let previous = performance.now();
    let hull: PredictedAxis | null = null;
    let turret: PredictedAxis | null = null;

    function reconcile(axis: PredictedAxis, truth: number, seconds: number): void {
      const error = shortestArc(axis.angle, truth);
      if (Math.abs(error) > RESYNC_RADIANS) {
        // A gap this wide is not drift. Something reset — a rematch, a
        // reconnect, a hull the crew just bought — and easing across it would
        // spend a second lying about where the gun points.
        axis.angle = truth;
        axis.angularVelocity = 0;
        return;
      }
      axis.angle += error * Math.min(1, RECONCILE_PER_SECOND * seconds);
    }

    function step(now: number): void {
      frame = requestAnimationFrame(step);
      // Clamped: a tab that was in the background hands over a huge delta, and
      // spending it in one step throws the gun round the compass.
      const seconds = Math.min(0.1, Math.max(0, (now - previous) / 1000));
      previous = now;
      const config = driveReference.current;
      const truth = authoritativeReference.current;
      if (config === undefined || truth === undefined) {
        onPredictedReference.current(undefined);
        return;
      }
      hull ??= { angle: truth.heading, angularVelocity: 0 };
      turret ??= { angle: truth.turretAngle, angularVelocity: 0 };

      const inputs = readInputsReference.current();
      const hullConfig = {
        maxAngularSpeed: config.hullAngularMaxSpeed,
        angularAcceleration: config.hullAngularAcceleration,
        angularBraking: config.hullAngularBraking,
        secondsPerStep: seconds
      };
      const advancedHull =
        inputs.hullTurn === null
          ? advanceAngularTraverse(
              {
                angle: hull.angle,
                targetAngle: inputs.hullTargetAngle,
                angularVelocity: hull.angularVelocity
              },
              hullConfig
            )
          : advanceAngularRate(
              { angle: hull.angle, angularVelocity: hull.angularVelocity },
              inputs.hullTurn,
              hullConfig
            );
      hull.angle = advancedHull.angle;
      hull.angularVelocity = advancedHull.angularVelocity;

      const advancedTurret = advanceAngularRate(
        { angle: turret.angle, angularVelocity: turret.angularVelocity },
        inputs.turretTurn,
        {
          maxAngularSpeed: config.turretAngularMaxSpeed,
          angularAcceleration: config.turretAngularAcceleration,
          angularBraking: config.turretAngularBraking,
          secondsPerStep: seconds
        }
      );
      turret.angle = advancedTurret.angle;
      turret.angularVelocity = advancedTurret.angularVelocity;

      reconcile(hull, truth.heading, seconds);
      reconcile(turret, truth.turretAngle, seconds);
      onPredictedReference.current({ heading: hull.angle, turretAngle: turret.angle });
    }

    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      onPredictedReference.current(undefined);
    };
  }, [enabled]);
}
