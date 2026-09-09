import { PATCH_INTERVAL_MS, type DisplayGameSnapshot } from "@spaceship-defender/protocol";

import { getShieldImpact, type Point, type ShieldImpact } from "../spaceshipViewModel.js";

/** The splash a blocked shell leaves on the barrier. */
export const SHIELD_BLOCK_EFFECT = "shield-impact";

/**
 * The shield as the scene drew it this frame.
 *
 * From the drawn pose rather than the snapshot for the same reason the muzzle
 * flash is: the hull on screen is interpolated, roughly a patch behind the room,
 * so a contact placed from the snapshot's centre sits behind the barrier the
 * crew can see.
 */
export interface ShieldPose {
  readonly centre: Point;
  readonly bearing: number;
}

/**
 * How far a blocked shell may have travelled since its last drawn point.
 *
 * The room removes it at the instant of impact, so the newest point the display
 * ever had is up to a patch short of the arc; two of them is slack for a patch
 * that arrived late, without letting a shell that expired somewhere else claim a
 * hit whose course happens to pass through the sector.
 */
const IMPACT_WINDOW_MS = PATCH_INTERVAL_MS * 2;

/**
 * Whether the raised sector is what stopped this threat, and where.
 *
 * The room does not say. A blocked shell simply stops being in the snapshot and
 * the shield's charge moves, and both of those are already here - so the display
 * decides it from the shell's own course, which is the one thing about a shell
 * that is not a guess.
 *
 * Deliberately silent in two cases. A sector that could not pay drops instead of
 * blocking and the shell flies on, so there is no contact to draw - and by then
 * the shield is down, which is what the crew should be looking at. And a threat
 * with no velocity on the wire is not followed at all rather than placed at its
 * last point, because that point is inside the barrier.
 */
export function resolveShieldImpact(
  threat: {
    readonly x: number;
    readonly y: number;
    readonly velocity: { readonly x: number; readonly y: number };
  },
  snapshot: Pick<DisplayGameSnapshot, "shield" | "shieldRadius">,
  pose: ShieldPose | undefined
): ShieldImpact | undefined {
  if (pose === undefined || !snapshot.shield.active) return undefined;
  const speed = Math.hypot(threat.velocity.x, threat.velocity.y);
  if (speed <= 0) return undefined;
  return getShieldImpact({
    centre: pose.centre,
    bearing: pose.bearing,
    radius: snapshot.shieldRadius,
    arcHalfAngle: snapshot.shield.arcHalfAngle,
    from: { x: threat.x, y: threat.y },
    velocityX: threat.velocity.x,
    velocityY: threat.velocity.y,
    reach: (speed * IMPACT_WINDOW_MS) / 1000
  });
}
