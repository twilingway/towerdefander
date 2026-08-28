import { useEffect, useRef } from "react";

import {
  HELM_STOP_TICKS,
  MG_FIRE_KEY,
  PILOT_KEYS,
  TURRET_FIRE_KEY,
  advanceHeadingDrive,
  getTurretKeyboardVector,
  turnDirection,
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
    let stoppingTurn: -1 | 0 | 1 = 0;
    const timer = window.setInterval(() => {
      if (!enabledReference.current) return;
      const helm = ownsTurret ? keys : toHelmKeys(keys);
      const turn = turnDirection(helm);
      if (turn !== 0) {
        stopTicks = HELM_STOP_TICKS;
        stoppingTurn = turn;
      } else if (stopTicks > 0) {
        stopTicks -= 1;
      }
      if (keys.size === 0 && stopTicks === 0) return;
      const drive = advanceHeadingDrive(authoritativeHeadingReference.current, helm, {
        stopping: stopTicks > 0 ? stoppingTurn : 0
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
