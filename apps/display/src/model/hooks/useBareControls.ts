import { useEffect, useRef } from "react";

import type { SoloCockpitControls } from "./useSoloCockpit.js";

/**
 * Flying with no interface at all.
 *
 * The switch that takes React off the screen also takes the sticks with it, and
 * a ship standing still measures nothing: the whole question is what a moving
 * picture costs. So the canvas itself becomes the control - drag on the left
 * half to fly, on the right to aim and fire - through the same handlers the
 * sticks call, so the ship is flown the same way and only the drawing of the
 * sticks is gone.
 *
 * Listeners on the element, not on a component: this exists precisely for the
 * measurement where nothing is rendering.
 */

/** How far a drag has to travel for full deflection, in pixels. */
const FULL_THROW_PX = 90;
/** Below this the drag is a tap, and a tap is not a course. */
const DEADZONE_PX = 6;

interface Drag {
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  readonly aiming: boolean;
}

export function useBareControls(
  host: React.RefObject<HTMLElement | null>,
  controls: SoloCockpitControls,
  enabled: boolean
): void {
  const latest = useRef(controls);
  latest.current = controls;

  useEffect(() => {
    const element = host.current;
    if (!enabled || element === null) return undefined;

    let drag: Drag | undefined;

    const release = (): void => {
      if (drag === undefined) return;
      if (drag.aiming) {
        latest.current.onAimRelease();
        latest.current.onCannonFromStick(false);
      } else {
        latest.current.onDriveRelease();
      }
      drag = undefined;
    };

    const onDown = (event: PointerEvent): void => {
      if (drag !== undefined) return;
      // The panel is still on screen in this mode, and its switches are not a
      // course order.
      const target = event.target;
      if (target instanceof Element && target.closest(".diagnostics-panel") !== null) return;
      const bounds = element.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        aiming: event.clientX - bounds.left > bounds.width / 2
      };
      element.setPointerCapture(event.pointerId);
      // A press on the aiming half is also the trigger, the way the aim stick
      // itself holds the cannon.
      if (drag.aiming) latest.current.onCannonFromStick(true);
      event.preventDefault();
    };

    const onMove = (event: PointerEvent): void => {
      const held = drag;
      if (held?.pointerId !== event.pointerId) return;
      const dx = event.clientX - held.originX;
      const dy = event.clientY - held.originY;
      const distance = Math.hypot(dx, dy);
      if (distance < DEADZONE_PX) return;
      const strength = Math.min(1, distance / FULL_THROW_PX);
      const vector = { x: dx / distance, y: dy / distance };
      if (held.aiming) latest.current.onAim(vector, strength);
      else latest.current.onDrive(vector, strength);
      event.preventDefault();
    };

    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", release);
    element.addEventListener("pointercancel", release);
    element.addEventListener("lostpointercapture", release);
    return () => {
      release();
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", release);
      element.removeEventListener("pointercancel", release);
      element.removeEventListener("lostpointercapture", release);
    };
  }, [enabled, host]);
}
