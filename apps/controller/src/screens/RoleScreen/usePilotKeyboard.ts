import { useEffect, useRef } from "react";

import { getKeyboardVector } from "../../controlInput.js";
import {
  MG_FIRE_KEY,
  PILOT_KEYS,
  TURRET_FIRE_KEY,
  getHelmIntent,
  getTurretKeyboardVector,
  toHelmKeys
} from "../../pilotKeyboard.js";
import type { PublicHelmView } from "@spaceship-defender/protocol";

import type { RoleControls } from "./useRoleControls.js";

interface PilotKeyboardOptions {
  /** Helm feel from the active preset, or undefined before the run starts. */
  readonly tuning?: PublicHelmView | undefined;
  /** False for a seat that is not flying, so the helm keys stay unbound. */
  readonly active?: boolean;
  readonly controlsEnabled: boolean;
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
  tuning,
  controlsEnabled,
  pilot,
  gunner
}: PilotKeyboardOptions): void {
  const tuningReference = useRef(tuning);
  tuningReference.current = tuning;
  const controlsReference = useRef({ pilot, gunner });
  controlsReference.current = { pilot, gunner };
  const ownsTurret = gunner !== undefined;
  const enabledReference = useRef(controlsEnabled);
  enabledReference.current = controlsEnabled;

  useEffect(() => {
    if (!active) return;
    const keys = new Set<string>();
    // Without a turret half the arrows double as helm keys.

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

    let wasIdle = true;
    const timer = window.setInterval(() => {
      if (!enabledReference.current) return;
      const helm = ownsTurret ? keys : toHelmKeys(keys);
      if (tuningReference.current?.scheme === "absolute") {
        // The twin-stick shape still names a bearing in the world, so it keeps
        // the old drive; only the tank helm moved to a spin.
        if (keys.size === 0 && wasIdle) return;
        wasIdle = keys.size === 0;
        controlsReference.current.pilot.updateAim(getKeyboardVector(helm));
        controlsReference.current.gunner?.updateAim(getTurretKeyboardVector(keys));
        return;
      }
      const intent = getHelmIntent(helm);
      const idle = keys.size === 0 && intent.turn === 0 && intent.thrust === 0;
      // The first idle tick still goes out - that one is the request to stop -
      // and after it the seat falls quiet until something is pressed again.
      if (idle && wasIdle) return;
      wasIdle = idle;
      controlsReference.current.pilot.updateHelm(intent);
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
