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
  readonly castle: Point;
  readonly turretAngle: number;
  readonly shield: { readonly angle: number };
}

export interface VisualTransitions {
  readonly castle: PointTransition;
  readonly turret: AngleTransition;
  readonly shield: AngleTransition;
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
    castle: createPointTransition(snapshot.castle, snapshot.castle, startedAt),
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
  viewportHeight: number
): Point {
  return {
    x: clamp(focus.x - viewportWidth / 2, 0, Math.max(0, worldWidth - viewportWidth)),
    y: clamp(focus.y - viewportHeight / 2, 0, Math.max(0, worldHeight - viewportHeight))
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
