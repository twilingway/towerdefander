import { PATCH_INTERVAL_MS, type DisplayGameSnapshot } from "@spaceship-defender/protocol";

import { getShieldImpact, type Point, type ShieldImpact } from "../spaceshipViewModel.js";

/** The splash a blocked shell leaves on the barrier. */
export const SHIELD_BLOCK_EFFECT = "shield-impact";

/**
 * The shield as the scene drew it this frame.
 *
 * Only for placing the splash, never for deciding there was one: the hull on
 * screen is interpolated, roughly a patch behind the room, so a contact placed
 * from the snapshot's centre would sit behind the barrier the crew can see.
 */
export interface ShieldPose {
  readonly centre: Point;
  readonly bearing: number;
}

/**
 * How far a blocked shell may have travelled since its last authoritative
 * point.
 *
 * The room removes it at the instant of impact, so the newest point the display
 * was told about is up to a patch short of the arc, and the removal itself is
 * seen a patch later. Two of them covers that without letting a shell that
 * expired somewhere else claim a hit whose course happens to pass through the
 * sector.
 */
const IMPACT_WINDOW_MS = PATCH_INTERVAL_MS * 2;

/**
 * Slack on the sector's edge, in radians.
 *
 * The room decided the block at the instant of impact; the display is looking at
 * the tick after it. The sector turns at up to 13π/24 a second, which is about
 * three degrees of travel in that gap, and without the slack a shot stopped just
 * inside the edge is judged just outside it and leaves no mark. Small on
 * purpose: the sector's own half-angle is forty-five degrees, so this widens the
 * test by a few percent rather than blurring where the shield ends.
 */
const EDGE_SLACK_RADIANS = 0.06;

/**
 * The room's own geometry, which is what decides whether a shot was blocked.
 *
 * Narrower than the snapshot on purpose: these four numbers are the whole
 * input, and a test should not have to build a fight to state them.
 */
export interface ShieldImpactWorld {
  readonly shield: Pick<DisplayGameSnapshot["shield"], "active" | "angle" | "arcHalfAngle">;
  readonly shieldRadius: number;
  readonly spaceship: Point;
}

/**
 * Whether the raised sector is what stopped this threat, and where.
 *
 * The room does not say. A blocked shell simply stops being in the snapshot and
 * the shield's charge moves, and both of those are already here - so the display
 * decides it from the shell's own course, which is the one thing about a shell
 * that is not a guess.
 *
 * The decision is made entirely against the room's numbers: its hull centre, its
 * shield bearing, the shell's last authoritative point. That matters more than
 * it sounds. Deciding it against the drawn pose - which is what this did first -
 * mixes two clocks, because the hull is drawn a patch behind while the shell is
 * drawn extrapolated forward, and at speed that is twenty units of centre offset
 * against a shield radius of a hundred. Near the edges of the sector, and
 * whenever the operator was sweeping it, the geometry then disagreed with the
 * room about whether the shot was blocked at all - and the splash was silently
 * dropped on hits that had plainly happened.
 *
 * What comes back is an angle from the middle of the sector, so the caller can
 * put the splash on the barrier the crew is actually looking at.
 *
 * Deliberately silent in two cases. A sector that could not pay drops instead of
 * blocking and the shell flies on, so there is no contact to draw - and by then
 * the shield is down, which is what the crew should be looking at. And a threat
 * with no course on the wire is not followed at all rather than placed at its
 * last point, because that point is inside the barrier.
 */
export function resolveShieldImpact(
  threat: {
    /** Where the scene drew it, which for a shell is the freshest point there is. */
    readonly x: number;
    readonly y: number;
    readonly velocity: { readonly x: number; readonly y: number };
  },
  snapshot: ShieldImpactWorld,
  pose: ShieldPose | undefined
): ShieldImpact | undefined {
  if (pose === undefined || !snapshot.shield.active) return undefined;
  const speed = Math.hypot(threat.velocity.x, threat.velocity.y);
  if (speed <= 0) return undefined;
  const decided = getShieldImpact({
    centre: { x: snapshot.spaceship.x, y: snapshot.spaceship.y },
    bearing: snapshot.shield.angle,
    radius: snapshot.shieldRadius,
    arcHalfAngle: snapshot.shield.arcHalfAngle + EDGE_SLACK_RADIANS,
    from: { x: threat.x, y: threat.y },
    velocityX: threat.velocity.x,
    velocityY: threat.velocity.y,
    reach: (speed * IMPACT_WINDOW_MS) / 1000
  });
  if (decided === undefined) return undefined;
  // Same angle on the sector, on the barrier that is on screen.
  const normal = pose.bearing + decided.offset;
  return {
    x: pose.centre.x + Math.cos(normal) * snapshot.shieldRadius,
    y: pose.centre.y + Math.sin(normal) * snapshot.shieldRadius,
    normal,
    offset: decided.offset
  };
}
