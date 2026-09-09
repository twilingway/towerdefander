import { describe, expect, it } from "vitest";

import { resolveShieldImpact, SHIELD_BLOCK_EFFECT, type ShieldPose } from "./shieldImpact.js";

const ROOM_CENTRE = { x: 500, y: 500 };
const RADIUS = 104;

/** What the room says: the geometry that actually blocked the shot. */
function world(active: boolean, arcHalfAngle = Math.PI / 4, angle = 0) {
  return {
    shieldRadius: RADIUS,
    shield: { active, angle, arcHalfAngle },
    spaceship: ROOM_CENTRE
  };
}

/** What the scene drew: the same shield, a patch behind. */
const DRAWN: ShieldPose = { centre: { x: 480, y: 500 }, bearing: -0.05 };

/** A shell one patch short of the barrier, flying straight at it. */
const INCOMING = {
  x: ROOM_CENTRE.x + RADIUS + 24,
  y: ROOM_CENTRE.y,
  velocity: { x: -700, y: 0 }
};

describe("deciding that the shield blocked a threat", () => {
  it("decides against the room and draws on the barrier the crew sees", () => {
    /*
     * The bug this exists for. The hull is drawn interpolated, a patch behind
     * the room, and at speed that is twenty units of offset; the shell, mean-
     * while, is drawn extrapolated forward. Deciding the block from that mixed
     * pair disagreed with the room about hits that had plainly happened. So the
     * decision uses the room's centre and bearing - and the splash still lands
     * on the drawn barrier, at the same angle across the sector.
     */
    const impact = resolveShieldImpact(INCOMING, world(true), DRAWN);
    expect(impact).toBeDefined();
    expect(impact?.offset).toBeCloseTo(0, 6);
    // On the drawn barrier: its centre, its bearing, the shield's radius.
    expect(impact?.x).toBeCloseTo(DRAWN.centre.x + Math.cos(DRAWN.bearing) * RADIUS, 6);
    expect(impact?.y).toBeCloseTo(DRAWN.centre.y + Math.sin(DRAWN.bearing) * RADIUS, 6);
    expect(
      Math.hypot((impact?.x ?? 0) - DRAWN.centre.x, (impact?.y ?? 0) - DRAWN.centre.y)
    ).toBeCloseTo(RADIUS, 6);
  });

  it("keeps a hit the drawn pose alone would have thrown away", () => {
    // A shot stopped near the edge of a sector the operator is sweeping. In the
    // room's frame it is inside; against a bearing a patch stale it reads as
    // outside, and that is a splash the crew watched not happen.
    const edge = Math.PI / 4 - 0.02;
    const shell = {
      x: ROOM_CENTRE.x + Math.cos(edge) * (RADIUS + 20),
      y: ROOM_CENTRE.y + Math.sin(edge) * (RADIUS + 20),
      velocity: { x: -700 * Math.cos(edge), y: -700 * Math.sin(edge) }
    };
    const sweeping: ShieldPose = { centre: ROOM_CENTRE, bearing: -0.09 };
    expect(resolveShieldImpact(shell, world(true), sweeping)).toBeDefined();
  });

  it("allows a shot a hair outside the sector, and nothing further", () => {
    // The room settles the block a tick before the display sees it, and the
    // sector turns in that tick - so the edge carries a few degrees of slack.
    // Wide enough to cover the gap, narrow enough that the shield still ends
    // where it ends.
    const just = (radians: number) => {
      const shell = {
        x: ROOM_CENTRE.x + Math.cos(radians) * (RADIUS + 20),
        y: ROOM_CENTRE.y + Math.sin(radians) * (RADIUS + 20),
        velocity: { x: -700 * Math.cos(radians), y: -700 * Math.sin(radians) }
      };
      return resolveShieldImpact(shell, world(true), { centre: ROOM_CENTRE, bearing: 0 });
    };
    expect(just(Math.PI / 4 + 0.04)).toBeDefined();
    expect(just(Math.PI / 4 + 0.4)).toBeUndefined();
  });

  it("says nothing while the sector is down", () => {
    /*
     * The gate this exists for. A shell removed with the shield lowered was
     * stopped by the hull, or expired, or flew out of the arena - and the same
     * geometry would happily report a contact for all three, because the circle
     * the shell crosses is there whether or not anything is holding it.
     */
    expect(resolveShieldImpact(INCOMING, world(false), DRAWN)).toBeUndefined();
  });

  it("says nothing when the scene has not drawn the shield", () => {
    expect(resolveShieldImpact(INCOMING, world(true), undefined)).toBeUndefined();
  });

  it("says nothing for a threat that is not moving", () => {
    // Without a course the last known point is all there is, and that point is
    // behind the barrier: the splash would appear inside the ship's own bubble.
    expect(
      resolveShieldImpact({ ...INCOMING, velocity: { x: 0, y: 0 } }, world(true), DRAWN)
    ).toBeUndefined();
  });

  it("says nothing for a threat too far away to have reached the arc", () => {
    expect(
      resolveShieldImpact({ ...INCOMING, x: ROOM_CENTRE.x + RADIUS + 900 }, world(true), DRAWN)
    ).toBeUndefined();
  });

  it("follows the sector the modules left, not a fixed one", () => {
    // Straight at the ship's flank: outside the default quarter-circle, inside
    // a sector the crew has widened.
    const flank = {
      x: ROOM_CENTRE.x + RADIUS * Math.cos(0.9),
      y: ROOM_CENTRE.y + RADIUS * Math.sin(0.9) + 30,
      velocity: { x: 0, y: -700 }
    };
    expect(resolveShieldImpact(flank, world(true), DRAWN)).toBeUndefined();
    expect(resolveShieldImpact(flank, world(true, Math.PI / 2), DRAWN)).toBeDefined();
  });

  it("names an effect the catalogue actually bakes", () => {
    // A typo here is a splash that silently never plays: the burst layer looks
    // the id up and gives up quietly when it is unknown.
    expect(SHIELD_BLOCK_EFFECT).toBe("shield-impact");
  });
});
