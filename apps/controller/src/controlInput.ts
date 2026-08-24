export interface ControlVector {
  readonly x: number;
  readonly y: number;
}

export interface SequencedValue<T> {
  readonly sequence: number;
  readonly value: T;
}

const NEUTRAL_VECTOR: ControlVector = { x: 0, y: 0 };

export function normalizeControlVector(vector: ControlVector): ControlVector {
  const x = Number.isFinite(vector.x) ? Math.max(-1, Math.min(1, vector.x)) : 0;
  const y = Number.isFinite(vector.y) ? Math.max(-1, Math.min(1, vector.y)) : 0;
  const length = Math.hypot(x, y);
  if (length <= 1) {
    return { x, y };
  }
  return { x: x / length, y: y / length };
}

export function getKeyboardVector(keys: ReadonlySet<string>): ControlVector {
  const x =
    Number(keys.has("KeyD") || keys.has("ArrowRight")) -
    Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const y =
    Number(keys.has("KeyS") || keys.has("ArrowDown")) -
    Number(keys.has("KeyW") || keys.has("ArrowUp"));
  return x === 0 && y === 0 ? NEUTRAL_VECTOR : normalizeControlVector({ x, y });
}

export function getFireReleaseDelay(
  pressedAt: number | undefined,
  releasedAt: number,
  minimumPulseMs = 60
): number {
  if (pressedAt === undefined) return 0;
  return Math.max(0, minimumPulseMs - Math.max(0, releasedAt - pressedAt));
}

export function getNextShieldDesiredActive(currentDesired: boolean, energy: number): boolean {
  const next = !currentDesired;
  return next && energy <= 0 ? currentDesired : next;
}

export class PointerCycle {
  private pointerId: number | undefined;

  claim(pointerId: number, button: number): boolean {
    if (button !== 0 || this.pointerId !== undefined) return false;
    this.pointerId = pointerId;
    return true;
  }

  owns(pointerId: number): boolean {
    return this.pointerId === pointerId;
  }

  complete(pointerId: number): boolean {
    if (!this.owns(pointerId)) return false;
    this.pointerId = undefined;
    return true;
  }

  cancel(pointerId?: number): boolean {
    if (this.pointerId === undefined || (pointerId !== undefined && !this.owns(pointerId))) {
      return false;
    }
    this.pointerId = undefined;
    return true;
  }

  current(): number | undefined {
    return this.pointerId;
  }
}

export class LatestInputScheduler<T> {
  private current: T;
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private nextSequence = 1;
  private pending = false;
  private enabled = true;

  constructor(
    initialValue: T,
    private readonly send: (input: SequencedValue<T>) => void,
    private readonly minimumIntervalMs = 50,
    private readonly heartbeatMs = 100
  ) {
    this.current = initialValue;
  }

  update(value: T, now: number): void {
    this.current = value;
    if (!this.enabled) return;
    this.pending = true;
    this.flush(now);
  }

  flush(now: number): void {
    if (!this.enabled) return;
    const elapsed = now - this.lastSentAt;
    if (this.pending && elapsed >= this.minimumIntervalMs) {
      this.emit(now);
      return;
    }
    if (!this.pending && elapsed >= this.heartbeatMs) {
      this.emit(now);
    }
  }

  startGeneration(value: T, now: number): void {
    this.resetGeneration(value, now, true);
  }

  resetGeneration(value: T, now: number, enabled: boolean): void {
    this.current = value;
    this.nextSequence = 1;
    this.lastSentAt = Number.NEGATIVE_INFINITY;
    this.pending = enabled;
    this.enabled = enabled;
    if (enabled) this.flush(now);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.pending = false;
  }

  resumeWith(value: T, now: number): void {
    this.current = value;
    this.enabled = true;
    this.pending = true;
    this.flush(now);
  }

  private emit(now: number): void {
    this.send({ sequence: this.nextSequence, value: this.current });
    this.nextSequence += 1;
    this.lastSentAt = now;
    this.pending = false;
  }
}
