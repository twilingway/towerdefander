import type { RoomClosingReason } from "@spaceship-defender/protocol";

export type LifecycleDeadlineReason = Exclude<RoomClosingReason, "display_left">;

export interface LifecycleDeadline {
  readonly reason: LifecycleDeadlineReason;
  readonly expiresAtMs: number;
}

export function compareLifecycleDeadlines(
  left: LifecycleDeadline,
  right: LifecycleDeadline
): number {
  if (left.expiresAtMs !== right.expiresAtMs) return left.expiresAtMs - right.expiresAtMs;
  return lifecycleReasonPriority(left.reason) - lifecycleReasonPriority(right.reason);
}

export function lifecycleReasonPriority(reason: LifecycleDeadlineReason): number {
  if (reason === "display_reconnect_expired") return 0;
  if (reason === "room_lifetime_expired") return 1;
  if (reason === "lobby_expired" || reason === "result_expired") return 2;
  return 3;
}
