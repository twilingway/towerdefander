import {
  MAINTENANCE_MAX_WINDOW_SECONDS,
  type MaintenanceState
} from "@spaceship-defender/protocol";

/**
 * The announced maintenance window, held for the life of the process.
 *
 * Deliberately not on disk. A restart is exactly what a window ends in, and a
 * flag that survived it would leave the fresh container refusing rooms for
 * maintenance that already happened -- silently, because nobody would think to
 * look for a file.
 *
 * "Active" starts at the announcement, not at the deadline: the point of the
 * window is that new sessions stop while the ones already running finish, so
 * the refusal has to begin immediately and the countdown is only what players
 * are told.
 */
export class MaintenanceWindow {
  private startsAtMs: number | undefined;

  /** Announces a window that begins `windowSeconds` from now. */
  announce(windowSeconds: number, nowMs: number): void {
    const bounded = Math.min(
      Math.max(Math.trunc(windowSeconds), 0),
      MAINTENANCE_MAX_WINDOW_SECONDS
    );
    this.startsAtMs = nowMs + bounded * 1000;
  }

  cancel(): void {
    this.startsAtMs = undefined;
  }

  isActive(): boolean {
    return this.startsAtMs !== undefined;
  }

  /**
   * What a room publishes. The remaining seconds floor at zero and stay there:
   * the window does not stop being announced when its clock runs out, it just
   * stops counting down.
   */
  snapshot(nowMs: number): MaintenanceState {
    if (this.startsAtMs === undefined) return { active: false, secondsRemaining: 0 };
    const remainingMs = this.startsAtMs - nowMs;
    if (remainingMs <= 0) return { active: true, secondsRemaining: 0 };
    return {
      active: true,
      secondsRemaining: Math.min(Math.ceil(remainingMs / 1000), MAINTENANCE_MAX_WINDOW_SECONDS)
    };
  }
}
