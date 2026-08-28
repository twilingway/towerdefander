import { useEffect, useRef } from "react";

import {
  MG_FIRE_KEY,
  PILOT_HELM_KEYS,
  PILOT_KEYS,
  TURRET_FIRE_KEY,
  advanceHeadingDrive,
  getTurretKeyboardVector,
  toHelmKeys
} from "../../pilotKeyboard.js";
import type { RoleControls } from "./useRoleControls.js";

interface PilotKeyboardOptions {
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
  controlsEnabled,
  heading,
  pilot,
  gunner
}: PilotKeyboardOptions): void {
  const headingReference = useRef(0);
  const authoritativeHeadingReference = useRef(heading ?? 0);
  authoritativeHeadingReference.current = heading ?? authoritativeHeadingReference.current;
  const controlsReference = useRef({ pilot, gunner });
  controlsReference.current = { pilot, gunner };
  const ownsTurret = gunner !== undefined;
  const enabledReference = useRef(controlsEnabled);
  enabledReference.current = controlsEnabled;

  useEffect(() => {
    if (!active) return;
    const keys = new Set<string>();
    // Without a turret half the arrows steer, so they reseat the course too.
    const helmKeys = ownsTurret
      ? PILOT_HELM_KEYS
      : [...PILOT_HELM_KEYS, "ArrowUp", "ArrowLeft", "ArrowRight"];
    let lastTickMs = performance.now();

    function onKeyDown(event: KeyboardEvent): void {
      if (!PILOT_KEYS.includes(event.code)) return;
      event.preventDefault();
      if (event.repeat) return;
      // The first helm key after a pause picks the course up from the nose, so
      // the hull never snaps back to a bearing the player has since left with
      // the stick.
      if (helmKeys.includes(event.code) && !helmKeys.some((key) => keys.has(key))) {
        headingReference.current = authoritativeHeadingReference.current;
      }
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

    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsedSeconds = (now - lastTickMs) / 1000;
      lastTickMs = now;
      if (!enabledReference.current || keys.size === 0) return;
      const helm = ownsTurret ? keys : toHelmKeys(keys);
      const drive = advanceHeadingDrive(headingReference.current, helm, elapsedSeconds);
      headingReference.current = drive.heading;
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
