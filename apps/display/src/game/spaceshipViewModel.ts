export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ShieldDash {
  /** Along the arc, in world units at the shield radius. */
  readonly lengthPx: number;
  readonly gapPx: number;
}

export interface ShieldVisualStyle {
  readonly lineWidth: number;
  readonly color: number;
  readonly alpha: number;
  /** Null draws one solid arc; a dash splits it into strokes. */
  readonly dash: ShieldDash | null;
  /**
   * Widest point of a filled crescent, in world units. Null strokes the arc at
   * `lineWidth` instead.
   */
  readonly crescentThickness: number | null;
}

export interface GridSegment {
  readonly from: Point;
  readonly to: Point;
}

export interface RimBandStroke {
  /** Circle the stroke is centred on, so it covers [arena - width, arena]. */
  readonly radius: number;
  readonly thickness: number;
}

/**
 * The elastic band drawn as one thick stroked circle rather than two fills:
 * a stroke of width `w` centred on `arenaRadius - w / 2` covers exactly the
 * ring the simulation slows a hull in. Null means there is no band to show.
 */
export function getRimBandStroke(arenaRadius: number, bandWidth: number): RimBandStroke | null {
  if (!Number.isFinite(arenaRadius) || !Number.isFinite(bandWidth)) return null;
  if (arenaRadius <= 0 || bandWidth <= 0) return null;
  const thickness = Math.min(bandWidth, arenaRadius);
  return { radius: arenaRadius - thickness / 2, thickness };
}

/**
 * Distance rings inside the arena, evenly spaced and leaving the rim to the
 * border stroke. The count is fixed and the spacing follows the radius, so a
 * larger arena reads the same rather than turning into a denser field.
 */
export function getArenaRingRadii(arenaRadius: number, count = 3): readonly number[] {
  if (!Number.isFinite(arenaRadius) || arenaRadius <= 0) return [];
  const rings = Math.max(0, Math.trunc(count));
  return Array.from({ length: rings }, (_, index) => (arenaRadius * (index + 1)) / (rings + 1));
}

/**
 * Radial spokes from a clearing at the centre out to the rim. The clearing
 * keeps sixteen lines from converging into a blot where the ship starts.
 */
export function getArenaSpokes(
  centerX: number,
  centerY: number,
  arenaRadius: number,
  count = 16,
  innerFraction = 0.06
): readonly GridSegment[] {
  if (!Number.isFinite(arenaRadius) || arenaRadius <= 0) return [];
  const spokes = Math.max(0, Math.trunc(count));
  const inner = arenaRadius * clamp(innerFraction, 0, 1);
  return Array.from({ length: spokes }, (_, index) => {
    const angle = (index / spokes) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      from: { x: centerX + cos * inner, y: centerY + sin * inner },
      to: { x: centerX + cos * arenaRadius, y: centerY + sin * arenaRadius }
    };
  });
}

export function getShieldArcRange(
  angle: number,
  arcHalfAngle: number
): { readonly start: number; readonly end: number } {
  return { start: angle - arcHalfAngle, end: angle + arcHalfAngle };
}

export interface StableIdReconciliation {
  readonly create: readonly string[];
  readonly update: readonly string[];
  readonly remove: readonly string[];
}

export function reconcileStableIds(
  existingIds: Iterable<string>,
  incomingIds: Iterable<string>
): StableIdReconciliation {
  const existing = new Set(existingIds);
  const incoming = new Set(incomingIds);
  const create: string[] = [];
  const update: string[] = [];
  const remove: string[] = [];
  for (const id of incoming) (existing.has(id) ? update : create).push(id);
  for (const id of existing) if (!incoming.has(id)) remove.push(id);
  return { create, update, remove };
}

export function getShieldVisualStyle(active: boolean): ShieldVisualStyle {
  return active
    ? { lineWidth: 11, color: 0x65baff, alpha: 0.85, dash: null, crescentThickness: 11 }
    : {
        lineWidth: 6,
        color: 0x6f91a4,
        alpha: 0.35,
        dash: { lengthPx: 16, gapPx: 12 },
        crescentThickness: null
      };
}

/** Samples along the sector; enough that the tapered edge reads as a curve. */
export const SHIELD_CRESCENT_SAMPLES = 48;

/**
 * Outlines the raised shield as a crescent: a band that is widest at the middle
 * of the sector and narrows to nothing at both tips.
 *
 * Graphics strokes at one width per path, so a band that changes thickness has
 * to be a filled shape rather than a thicker line. The outline runs along the
 * outer edge and returns along the inner one, which also gives the glow filter
 * a soft tapered silhouette to bloom around instead of a blunt stroke.
 */
export function getShieldCrescentPoints(
  start: number,
  end: number,
  radius: number,
  thickness: number,
  samples: number = SHIELD_CRESCENT_SAMPLES
): readonly Point[] {
  const sweep = end - start;
  const steps = Math.floor(samples);
  if (!(radius > 0) || !(sweep > 0) || !(thickness > 0) || steps < 2) return [];

  const halfThickness = thickness / 2;
  const outer: Point[] = [];
  const inner: Point[] = [];
  for (let index = 0; index < steps; index += 1) {
    const progress = index / (steps - 1);
    const angle = start + sweep * progress;
    // A sine profile reaches zero at both tips and its widest in the middle, so
    // the band closes on itself without a visible seam.
    const halfWidth = halfThickness * Math.sin(Math.PI * progress);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    outer.push({ x: cos * (radius + halfWidth), y: sin * (radius + halfWidth) });
    inner.push({ x: cos * (radius - halfWidth), y: sin * (radius - halfWidth) });
  }
  return [...outer, ...inner.reverse()];
}

export interface ShieldArcSegment {
  readonly start: number;
  readonly end: number;
}

/**
 * Splits a shield arc into dashes. Phaser Graphics strokes solid lines only, so
 * the dashing is geometry rather than a line style. The sector keeps its own
 * ends: the first dash starts at `start` and the last one is clipped at `end`
 * rather than allowed to overshoot it.
 */
export function getShieldDashSegments(
  start: number,
  end: number,
  radius: number,
  dash: ShieldDash
): readonly ShieldArcSegment[] {
  const sweep = end - start;
  const period = dash.lengthPx + dash.gapPx;
  if (!(radius > 0) || !(sweep > 0) || !(dash.lengthPx > 0) || !(period > 0)) return [];

  const dashAngle = dash.lengthPx / radius;
  const periodAngle = period / radius;
  // A dash longer than the whole sector degenerates to the solid arc.
  if (dashAngle >= sweep) return [{ start, end }];

  const segments: ShieldArcSegment[] = [];
  for (let offset = 0; offset < sweep; offset += periodAngle) {
    segments.push({ start: start + offset, end: Math.min(end, start + offset + dashAngle) });
  }
  return segments;
}

/**
 * What the focus rings are read against: one ship, at the position being drawn
 * rather than the one last sent.
 *
 * Mutable, and deliberately so - see `fillFocusCandidates`.
 */
export interface MutableFocusCandidate {
  entityId: string;
  x: number;
  y: number;
  radius: number;
  velocityX: number;
  velocityY: number;
}

/** Everything the rings need off an enemy, before it is placed. */
export interface FocusSource {
  readonly entityId: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly velocityX: number;
  readonly velocityY: number;
}

/**
 * Refills a list of ships in place and hands back the same array.
 *
 * The turret ring and the nose brackets ask the same question of the same
 * ships, and each used to build its own list of fresh objects every frame: at
 * forty enemies that is eighty objects a frame, five thousand a second, thrown
 * away immediately. That kind of garbage does not show up as a lower frame
 * rate, it shows up as an occasional stalled frame - which is the thing a
 * player calls a freeze.
 *
 * Reusing the array is only safe because nothing here outlives the frame that
 * filled it: `pickFocusedTarget` hands one of these objects straight back to
 * its caller, which reads it at once and keeps only the entity id. Anything
 * that wants to hold a candidate across frames has to copy it first.
 */
export function fillFocusCandidates(
  scratch: MutableFocusCandidate[],
  enemies: readonly FocusSource[],
  positionAt: (enemy: FocusSource) => Point
): readonly MutableFocusCandidate[] {
  scratch.length = enemies.length;
  for (const [index, enemy] of enemies.entries()) {
    const at = positionAt(enemy);
    const slot = scratch[index];
    if (slot === undefined) {
      scratch[index] = {
        entityId: enemy.entityId,
        x: at.x,
        y: at.y,
        radius: enemy.radius,
        velocityX: enemy.velocityX,
        velocityY: enemy.velocityY
      };
      continue;
    }
    slot.entityId = enemy.entityId;
    slot.x = at.x;
    slot.y = at.y;
    slot.radius = enemy.radius;
    slot.velocityX = enemy.velocityX;
    slot.velocityY = enemy.velocityY;
  }
  return scratch;
}

/** Shared with the playback clock, which walks values inside the same bounds. */
export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
