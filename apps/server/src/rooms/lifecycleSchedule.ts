import type { RoomTimer } from "./latencyTracker.js";
import {
  compareLifecycleDeadlines,
  type LifecycleDeadline,
  type LifecycleDeadlineReason
} from "./lifecycleDeadline.js";

export interface LifecycleScheduleOptions {
  readonly schedule: (callback: () => void, delayMs: number) => RoomTimer;
  readonly now: () => number;
  readonly onExpired: (reason: LifecycleDeadlineReason) => void;
  /** A disposing room stops arming timers but keeps its recorded deadlines. */
  readonly isDisposing: () => boolean;
}

/**
 * The competing reasons a room may close - empty lobby, finished result, absolute
 * lifetime - and the single timer that fires whichever comes first. Generation
 * counting keeps a timer from a previous arrangement from firing after a reshuffle.
 */
export class LifecycleSchedule {
  private readonly deadlines = new Map<LifecycleDeadlineReason, number>();
  private timer: RoomTimer | undefined;
  private generation = 0;

  constructor(private readonly options: LifecycleScheduleOptions) {}

  set(reason: LifecycleDeadlineReason, expiresAtMs: number): void {
    this.deadlines.set(reason, expiresAtMs);
    this.reschedule();
  }

  clear(reason: LifecycleDeadlineReason): void {
    if (!this.deadlines.delete(reason)) return;
    this.reschedule();
  }

  has(reason: LifecycleDeadlineReason): boolean {
    return this.deadlines.has(reason);
  }

  /** When that reason is due, or undefined when it is not armed. */
  expiresAt(reason: LifecycleDeadlineReason): number | undefined {
    return this.deadlines.get(reason);
  }

  get size(): number {
    return this.deadlines.size;
  }

  stop(): void {
    this.generation += 1;
    this.timer?.clear();
    this.timer = undefined;
  }

  /** The soonest deadline, or the soonest one already due when a time is given. */
  next(expiredAtOrBeforeMs?: number): LifecycleDeadline | undefined {
    const deadlines = [...this.deadlines].map(([reason, expiresAtMs]) => ({
      reason,
      expiresAtMs
    }));
    const eligible =
      expiredAtOrBeforeMs === undefined
        ? deadlines
        : deadlines.filter(({ expiresAtMs }) => expiresAtMs <= expiredAtOrBeforeMs);
    return eligible.sort(compareLifecycleDeadlines)[0];
  }

  reschedule(): void {
    this.generation += 1;
    const generation = this.generation;
    this.timer?.clear();
    this.timer = undefined;
    if (this.options.isDisposing()) return;
    const next = this.next();
    if (next === undefined) return;
    this.timer = this.options.schedule(
      () => {
        if (this.options.isDisposing() || generation !== this.generation) return;
        this.timer = undefined;
        const expired = this.next(this.options.now());
        if (expired === undefined) {
          this.reschedule();
          return;
        }
        this.options.onExpired(expired.reason);
      },
      Math.max(1, next.expiresAtMs - this.options.now())
    );
  }
}
