/**
 * What each panel on the battle screen costs, one panel at a time.
 *
 * The whole-tree stopwatch beside this one says React spent six milliseconds a
 * second; it never says on what. Six milliseconds spread over eight panels is
 * nothing worth moving, and six milliseconds inside one of them is a panel to
 * rewrite - and the two look identical from outside.
 *
 * So every panel gets its own `<Profiler>` and reports here under a name. The
 * reference prototype does exactly this and it is what let it say its radar
 * cost 0.798 ms a frame from DOM against 0.059 ms from a canvas, instead of
 * arguing about whether DOM is slow.
 *
 * One warning that the numbers carry and this comment repeats: React's Profiler
 * reports the render, not what the browser then does with it. Style, layout and
 * paint happen after React returns. A panel that renders in 0.4 ms and forces a
 * 9 ms layout reads as cheap here and as a dropped frame in the frame counter.
 * The frame counter stays the verdict; this only says where to look.
 */

const WINDOW_MS = 1_000;

export interface ComponentCost {
  readonly id: string;
  /** Commits in the last completed second. */
  readonly commits: number;
  /** Render time across those commits, ms. */
  readonly msPerSecond: number;
  /** The longest single commit of that second. */
  readonly worstMs: number;
}

interface Accumulator {
  commits: number;
  totalMs: number;
  worstMs: number;
}

const live = new Map<string, Accumulator>();
let windowStartedAt: number | undefined;
let latest: readonly ComponentCost[] = [];

/** Wire into a `<Profiler onRender>`; the extra arguments are React's, not ours. */
export function recordComponentCommit(id: string, actualDurationMs: number): void {
  let slot = live.get(id);
  if (slot === undefined) {
    slot = { commits: 0, totalMs: 0, worstMs: 0 };
    live.set(id, slot);
  }
  slot.commits += 1;
  slot.totalMs += actualDurationMs;
  if (actualDurationMs > slot.worstMs) slot.worstMs = actualDurationMs;
}

/**
 * The last completed second, dearest first.
 *
 * Sorted here rather than in the panel because the order is the reading: the
 * question this instrument answers is which panel to open next.
 */
export function readComponentCosts(nowMs: number): readonly ComponentCost[] {
  if (windowStartedAt === undefined) {
    windowStartedAt = nowMs;
    return latest;
  }
  const elapsed = nowMs - windowStartedAt;
  if (elapsed < WINDOW_MS) return latest;

  // Scaled by the second that actually happened, so a tab that stopped being
  // scheduled does not report its backlog as a rate.
  const perSecond = WINDOW_MS / elapsed;
  const closed: ComponentCost[] = [];
  live.forEach((slot, id) => {
    closed.push({
      id,
      commits: slot.commits * perSecond,
      msPerSecond: slot.totalMs * perSecond,
      worstMs: slot.worstMs
    });
  });
  closed.sort((left, right) => right.msPerSecond - left.msPerSecond);

  latest = closed;
  live.clear();
  windowStartedAt = nowMs;
  return latest;
}

/** A fresh page between measurements; the meter outlives any one run. */
export function resetComponentCosts(): void {
  live.clear();
  windowStartedAt = undefined;
  latest = [];
}
