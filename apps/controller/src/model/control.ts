import type { ControlVector } from "../controlInput.js";

/** What one controller sends per tick, whatever role is driving it. */
export interface ControlState {
  readonly vector: ControlVector;
  readonly firing: boolean;
  readonly active: boolean;
  readonly mgFiring: boolean;
  /**
   * Tank helm: the requested spin and the push along the nose. Null while the
   * seat names a bearing instead - a stick, or the absolute scheme - so those
   * commands go out exactly as they always did.
   */
  readonly turn: number | null;
  readonly thrust: number | null;
}

export const NEUTRAL_CONTROL: ControlState = {
  vector: { x: 0, y: 0 },
  firing: false,
  active: false,
  mgFiring: false,
  turn: null,
  thrust: null
};

/** Gunner and shield aim keeps a moment of grace so a slip does not snap back. */
export const AIM_RELEASE_DELAY_MS = 60;
