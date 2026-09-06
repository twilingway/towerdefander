import { useEffect, useRef } from "react";

import type { ControlVector } from "@spaceship-defender/client-shared";

/** What the keys and the mouse drive, once they have been read. */
export interface CockpitKeyboardTargets {
  readonly onDrive: (vector: ControlVector, strength: number) => void;
  readonly onDriveRelease: () => void;
  readonly onAim: (vector: ControlVector, strength: number) => void;
  readonly onAimRelease: () => void;
  readonly onMachineGunHold: (held: boolean) => void;
  readonly onCannonFromTrigger: (held: boolean) => void;
}

export interface CockpitKeyboardOptions extends CockpitKeyboardTargets {
  readonly enabled: boolean;
  /** Where the ship is on screen, so the mouse can be read as a bearing. */
  readonly shipScreenPoint: () => { readonly x: number; readonly y: number } | null;
}

/** WASD drives, the mouse aims, space and the left button fire. As in the lab. */
const DRIVE_KEYS: Record<string, { readonly x: number; readonly y: number }> = {
  KeyW: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }
};
const MG_KEY = "Space";
const CANNON_KEY = "Enter";

/**
 * Keyboard and mouse for the solo cockpit.
 *
 * The cockpit shipped with thumbs only, and the lab it was ported from has
 * always answered both — the same tank on a desk and in a hand. A shared screen
 * is very often a laptop, and the person testing balance on one has no thumbs
 * to give it.
 *
 * It drives the same handlers the sticks do, so nothing downstream learns where
 * an order came from: the aim path still resolves its traverse at send time,
 * and the dead zones still belong to the sticks that have them.
 */
export function useCockpitKeyboard({
  enabled,
  shipScreenPoint,
  onDrive,
  onDriveRelease,
  onAim,
  onAimRelease,
  onMachineGunHold,
  onCannonFromTrigger
}: CockpitKeyboardOptions): void {
  const targets = useRef<CockpitKeyboardTargets>({
    onDrive,
    onDriveRelease,
    onAim,
    onAimRelease,
    onMachineGunHold,
    onCannonFromTrigger
  });
  targets.current = {
    onDrive,
    onDriveRelease,
    onAim,
    onAimRelease,
    onMachineGunHold,
    onCannonFromTrigger
  };
  const shipPoint = useRef(shipScreenPoint);
  shipPoint.current = shipScreenPoint;

  useEffect(() => {
    if (!enabled) return;
    const held = new Set<string>();
    let aiming = false;

    function applyDrive(): void {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const key = DRIVE_KEYS[code];
        if (key === undefined) continue;
        x += key.x;
        y += key.y;
      }
      const length = Math.hypot(x, y);
      if (length === 0) {
        targets.current.onDriveRelease();
        return;
      }
      // Full throttle: a key is not a stick and has no half-press.
      targets.current.onDrive({ x: x / length, y: y / length }, 1);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.code === MG_KEY) {
        event.preventDefault();
        if (!event.repeat) targets.current.onMachineGunHold(true);
        return;
      }
      if (event.code === CANNON_KEY) {
        event.preventDefault();
        if (!event.repeat) targets.current.onCannonFromTrigger(true);
        return;
      }
      if (DRIVE_KEYS[event.code] === undefined) return;
      event.preventDefault();
      if (held.has(event.code)) return;
      held.add(event.code);
      applyDrive();
    }

    function onKeyUp(event: KeyboardEvent): void {
      if (event.code === MG_KEY) {
        targets.current.onMachineGunHold(false);
        return;
      }
      if (event.code === CANNON_KEY) {
        targets.current.onCannonFromTrigger(false);
        return;
      }
      if (!held.delete(event.code)) return;
      applyDrive();
    }

    function onPointerMove(event: PointerEvent): void {
      // Only a mouse: a finger on the glass belongs to the sticks, and reading
      // it here as well would make every touch aim at itself.
      if (event.pointerType !== "mouse") return;
      const ship = shipPoint.current();
      if (ship === null) return;
      const dx = event.clientX - ship.x;
      const dy = event.clientY - ship.y;
      const length = Math.hypot(dx, dy);
      if (length < 1) return;
      aiming = true;
      targets.current.onAim({ x: dx / length, y: dy / length }, 1);
    }

    function onPointerDown(event: PointerEvent): void {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      targets.current.onCannonFromTrigger(true);
    }

    function onPointerUp(event: PointerEvent): void {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      targets.current.onCannonFromTrigger(false);
    }

    function release(): void {
      held.clear();
      targets.current.onDriveRelease();
      targets.current.onMachineGunHold(false);
      targets.current.onCannonFromTrigger(false);
      if (aiming) {
        aiming = false;
        targets.current.onAimRelease();
      }
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === "hidden") release();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      release();
    };
  }, [enabled]);
}
