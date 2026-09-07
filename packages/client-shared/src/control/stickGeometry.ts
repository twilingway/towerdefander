/**
 * Stick geometry, ported from the STEEL VOID touch overlay
 * (`mobileControls.js:_updateDriveVector`, itself a port of index.pretty.js:167054).
 *
 * Kept apart from the React component on purpose: this is the half worth
 * testing, and it needs no DOM to test. The component contributes pointer
 * capture and a knob transform, nothing that changes a number.
 */

export interface StickPoint {
  readonly x: number;
  readonly y: number;
}

export interface StickReading {
  /** Unit-ish direction, saturating at the ring. Zero inside the dead zone. */
  readonly vector: StickPoint;
  /** How far past the dead zone the thumb is, on `[0, 1]`. */
  readonly strength: number;
  /** Where to draw the knob, in pixels from the anchor and clamped to the ring. */
  readonly knob: StickPoint;
}

const NEUTRAL: StickReading = { vector: { x: 0, y: 0 }, strength: 0, knob: { x: 0, y: 0 } };

export function neutralStickReading(): StickReading {
  return NEUTRAL;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Read a stick.
 *
 * The lab's one subtlety, and the reason this is not two lines: direction and
 * strength ride different curves. The vector is divided by the FULL radius, so
 * it saturates when the thumb reaches the ring; the strength ramps from the
 * dead-zone edge across the remaining travel. Divide both by the same figure
 * and a stick with a dead zone can never ask for full speed.
 *
 * `anchor` is the centre of the drawn ring, never the point the finger landed
 * on. STEEL VOID resolves it from the element's bounding box every time
 * (`:167047`), which is what lets the grab zone be much larger than the ring
 * without the first pixel of travel jumping.
 */
export function readStick(
  anchor: StickPoint,
  pointer: StickPoint,
  radius: number,
  deadzoneShare: number
): StickReading {
  if (!(radius > 0)) return NEUTRAL;
  const dx = pointer.x - anchor.x;
  const dy = pointer.y - anchor.y;
  const distance = Math.hypot(dx, dy);
  // Past the ring the knob stops but the direction keeps meaning something.
  const scale = distance > radius && distance > 0 ? radius / distance : 1;
  const knob = { x: dx * scale, y: dy * scale };

  const deadzone = radius * clamp(deadzoneShare, 0, 0.95);
  const magnitude = Math.hypot(knob.x, knob.y);
  const travel = radius - deadzone;
  const strength =
    magnitude <= deadzone || travel <= 0 ? 0 : clamp((magnitude - deadzone) / travel, 0, 1);

  return {
    vector: strength > 0 ? { x: knob.x / radius, y: knob.y / radius } : { x: 0, y: 0 },
    strength,
    knob
  };
}

/**
 * Whether a touch at `clientX` belongs to the drive stick's grab zone.
 *
 * `:164` — the left share of the viewport takes the drive stick whether or not
 * the finger found the ring, and everything to the right of it belongs to the
 * aim side. A share, not a pixel count, because the same phone rotates.
 */
export function isInDriveZone(clientX: number, viewportWidth: number, zoneShare: number): boolean {
  if (!(viewportWidth > 0)) return false;
  return clientX < viewportWidth * clamp(zoneShare, 0, 1);
}
