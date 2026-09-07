/**
 * Aim assist, ported from STEEL VOID's mobile overlay
 * (`aimAssist.js`, itself a port of index.pretty.js:145262-145392).
 *
 * The rule in one sentence: while the trigger is held, the bearing the panel
 * sends is replaced by the bearing of the best target inside a cone along the
 * one the thumb asked for. Nothing else moves — not the shell, not the spread,
 * not the damage.
 *
 * That is what makes it defensible on a server-authoritative game. The client
 * already names the turret's bearing outright: `applyGunnerInput` takes the
 * `atan2` of whatever vector arrives. Assist changes that same number and no
 * other, so it hands the client nothing it did not already hold. Steering the
 * shell would be a different thing entirely, and is not here.
 *
 * Everything is pure and unit-agnostic: the caller supplies the cone, because
 * STEEL VOID's pixels are not this arena's units.
 */

export interface AimTarget {
  readonly x: number;
  readonly y: number;
  /** Half-width of the thing; the corridor widens for something big. */
  readonly radius: number;
}

export type AimObstacle =
  | {
      readonly kind: "rectangle";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | { readonly kind: "circle"; readonly x: number; readonly y: number; readonly radius: number };

export interface AimCone {
  /** Nothing further along the ray than this is considered. */
  readonly range: number;
  /** Lateral corridor for a point-sized target. */
  readonly baseTolerance: number;
  /** The corridor never opens wider than this, however large the target. */
  readonly maxTolerance: number;
}

export interface AimAssistRequest {
  readonly shooter: { readonly x: number; readonly y: number };
  /** Unit direction the thumb asked for. A zero vector means "no request". */
  readonly direction: { readonly x: number; readonly y: number };
  readonly targets: readonly AimTarget[];
  readonly obstacles: readonly AimObstacle[];
  readonly cone: AimCone;
}

export interface AimAssistChoice {
  readonly x: number;
  readonly y: number;
  /** Distance along the ray. */
  readonly along: number;
  /** Perpendicular distance from the ray. */
  readonly lateral: number;
  readonly tolerance: number;
  readonly score: number;
}

/**
 * :145258 — the shipped cone, as shares rather than pixels.
 *
 * STEEL VOID states them absolutely: 760 units of range with a 56-unit corridor
 * that widens to 96. Those figures mean nothing in an arena of a different
 * size, so what travels is their proportions — a corridor 7.4% of the range,
 * opening to 12.6%. The range itself is the weapon's own reach, which the
 * snapshot already carries, so the cone reaches exactly as far as the gun does
 * instead of as far as another game's gun did.
 */
export const AIM_BASE_TOLERANCE_SHARE = 56 / 760;
export const AIM_MAX_TOLERANCE_SHARE = 96 / 760;
/** :145285 — how much of a target's size widens the corridor. */
const TARGET_SIZE_TOLERANCE = 0.25;
/** Scoring weights (:145356). Lateral outweighs range by more than ten to one. */
const LATERAL_WEIGHT = 1000;
const RANGE_WEIGHT = 80;
const EPSILON = 1e-4;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Build a cone from a weapon's reach, keeping the shipped proportions. */
export function coneForReach(reach: number): AimCone {
  return {
    range: reach,
    baseTolerance: reach * AIM_BASE_TOLERANCE_SHARE,
    maxTolerance: reach * AIM_MAX_TOLERANCE_SHARE
  };
}

/**
 * :145334 — Liang-Barsky segment/AABB clipping.
 *
 * Chosen over a ray cast because it is branch-only arithmetic: no allocation
 * and no query, which matters when it runs once per candidate per obstacle on
 * every frame the trigger is down.
 */
export function segmentIntersectsRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rect: { left: number; right: number; top: number; bottom: number }
): boolean {
  if (rect.right <= rect.left || rect.bottom <= rect.top) return false;
  let tMin = 0;
  let tMax = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < EPSILON) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > tMax) return false;
      if (r > tMin) tMin = r;
      return true;
    }
    if (r < tMin) return false;
    if (r < tMax) tMax = r;
    return true;
  };

  return (
    clip(-dx, x0 - rect.left) &&
    clip(dx, rect.right - x0) &&
    clip(-dy, y0 - rect.top) &&
    clip(dy, rect.bottom - y0)
  );
}

/**
 * A circle is treated as its bounding box.
 *
 * The lab had only rectangles, so this is the one place the port decides
 * something on its own. A box is the conservative choice: it can hide a target
 * the round rock would have left visible, which costs a lock the player could
 * have had — the opposite mistake would hand them a shot into a rock.
 */
function obstacleRect(obstacle: AimObstacle): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  if (obstacle.kind === "circle") {
    return {
      left: obstacle.x - obstacle.radius,
      right: obstacle.x + obstacle.radius,
      top: obstacle.y - obstacle.radius,
      bottom: obstacle.y + obstacle.radius
    };
  }
  return {
    left: obstacle.x,
    right: obstacle.x + obstacle.width,
    top: obstacle.y,
    bottom: obstacle.y + obstacle.height
  };
}

/** :145347 — is anything solid between the shooter and the candidate. */
export function lineBlocked(
  obstacles: readonly AimObstacle[],
  x0: number,
  y0: number,
  x1: number,
  y1: number
): boolean {
  for (const obstacle of obstacles) {
    if (segmentIntersectsRect(x0, y0, x1, y1, obstacleRect(obstacle))) return true;
  }
  return false;
}

/**
 * :145356 — pick the best target, or nothing.
 *
 * Everything is measured in the ray's own frame: `along` is the projection onto
 * it and must be ahead of the shooter and inside the range; `lateral` is the
 * perpendicular distance and must fit the corridor. The corridor widens with
 * the target, so a boss is easier to hold than a drone.
 *
 * Score = (lateral / tolerance) * 1000 + (along / range) * 80, lowest wins.
 * The weighting is the whole behaviour: being centred beats being close by more
 * than ten to one, so range only settles ties between two targets that are both
 * nearly on the crosshair. Reverse it and the assist yanks the gun onto
 * whatever is nearest, which reads as the crosshair fighting the thumb.
 */
export function selectAimTarget({
  shooter,
  direction,
  targets,
  obstacles,
  cone
}: AimAssistRequest): AimAssistChoice | null {
  const length = Math.hypot(direction.x, direction.y);
  if (length <= EPSILON || !(cone.range > 0)) return null;
  const dirX = direction.x / length;
  const dirY = direction.y / length;

  let best: AimAssistChoice | null = null;
  for (const target of targets) {
    const relX = target.x - shooter.x;
    const relY = target.y - shooter.y;
    const along = relX * dirX + relY * dirY;
    if (along <= 0 || along > cone.range) continue;

    const lateral = Math.abs(relX * dirY - relY * dirX);
    const tolerance = clamp(
      cone.baseTolerance + target.radius * 2 * TARGET_SIZE_TOLERANCE,
      cone.baseTolerance,
      cone.maxTolerance
    );
    if (lateral > tolerance) continue;
    if (lineBlocked(obstacles, shooter.x, shooter.y, target.x, target.y)) continue;

    const score = (lateral / tolerance) * LATERAL_WEIGHT + (along / cone.range) * RANGE_WEIGHT;
    if (best === null || score < best.score) {
      best = { x: target.x, y: target.y, along, lateral, tolerance, score };
    }
  }
  return best;
}

/**
 * :145386 — the gate, and the bearing that comes out of it.
 *
 * The condition that matters is the trigger: assist does nothing while the
 * player is only aiming, which is why the crosshair never feels like it is
 * arguing. Returns the direction to send — the requested one, unchanged,
 * whenever there is nothing to lock.
 */
export function assistedAimDirection(
  request: AimAssistRequest,
  options: { readonly enabled: boolean; readonly firing: boolean }
): { readonly x: number; readonly y: number } {
  if (!options.enabled || !options.firing) return request.direction;
  const target = selectAimTarget(request);
  if (target === null) return request.direction;
  const dx = target.x - request.shooter.x;
  const dy = target.y - request.shooter.y;
  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) return request.direction;
  return { x: dx / length, y: dy / length };
}
