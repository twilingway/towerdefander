export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PointTransition {
  readonly from: Point;
  readonly to: Point;
  readonly startedAt: number;
}

export interface AngleTransition {
  readonly from: number;
  readonly to: number;
  readonly startedAt: number;
}

export interface VisualSnapshot {
  readonly spaceship: Point;
  readonly turretAngle: number;
  readonly shield: { readonly angle: number };
}

export interface VisualTransitions {
  readonly spaceship: PointTransition;
  readonly turret: AngleTransition;
  readonly shield: AngleTransition;
}

export interface ResponsiveViewport {
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
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

export function getCircularGridSegments(
  centerX: number,
  centerY: number,
  radius: number,
  spacing: number
): readonly GridSegment[] {
  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isFinite(spacing) ||
    spacing <= 0
  ) {
    return [];
  }

  const segments: GridSegment[] = [];
  const firstX = Math.ceil((centerX - radius) / spacing) * spacing;
  const firstY = Math.ceil((centerY - radius) / spacing) * spacing;
  for (let x = firstX; x <= centerX + radius; x += spacing) {
    const halfHeight = Math.sqrt(Math.max(0, radius * radius - (x - centerX) ** 2));
    segments.push({
      from: { x, y: centerY - halfHeight },
      to: { x, y: centerY + halfHeight }
    });
  }
  for (let y = firstY; y <= centerY + radius; y += spacing) {
    const halfWidth = Math.sqrt(Math.max(0, radius * radius - (y - centerY) ** 2));
    segments.push({
      from: { x: centerX - halfWidth, y },
      to: { x: centerX + halfWidth, y }
    });
  }
  return segments;
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

export interface CameraScrollInput {
  readonly focus: Point;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly rendererWidth: number;
  readonly rendererHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly overscan: number;
}

export function getResponsiveViewport(
  actualWidth: number,
  actualHeight: number,
  baseWidth = 1600,
  baseHeight = 900
): ResponsiveViewport {
  const safeWidth = Number.isFinite(actualWidth) && actualWidth > 0 ? actualWidth : baseWidth;
  const safeHeight = Number.isFinite(actualHeight) && actualHeight > 0 ? actualHeight : baseHeight;
  const zoom = Math.min(safeWidth / baseWidth, safeHeight / baseHeight);
  return { zoom, width: safeWidth / zoom, height: safeHeight / zoom };
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

export function getCameraOverscan(
  spaceshipRadius: number,
  zoom: number,
  safeScreenMargin = 160,
  visualExtension = 42
): number {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return spaceshipRadius + visualExtension + safeScreenMargin / safeZoom;
}

export function getPhaserCameraScroll(input: CameraScrollInput): Point {
  const worldView = getBoundedCameraScroll(
    input.focus,
    input.worldWidth,
    input.worldHeight,
    input.viewportWidth,
    input.viewportHeight,
    input.overscan
  );
  return {
    x: worldView.x - (input.rendererWidth - input.viewportWidth) / 2,
    y: worldView.y - (input.rendererHeight - input.viewportHeight) / 2
  };
}

export class SnapshotResetLatch {
  private pending = false;

  request(): void {
    this.pending = true;
  }

  consumeForSnapshot(): boolean {
    const shouldReset = this.pending;
    this.pending = false;
    return shouldReset;
  }
}

export function createSnappedVisualTransitions(
  snapshot: VisualSnapshot,
  startedAt: number
): VisualTransitions {
  return {
    spaceship: createPointTransition(snapshot.spaceship, snapshot.spaceship, startedAt),
    turret: createAngleTransition(snapshot.turretAngle, snapshot.turretAngle, startedAt),
    shield: createAngleTransition(snapshot.shield.angle, snapshot.shield.angle, startedAt)
  };
}

export function createPointTransition(from: Point, to: Point, startedAt: number): PointTransition {
  return {
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    startedAt
  };
}

export function createAngleTransition(
  from: number,
  to: number,
  startedAt: number
): AngleTransition {
  return { from, to, startedAt };
}

export function getBoundedCameraScroll(
  focus: Point,
  worldWidth: number,
  worldHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  overscan = 0
): Point {
  return {
    x: getBoundedAxisScroll(focus.x, worldWidth, viewportWidth, overscan),
    y: getBoundedAxisScroll(focus.y, worldHeight, viewportHeight, overscan)
  };
}

export function interpolatePoint(current: Point, target: Point, amount: number): Point {
  const safeAmount = clamp(amount, 0, 1);
  return {
    x: current.x + (target.x - current.x) * safeAmount,
    y: current.y + (target.y - current.y) * safeAmount
  };
}

export function getTimelineAlpha(elapsedMs: number, durationMs = 50): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 1;
  return clamp(elapsedMs / durationMs, 0, 1);
}

export function interpolateAngle(current: number, target: number, amount: number): number {
  const safeAmount = clamp(amount, 0, 1);
  const fullTurn = Math.PI * 2;
  const wrappedDelta =
    ((((target - current + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
  // Match the authoritative core convention: an exact antipode turns in the
  // positive screen-clockwise direction instead of depending on modulo sign.
  const delta = wrappedDelta === -Math.PI ? Math.PI : wrappedDelta;
  return current + delta * safeAmount;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function getBoundedAxisScroll(
  focus: number,
  worldSize: number,
  viewportSize: number,
  overscan: number
): number {
  const safeOverscan = Math.max(0, overscan);
  const minimum = safeOverscan === 0 ? 0 : -safeOverscan;
  const maximum = worldSize + safeOverscan - viewportSize;
  if (maximum < minimum) return (minimum + maximum) / 2;
  return clamp(focus - viewportSize / 2, minimum, maximum);
}
