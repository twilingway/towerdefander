/**
 * Which enemy the gunner is on, and whether a shot at it would land.
 *
 * Two different things, and the display says them in two colours: the ring
 * marks what is being held, and it goes green the moment the barrel is actually
 * on it and inside its reach. Holding and hitting drift apart constantly - the
 * ship crosses, the bore lags, the range opens - and that gap is the thing
 * worth showing.
 *
 * There is no lock in this game: the gunner turns a barrel, so what is held is
 * read off the geometry and then kept, with a wider band to let go than to
 * take, or the ring would blink on every wobble of the aim.
 *
 * `lockedEntityId` is the seam for the day a lock does exist - an aim assist
 * that snaps to the nearest ship, or a target picked by tapping it. When it
 * names something on the field, that is what is held and nothing else is
 * consulted; the green stays honest either way, because it is measured against
 * the barrel rather than against the choice.
 */

export interface FocusCandidate {
  readonly entityId: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly velocityX?: number | undefined;
  readonly velocityY?: number | undefined;
}

export interface FocusQuery {
  readonly origin: { readonly x: number; readonly y: number };
  /** Where the barrel points, in radians. */
  readonly bearing: number;
  /** How far it carries; a ship beyond this is not something a shot reaches. */
  readonly reach: number;
  /**
   * How fast a shot travels. Zero for a beam, which arrives where it is pointed
   * and is therefore never led.
   */
  readonly speed?: number | undefined;
  readonly candidates: readonly FocusCandidate[];
  /** What was held last frame, so it is not dropped on the first wobble. */
  readonly heldEntityId?: string | undefined;
  readonly lockedEntityId?: string | undefined;
}

export interface FocusResult {
  readonly target: FocusCandidate;
  /** The barrel is on it and it is inside the reach: a shot now connects. */
  readonly firable: boolean;
}

/**
 * The narrowest the bore is ever treated as. A ship far enough away subtends
 * almost nothing, and a ring that flickers on and off with the last pixel of
 * aim is worse than no ring: this is about a degree and a half.
 */
const BORE_FLOOR_RADIANS = 0.025;
/**
 * How far off the barrel a held target may drift before the ring lets it go.
 * Wide on purpose - about thirty-five degrees - because holding a ship and
 * having the barrel on it are different things: a gunner circling a target and
 * swinging the mount onto it is working that ship the whole way round, and the
 * mark belongs on it for the whole swing.
 */
const HOLD_RELEASE_RADIANS = 0.6;

function signedAngleDelta(from: number, to: number): number {
  const delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) return delta - Math.PI * 2;
  if (delta < -Math.PI) return delta + Math.PI * 2;
  return delta;
}

function boreOf(candidate: FocusCandidate, distance: number): number {
  // The bore counts as crossing the ship when the aim error is inside the angle
  // the ship itself subtends, so a big hull is easier to hold than a wasp -
  // which is what it looks like down the barrel.
  return Math.max(Math.atan2(candidate.radius, distance), BORE_FLOOR_RADIANS);
}

/**
 * Where a shot fired now would meet this ship.
 *
 * The barrel is laid ahead of a crossing target, not on it, so testing the bore
 * against where the ship is standing answers the wrong question: the better the
 * gunner leads, the further off the mark the test reads. Two passes are enough
 * - the flight time barely moves after the first correction, and a third would
 * be arguing with the tick rate.
 */
function meetingPoint(query: FocusQuery, candidate: FocusCandidate): { x: number; y: number } {
  const speed = query.speed ?? 0;
  const velocityX = candidate.velocityX ?? 0;
  const velocityY = candidate.velocityY ?? 0;
  if (speed <= 0 || (velocityX === 0 && velocityY === 0)) return candidate;
  let seconds = Math.hypot(candidate.x - query.origin.x, candidate.y - query.origin.y) / speed;
  for (let pass = 0; pass < 2; pass += 1) {
    const x = candidate.x + velocityX * seconds;
    const y = candidate.y + velocityY * seconds;
    seconds = Math.hypot(x - query.origin.x, y - query.origin.y) / speed;
  }
  return { x: candidate.x + velocityX * seconds, y: candidate.y + velocityY * seconds };
}

function aimAt(
  query: FocusQuery,
  candidate: FocusCandidate
): { readonly distance: number; readonly error: number; readonly bore: number } {
  const meeting = meetingPoint(query, candidate);
  const dx = meeting.x - query.origin.x;
  const dy = meeting.y - query.origin.y;
  const distance = Math.hypot(dx, dy);
  return {
    distance,
    error: Math.abs(signedAngleDelta(query.bearing, Math.atan2(dy, dx))),
    bore: boreOf(candidate, distance)
  };
}

function firableAt(query: FocusQuery, candidate: FocusCandidate): boolean {
  const aim = aimAt(query, candidate);
  return aim.distance > 0 && aim.distance <= query.reach && aim.error <= aim.bore;
}

export function pickFocusedTarget(query: FocusQuery): FocusResult | undefined {
  const held = (target: FocusCandidate): FocusResult => ({
    target,
    firable: firableAt(query, target)
  });

  if (query.lockedEntityId !== undefined) {
    const locked = query.candidates.find(({ entityId }) => entityId === query.lockedEntityId);
    return locked === undefined ? undefined : held(locked);
  }

  // What was held last frame stays held while it is anywhere near the barrel,
  // so the mark stays on the ship being worked rather than jumping to whatever
  // crossed the bore this instant - or vanishing while the mount catches up.
  const previous = query.candidates.find(({ entityId }) => entityId === query.heldEntityId);
  if (previous !== undefined) {
    const aim = aimAt(query, previous);
    if (aim.distance > 0 && aim.distance <= query.reach && aim.error <= HOLD_RELEASE_RADIANS) {
      return held(previous);
    }
  }

  // Nothing held: take whatever the barrel is nearest to, inside the same
  // generous angle it would be kept at. Not whatever the bore is already on - a
  // gunner swinging onto a ship is working that ship before the barrel arrives,
  // and the ring is what says which one that is. Ties go to the nearer ship,
  // because that is the one a shot reaches first.
  let best: FocusCandidate | undefined;
  let bestError = Number.POSITIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of query.candidates) {
    const aim = aimAt(query, candidate);
    if (aim.distance <= 0 || aim.distance > query.reach) continue;
    if (aim.error > HOLD_RELEASE_RADIANS) continue;
    if (aim.error < bestError || (aim.error === bestError && aim.distance < bestDistance)) {
      best = candidate;
      bestError = aim.error;
      bestDistance = aim.distance;
    }
  }
  return best === undefined ? undefined : held(best);
}
