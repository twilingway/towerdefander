import { useEffect, useRef } from "react";

import type { ControlVector } from "@spaceship-defender/client-shared";

/** What the keys and the mouse drive, once they have been read. */
export interface CockpitKeyboardTargets {
  readonly onHelm: (intent: { readonly turn: number; readonly thrust: number }) => void;
  readonly onHelmRelease: () => void;
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

/**
 * A tank helm, which is what the lab has and what a keyboard wants.
 *
 * W is not north. It is forward along the nose, and A and D spin the hull on
 * its own axis rather than pointing it at a compass bearing — the difference
 * between driving a tank and dragging a cursor. The core has carried the
 * intent for this since `helm-turn-intent`; the cockpit simply never sent it
 * and shipped the stick's absolute vector instead.
 */
const HELM_KEYS: Record<string, { readonly turn: number; readonly thrust: number }> = {
  KeyW: { turn: 0, thrust: 1 },
  KeyS: { turn: 0, thrust: -1 },
  KeyA: { turn: -1, thrust: 0 },
  KeyD: { turn: 1, thrust: 0 },
  ArrowUp: { turn: 0, thrust: 1 },
  ArrowDown: { turn: 0, thrust: -1 },
  ArrowLeft: { turn: -1, thrust: 0 },
  ArrowRight: { turn: 1, thrust: 0 }
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
  onHelm,
  onHelmRelease,
  onAim,
  onAimRelease,
  onMachineGunHold,
  onCannonFromTrigger
}: CockpitKeyboardOptions): void {
  const targets = useRef<CockpitKeyboardTargets>({
    onHelm,
    onHelmRelease,
    onAim,
    onAimRelease,
    onMachineGunHold,
    onCannonFromTrigger
  });
  targets.current = {
    onHelm,
    onHelmRelease,
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

    function applyHelm(): void {
      let turn = 0;
      let thrust = 0;
      for (const code of held) {
        const key = HELM_KEYS[code];
        if (key === undefined) continue;
        turn += key.turn;
        thrust += key.thrust;
      }
      if (turn === 0 && thrust === 0) {
        targets.current.onHelmRelease();
        return;
      }
      // A key has no half-press: clamped rather than normalised, so holding W
      // and D asks for full of each instead of seven tenths.
      targets.current.onHelm({
        turn: Math.max(-1, Math.min(1, turn)),
        thrust: Math.max(-1, Math.min(1, thrust))
      });
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
      if (HELM_KEYS[event.code] === undefined) return;
      event.preventDefault();
      if (held.has(event.code)) return;
      held.add(event.code);
      applyHelm();
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
      applyHelm();
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
      targets.current.onHelmRelease();
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
