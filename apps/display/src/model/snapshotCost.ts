/**
 * What the network path costs the main thread, in milliseconds a second.
 *
 * The frame counter says a frame ran long; it cannot say what ran in it. Every
 * patch is turned into a plain view and validated before React sees it, and on
 * a phone that work lands in bursts twenty times a second - which is exactly the
 * shape of "a third of the frames are long" with a background that made no
 * difference. So it is measured rather than argued about.
 *
 * Milliseconds a second is the unit that answers the question: a tenth of a
 * millisecond twenty times over is nothing, and eight milliseconds twenty times
 * over is sixteen percent of the thread before a single sprite has moved.
 */

const WINDOW_MS = 1_000;

export interface SnapshotCost {
  /** Milliseconds of the last completed second spent building views. */
  readonly msPerSecond: number;
  /** Patches that arrived in it, so the cost can be read per patch too. */
  readonly patchesPerSecond: number;
  /** The most expensive single conversion of that second. */
  readonly worstMs: number;
  readonly windowStartedAt: number | undefined;
  readonly windowMs: number;
  readonly windowPatches: number;
  readonly windowWorstMs: number;
}

export function createSnapshotCost(): SnapshotCost {
  return {
    msPerSecond: 0,
    patchesPerSecond: 0,
    worstMs: 0,
    windowStartedAt: undefined,
    windowMs: 0,
    windowPatches: 0,
    windowWorstMs: 0
  };
}

export function advanceSnapshotCost(cost: SnapshotCost, nowMs: number): SnapshotCost {
  if (!Number.isFinite(nowMs)) return cost;
  if (cost.windowStartedAt === undefined) return { ...cost, windowStartedAt: nowMs };
  const elapsed = nowMs - cost.windowStartedAt;
  if (elapsed < WINDOW_MS) return cost;
  // Scaled by the second that happened rather than the one that was asked for,
  // so a tab that stopped being scheduled does not report its backlog as a rate.
  const perSecond = WINDOW_MS / elapsed;
  return {
    msPerSecond: cost.windowMs * perSecond,
    patchesPerSecond: cost.windowPatches * perSecond,
    worstMs: cost.windowWorstMs,
    windowStartedAt: nowMs,
    windowMs: 0,
    windowPatches: 0,
    windowWorstMs: 0
  };
}

export function recordSnapshot(cost: SnapshotCost, ms: number, nowMs: number): SnapshotCost {
  const spent = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const rolled = advanceSnapshotCost(cost, nowMs);
  return {
    ...rolled,
    windowMs: rolled.windowMs + spent,
    windowPatches: rolled.windowPatches + 1,
    windowWorstMs: Math.max(rolled.windowWorstMs, spent)
  };
}
