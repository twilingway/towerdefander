import { useEffect } from "react";

import type { SoloCockpitControls } from "./hooks/useSoloCockpit.js";

/** What a dev build hangs on `window`; nothing in the app reads it. */
export interface DevCockpitControls {
  /** Tank helm: spin the hull, push along the nose. Both -1..1. */
  readonly helm: (turn: number, thrust: number) => void;
  readonly helmRelease: () => void;
  /** Aim vector in the stick's own frame, plus how far the stick is pushed. */
  readonly aim: (x: number, y: number, strength?: number) => void;
  readonly aimRelease: () => void;
  readonly cannon: (held: boolean) => void;
  readonly machineGun: (held: boolean) => void;
}

/**
 * The cockpit's own orders, reachable from a script, in a dev build only.
 *
 * The cockpit is built for fingers, and that makes it hostile to automation:
 * its triggers call `setPointerCapture` on the pointer that pressed them, which
 * throws on a synthetic one and aborts the handler before the gun ever fires.
 * A browser session could fly the ship and turn the turret and still not pull
 * the trigger - which is exactly what a check of the muzzle flash needs.
 *
 * So the same handlers the sticks drive are published under one name, the way
 * the camera already publishes its slice for the viewport spec. Two things keep
 * this honest: it is gated on `import.meta.env.DEV`, so a production bundle
 * drops the whole block as dead code, and it adds no path of its own - every
 * order still goes through `useSoloCockpit` to the server as an ordinary
 * intent, so a script cannot ask the ship for anything a finger could not.
 */
export function useDevCockpitControls(controls: SoloCockpitControls, active: boolean): void {
  useEffect(() => {
    if (!import.meta.env.DEV || !active) return undefined;
    const api: DevCockpitControls = {
      helm: (turn, thrust) => {
        controls.onHelm({ turn, thrust });
      },
      helmRelease: () => {
        controls.onHelmRelease();
      },
      aim: (x, y, strength = 1) => {
        controls.onAim({ x, y }, strength);
      },
      aimRelease: () => {
        controls.onAimRelease();
      },
      cannon: (held) => {
        controls.onCannonFromTrigger(held);
      },
      machineGun: (held) => {
        controls.onMachineGunHold(held);
      }
    };
    // A literal key, and unpublished by assignment rather than `delete`: the
    // name is part of the contract a script types out, so it is written out.
    const host = globalThis as { __spaceshipDevControls?: DevCockpitControls | undefined };
    host.__spaceshipDevControls = api;
    return () => {
      host.__spaceshipDevControls = undefined;
    };
  }, [controls, active]);
}
