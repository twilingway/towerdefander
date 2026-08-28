import { useEffect, useRef } from "react";

import {
  HELM_STOP_TICKS,
  MG_FIRE_KEY,
  PILOT_KEYS,
  TURRET_FIRE_KEY,
  advanceHeadingDrive,
  coastToStopRadians,
  getTurretKeyboardVector,
  toHelmKeys,
  turnDirection
} from "../../pilotKeyboard.js";
import type { PublicHelmView } from "@spaceship-defender/protocol";

import type { RoleControls } from "./useRoleControls.js";

/** One authoritative step; the request cannot land sooner than the next one. */
const STEP_SECONDS = 0.05;

interface PilotKeyboardOptions {
  /** Server-measured round trip, so the stop prediction can allow for it. */
  readonly latencyMs?: number | undefined;
  /** Helm feel from the active preset, or undefined before the run starts. */
  readonly tuning?: PublicHelmView | undefined;
  /** False for a seat that is not flying, so the helm keys stay unbound. */
  readonly active?: boolean;
  readonly controlsEnabled: boolean;
  /** The authoritative hull heading, so a fresh burn starts where the nose is. */
  readonly heading: number | undefined;
  readonly pilot: RoleControls;
  /**
   * The turret half, present only when one player owns both systems. Without it
   * the arrow keys join the helm, so a pilot on a desktop can steer with either
   * hand.
   */
  readonly gunner?: RoleControls | undefined;
}

const TICK_MS = 25;

/**
 * The desktop helm. WASD and Space fly the hull and fire the nose in every
 * crew size; when the same player also mans the turret, the arrows and their
 * own key drive it instead of doubling as helm keys.
 */
export function usePilotKeyboard({
  active = true,
  latencyMs,
  tuning,
  controlsEnabled,
  heading,
  pilot,
  gunner
}: PilotKeyboardOptions): void {
  const authoritativeHeadingReference = useRef(heading ?? 0);
  const angularVelocityReference = useRef(0);
  const headingSampleReference = useRef({ heading: heading ?? 0, atMs: 0 });
  if (heading !== undefined && heading !== authoritativeHeadingReference.current) {
    // How fast the hull is actually turning, measured from the authoritative
    // course: the client needs it to know where a released spin will stop.
    const now = performance.now();
    const sample = headingSampleReference.current;
    const elapsedSeconds = (now - sample.atMs) / 1000;
    if (elapsedSeconds > 0 && elapsedSeconds < 0.5) {
      const delta = shortestAngle(heading - sample.heading);
      angularVelocityReference.current = delta / elapsedSeconds;
    }
    headingSampleReference.current = { heading, atMs: now };
    authoritativeHeadingReference.current = heading;
  }
  const tuningReference = useRef(tuning);
  tuningReference.current = tuning;
  const latencyReference = useRef(latencyMs);
  latencyReference.current = latencyMs;
  const controlsReference = useRef({ pilot, gunner });
  controlsReference.current = { pilot, gunner };
  const ownsTurret = gunner !== undefined;
  const enabledReference = useRef(controlsEnabled);
  enabledReference.current = controlsEnabled;

  useEffect(() => {
    if (!active) return;
    const keys = new Set<string>();
    // Without a turret half the arrows steer, so they reseat the course too.

    function onKeyDown(event: KeyboardEvent): void {
      if (!PILOT_KEYS.includes(event.code)) return;
      event.preventDefault();
      if (event.repeat) return;
      keys.add(event.code);
      if (event.code === MG_FIRE_KEY) controlsReference.current.pilot.beginFire();
      if (event.code === TURRET_FIRE_KEY) controlsReference.current.gunner?.beginFire();
    }

    function onKeyUp(event: KeyboardEvent): void {
      if (!PILOT_KEYS.includes(event.code)) return;
      keys.delete(event.code);
      if (event.code === MG_FIRE_KEY) controlsReference.current.pilot.endFire();
      if (event.code === TURRET_FIRE_KEY) controlsReference.current.gunner?.endFire();
    }

    function neutralize(): void {
      keys.clear();
      controlsReference.current.pilot.cancelFire();
      controlsReference.current.gunner?.cancelFire();
      controlsReference.current.pilot.updateAim({ x: 0, y: 0 });
    }

    let stopTicks = 0;
    let stopHeading = 0;
    const timer = window.setInterval(() => {
      if (!enabledReference.current) return;
      const helm = ownsTurret ? keys : toHelmKeys(keys);
      const nose = authoritativeHeadingReference.current;
      if (turnDirection(helm) !== 0) {
        stopTicks = HELM_STOP_TICKS;
        // Fixed the moment the key comes up, then held: recomputing it from the
        // nose every tick keeps the target ahead of the hull and the spin feeds
        // itself instead of stopping.
        stopHeading =
          nose +
          coastToStopRadians(
            angularVelocityReference.current,
            STEP_SECONDS + Math.max(0, latencyReference.current ?? 0) / 1000,
            // The run's own braking rate: predicting against a different one
            // overshoots the target and swings the hull back to it.
            tuningReference.current?.hullAngularBrakingPerSecondSquared
          );
      } else if (stopTicks > 0) {
        stopTicks -= 1;
      }
      if (keys.size === 0 && stopTicks === 0) return;
      const drive = advanceHeadingDrive(nose, helm, {
        stopping: stopTicks > 0,
        coastRadians: stopHeading - nose,
        tuning: tuningReference.current
      });
      controlsReference.current.pilot.updateAim(drive.vector);
      controlsReference.current.gunner?.updateAim(getTurretKeyboardVector(keys));
    }, TICK_MS);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", neutralize);
    document.addEventListener("visibilitychange", neutralize);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", neutralize);
      document.removeEventListener("visibilitychange", neutralize);
    };
  }, [active, ownsTurret]);
}

/** Shortest signed distance between two angles, so a wrap does not read huge. */
function shortestAngle(delta: number): number {
  return ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
}
