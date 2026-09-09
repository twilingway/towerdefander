import { describe, expect, it } from "vitest";

import { resolveShieldImpact, SHIELD_BLOCK_EFFECT } from "./shieldImpact.js";

const CENTRE = { x: 500, y: 500 };
const RADIUS = 104;

function snapshot(active: boolean, arcHalfAngle = Math.PI / 4) {
  return {
    shieldRadius: RADIUS,
    shield: {
      active,
      angle: 0,
      arcHalfAngle,
      energy: 40,
      capacity: 100,
      rearmRequired: false
    }
  };
}

/** A shell one patch short of the barrier, flying straight at it. */
const INCOMING = {
  x: CENTRE.x + RADIUS + 24,
  y: CENTRE.y,
  velocity: { x: -700, y: 0 }
};

const POSE = { centre: CENTRE, bearing: 0 };

describe("deciding that the shield blocked a threat", () => {
  it("places the splash on the barrier", () => {
    const impact = resolveShieldImpact(INCOMING, snapshot(true), POSE);
    expect(impact).toBeDefined();
    expect(Math.hypot((impact?.x ?? 0) - CENTRE.x, (impact?.y ?? 0) - CENTRE.y)).toBeCloseTo(
      RADIUS,
      6
    );
  });

  it("says nothing while the sector is down", () => {
    /*
     * The gate this exists for. A shell removed with the shield lowered was
     * stopped by the hull, or expired, or flew out of the arena - and the same
     * geometry would happily report a contact for all three, because the circle
     * the shell crosses is there whether or not anything is holding it.
     */
    expect(resolveShieldImpact(INCOMING, snapshot(false), POSE)).toBeUndefined();
  });

  it("says nothing when the scene has not drawn the shield", () => {
    // No pose means the layer did not draw a barrier this frame, and a contact
    // has nowhere to go.
    expect(resolveShieldImpact(INCOMING, snapshot(true), undefined)).toBeUndefined();
  });

  it("says nothing for a threat that is not moving", () => {
    // Without a course the last known point is all there is, and that point is
    // behind the barrier: the splash would appear inside the ship's own bubble.
    expect(
      resolveShieldImpact({ ...INCOMING, velocity: { x: 0, y: 0 } }, snapshot(true), POSE)
    ).toBeUndefined();
  });

  it("follows the sector the modules left, not a fixed one", () => {
    // Straight at the ship's flank: outside the default quarter-circle, inside
    // a sector the crew has widened.
    const flank = {
      x: CENTRE.x + RADIUS * Math.cos(0.9),
      y: CENTRE.y + RADIUS * Math.sin(0.9) + 30,
      velocity: { x: 0, y: -700 }
    };
    expect(resolveShieldImpact(flank, snapshot(true), POSE)).toBeUndefined();
    expect(resolveShieldImpact(flank, snapshot(true, Math.PI / 2), POSE)).toBeDefined();
  });

  it("names an effect the catalogue actually bakes", () => {
    // A typo here is a splash that silently never plays: the burst layer looks
    // the id up and gives up quietly when it is unknown.
    expect(SHIELD_BLOCK_EFFECT).toBe("shield-impact");
  });
});
