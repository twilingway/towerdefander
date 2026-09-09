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

/**
 * Engine plume, sized by how hard the ship is actually driving forward.
 *
 * The atlas is one loop and cannot carry throttle, so the throttle arrives here
 * instead: length, width, brightness and playback rate all come off the same
 * number. Thrust runs along the nose, so that number is the velocity projected
 * onto the heading rather than its magnitude - drifting sideways out of a turn
 * or backing up must not light the engine.
 */
export interface ExhaustPlume {
  /** Idle, drifting or reversing: there is nothing to draw. */
  readonly visible: boolean;
  /** Length from the throat, in hull radii. */
  readonly lengthUnits: number;
  /** Width across the throat, in hull radii. */
  readonly widthUnits: number;
  readonly alpha: number;
  /** Multiplier on the loop's own frame rate. */
  readonly timeScale: number;
}

/**
 * Where the throat sits, in hull radii behind the centre: inside the tail, so
 * the birth edge of the plume is covered by the hull instead of ending in mid
 * space. Fed to `turretMountPoint` as a mount, which already turns a hull-frame
 * offset into world space.
 */
export const EXHAUST_THROAT_UNITS = 0.82;

/**
 * The plume is authored pointing up (-Y) with its throat on the bottom edge of
 * the cell, so the sprite is placed with origin (0.5, 1) and turned this far
 * from the heading. A sprite at rotation `t` sends its local -Y along
 * `(sin t, -cos t)`; the exhaust has to leave along `(-cos h, -sin h)`, and
 * `t = h - pi/2` is the angle that solves both.
 */
export const EXHAUST_ROTATION_OFFSET = -Math.PI / 2;

/**
 * The other half of the same convention, for an effect that leaves *along* the
 * thing it belongs to instead of against it - a muzzle flash rather than a
 * plume.
 *
 * Same algebra, other sign: a sprite at rotation `t` sends its local -Y along
 * `(sin t, -cos t)`, and a flash has to leave along `(cos a, sin a)`, which
 * `t = a + pi/2` solves. Getting this wrong points the flash into the hull it
 * was fired from, which is exactly what it looked like.
 */
export const MUZZLE_ROTATION_OFFSET = Math.PI / 2;

/** Below this share of top speed the engine reads as off. */
const PLUME_DEADZONE = 0.06;
const PLUME_LENGTH_MIN = 0.9;
const PLUME_LENGTH_MAX = 2.4;
const PLUME_WIDTH_MIN = 0.55;
const PLUME_WIDTH_MAX = 0.85;
/** Share of throttle at which the plume is already at full brightness. */
const PLUME_ALPHA_KNEE = 0.35;
const PLUME_TIME_SCALE_MIN = 0.7;
const PLUME_TIME_SCALE_MAX = 1.3;

const HIDDEN_PLUME: ExhaustPlume = {
  visible: false,
  lengthUnits: 0,
  widthUnits: 0,
  alpha: 0,
  timeScale: 1
};

export function getExhaustPlume(
  motion: {
    readonly velocityX: number;
    readonly velocityY: number;
    readonly heading: number;
  },
  maxSpeedPerSecond: number
): ExhaustPlume {
  if (!(maxSpeedPerSecond > 0)) return HIDDEN_PLUME;
  const forward =
    motion.velocityX * Math.cos(motion.heading) + motion.velocityY * Math.sin(motion.heading);
  const throttle = clamp(forward / maxSpeedPerSecond, 0, 1);
  if (throttle <= PLUME_DEADZONE) return HIDDEN_PLUME;
  const drive = (throttle - PLUME_DEADZONE) / (1 - PLUME_DEADZONE);
  return {
    visible: true,
    lengthUnits: PLUME_LENGTH_MIN + (PLUME_LENGTH_MAX - PLUME_LENGTH_MIN) * drive,
    widthUnits: PLUME_WIDTH_MIN + (PLUME_WIDTH_MAX - PLUME_WIDTH_MIN) * drive,
    alpha: clamp(drive / PLUME_ALPHA_KNEE, 0, 1),
    timeScale: PLUME_TIME_SCALE_MIN + (PLUME_TIME_SCALE_MAX - PLUME_TIME_SCALE_MIN) * drive
  };
}

/**
 * Where a shot leaves a barrel: a point that far along that bearing.
 *
 * Two things this is careful about, both of them bugs that were seen on screen.
 * The reach is the hull radius plus the shell's own, which is exactly what the
 * simulation fires from - the turret's mount is its pivot, not the end of its
 * barrel, and a flash put on the mount sits in the middle of the ship. And the
 * origin and bearing must come from the pose the scene *drew*, not from the
 * snapshot: the hull is drawn interpolated, roughly a patch behind the room, so
 * a flash placed from the snapshot trails the visible gun by speed times that
 * lag. Which is why it looked like the flash reacted to how fast the ship flew.
 */
export function getMuzzlePoint(origin: Point, bearing: number, reach: number): Point {
  return { x: origin.x + Math.cos(bearing) * reach, y: origin.y + Math.sin(bearing) * reach };
}

/** Segments the band is bent over; enough that the arc reads as a curve. */
export const SHIELD_BAND_SEGMENTS = 24;

/**
 * The spine of the animated barrier, in the layer's own frame.
 *
 * Local rather than world for the same reason the crescent is baked centred on
 * zero: the sector's shape changes only when a module widens the arc, while its
 * bearing changes every frame. Points computed here are rebuilt on a shape
 * change and the object is simply turned the rest of the time.
 *
 * Angle zero is the middle of the sector, so a layer turned to the shield's
 * bearing puts the band exactly where the crescent is.
 */
export function getShieldBandPoints(
  radius: number,
  arcHalfAngle: number,
  segments: number = SHIELD_BAND_SEGMENTS
): readonly Point[] {
  const steps = Math.max(2, Math.floor(segments));
  const arc = getShieldArcRange(0, arcHalfAngle);
  const span = arc.end - arc.start;
  return Array.from({ length: steps + 1 }, (_unused, index) => {
    const angle = arc.start + (span * index) / steps;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

/**
 * How solid the barrier is drawn, from what is left in the bank.
 *
 * The charge is already on the wire and the crew reads it off a dial; putting it
 * on the barrier itself means a sector about to collapse looks like one. The
 * floor is deliberate - a shield that is up must never be invisible, or the
 * crew cannot tell it from a shield that is down.
 */
export const SHIELD_BAND_ALPHA_MIN = 0.5;
export const SHIELD_BAND_ALPHA_MAX = 1;

export function getShieldBandAlpha(energy: number, capacity: number): number {
  const charge = capacity > 0 ? clamp(energy / capacity, 0, 1) : 0;
  return SHIELD_BAND_ALPHA_MIN + (SHIELD_BAND_ALPHA_MAX - SHIELD_BAND_ALPHA_MIN) * charge;
}

export interface ShieldImpactQuery {
  /** Hull centre and shield bearing, both as the scene drew them. */
  readonly centre: Point;
  readonly bearing: number;
  readonly radius: number;
  readonly arcHalfAngle: number;
  /** The threat's last known point and heading, from the same drawn frame. */
  readonly from: Point;
  readonly velocityX: number;
  readonly velocityY: number;
  /** How far along its own course the threat may be met. */
  readonly reach: number;
}

export interface ShieldImpact {
  readonly x: number;
  readonly y: number;
  /** Outward normal at the contact: where the splash has to point. */
  readonly normal: number;
  /**
   * The contact as an angle from the middle of the sector.
   *
   * What makes the splash placeable on a barrier that is drawn somewhere else.
   * The decision is made against the room's own geometry, because that is what
   * blocked the shot; the picture is a patch behind it, and an offset carries
   * from one to the other where a world point cannot.
   */
  readonly offset: number;
}

/**
 * Share of the reach a contact may be met *behind* the threat's own point.
 *
 * A whole reach, not a quarter, because the point handed in is the one the
 * scene drew and a shell is drawn extrapolated forward - by the frame the
 * removal arrives it is usually already past the arc, so the crossing is
 * behind it rather than ahead. Backwards and forwards are both a patch or two
 * of its own travel: that is the width of the uncertainty, and nothing wider
 * would be honest about it.
 */
export const SHIELD_IMPACT_BACKTRACK = 1;

/**
 * Where a threat met the raised sector, or nothing if it never did.
 *
 * The display is what decides this, because the room does not publish it: a
 * blocked shell simply stops being in the snapshot, and the shield's charge
 * moves. Both of those are visible here, and a contact point is geometry.
 *
 * Extrapolation is the whole difficulty. The simulation removes a shell at the
 * instant of impact, so its last published point is short of the arc by up to a
 * patch of travel - taking the published point as the contact would put every
 * splash inside the barrier. So the shell's own course is followed to where it
 * crosses the shield's circle, and a crossing is accepted only within `reach`
 * ahead and a quarter of that behind: the small backward window catches a shell
 * the display had already drawn past the arc, while the bound keeps a shell that
 * expired somewhere else from claiming a hit whose ray happens to pass here.
 */
export function getShieldImpact(query: ShieldImpactQuery): ShieldImpact | undefined {
  const speed = Math.hypot(query.velocityX, query.velocityY);
  if (speed <= 0) return undefined;
  const dx = query.velocityX / speed;
  const dy = query.velocityY / speed;
  const fromX = query.from.x - query.centre.x;
  const fromY = query.from.y - query.centre.y;
  const along = fromX * dx + fromY * dy;
  const discriminant =
    along * along - (fromX * fromX + fromY * fromY - query.radius * query.radius);
  if (discriminant < 0) return undefined;
  // The entry crossing, and only that one: a shell deep inside the circle and
  // heading out is one the shield failed to stop, not one it blocked.
  const entry = -along - Math.sqrt(discriminant);
  if (entry < -query.reach * SHIELD_IMPACT_BACKTRACK || entry > query.reach) return undefined;
  const x = query.from.x + dx * entry;
  const y = query.from.y + dy * entry;
  const normal = Math.atan2(y - query.centre.y, x - query.centre.x);
  const raw = normal - query.bearing;
  const offset = Math.atan2(Math.sin(raw), Math.cos(raw));
  if (Math.abs(offset) > query.arcHalfAngle) return undefined;
  return { x, y, normal, offset };
}
