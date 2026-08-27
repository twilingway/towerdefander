import { useEffect, useRef } from "react";

import {
  SOLO_CANNON_FIRE_KEY,
  SOLO_HELM_KEYS,
  SOLO_KEYS,
  SOLO_MG_FIRE_KEY,
  advanceHeadingDrive,
  getTurretKeyboardVector
} from "../../soloKeyboard.js";
import type { RoleControls } from "./useRoleControls.js";

interface SoloKeyboardOptions {
  readonly controlsEnabled: boolean;
  /** The authoritative hull heading, so a fresh burn starts where the nose is. */
  readonly heading: number | undefined;
  readonly pilot: RoleControls;
  readonly gunner: RoleControls;
}

const TICK_MS = 25;

/**
 * The desktop half of the solo panel. One player drives both systems, so the
 * keyboard is split by hand rather than shared: WASD and Space fly and fire the
 * nose, the arrows and their own key work the turret.
 */
export function useSoloKeyboard({
  controlsEnabled,
  heading,
  pilot,
  gunner
}: SoloKeyboardOptions): void {
  const headingReference = useRef(0);
  const authoritativeHeadingReference = useRef(heading ?? 0);
  authoritativeHeadingReference.current = heading ?? authoritativeHeadingReference.current;
  const controlsReference = useRef({ pilot, gunner });
  controlsReference.current = { pilot, gunner };
  const enabledReference = useRef(controlsEnabled);
  enabledReference.current = controlsEnabled;

  useEffect(() => {
    const keys = new Set<string>();
    let lastTickMs = performance.now();

    function onKeyDown(event: KeyboardEvent): void {
      if (!SOLO_KEYS.includes(event.code)) return;
      event.preventDefault();
      if (event.repeat) return;
      // The first helm key after a pause picks the course up from the nose, so
      // the hull never snaps back to a bearing the player has since left with
      // the stick.
      if (SOLO_HELM_KEYS.includes(event.code) && !SOLO_HELM_KEYS.some((key) => keys.has(key))) {
        headingReference.current = authoritativeHeadingReference.current;
      }
      keys.add(event.code);
      if (event.code === SOLO_MG_FIRE_KEY) controlsReference.current.pilot.beginFire();
      if (event.code === SOLO_CANNON_FIRE_KEY) controlsReference.current.gunner.beginFire();
    }

    function onKeyUp(event: KeyboardEvent): void {
      if (!SOLO_KEYS.includes(event.code)) return;
      keys.delete(event.code);
      if (event.code === SOLO_MG_FIRE_KEY) controlsReference.current.pilot.endFire();
      if (event.code === SOLO_CANNON_FIRE_KEY) controlsReference.current.gunner.endFire();
    }

    function neutralize(): void {
      keys.clear();
      controlsReference.current.pilot.cancelFire();
      controlsReference.current.gunner.cancelFire();
      controlsReference.current.pilot.updateAim({ x: 0, y: 0 });
    }

    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsedSeconds = (now - lastTickMs) / 1000;
      lastTickMs = now;
      if (!enabledReference.current || keys.size === 0) return;
      const drive = advanceHeadingDrive(headingReference.current, keys, elapsedSeconds);
      headingReference.current = drive.heading;
      controlsReference.current.pilot.updateAim(drive.vector);
      controlsReference.current.gunner.updateAim(getTurretKeyboardVector(keys));
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
  }, []);
}
