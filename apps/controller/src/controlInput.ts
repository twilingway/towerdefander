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
    this.current = value;
    this.nextSequence = 1;
    this.lastSentAt = Number.NEGATIVE_INFINITY;
    this.pending = true;
    this.enabled = true;
    this.flush(now);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.pending = false;
  }

  private emit(now: number): void {
    this.send({ sequence: this.nextSequence, value: this.current });
    this.nextSequence += 1;
    this.lastSentAt = now;
    this.pending = false;
  }
}
