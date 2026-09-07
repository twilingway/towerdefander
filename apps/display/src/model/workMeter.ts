/**
 * One stopwatch, for any repeated piece of work on the main thread.
 *
 * The frame counter says a frame ran long; it cannot say what ran in it. So the
 * suspects get timed one at a time - turning a patch into a view, React
 * committing that view - and each reports the same three numbers.
 *
 * Milliseconds a second is the unit that answers the question, because a count
 * alone never does: a tenth of a millisecond twenty times over is nothing, and
 * eight milliseconds twenty times over is a sixth of the thread before a single
 * sprite has moved. The worst single sample rides along, because a stall and a
 * steady tax are different complaints.
 */

const WINDOW_MS = 1_000;

export interface WorkMeter {
  /** Milliseconds of the last completed second this work took. */
  readonly msPerSecond: number;
  /** How many samples landed in it, so the cost can be read per sample too. */
  readonly samplesPerSecond: number;
  /** The most expensive single sample of that second. */
  readonly worstMs: number;
  /**
   * Undefined until the first sample, rather than zero: `performance.now()` is
   * legitimately zero at the top of a page's life, and a sentinel a real clock
   * can produce is a window that never starts.
   */
  readonly windowStartedAt: number | undefined;
  readonly windowMs: number;
  readonly windowSamples: number;
  readonly windowWorstMs: number;
}

export function createWorkMeter(): WorkMeter {
  return {
    msPerSecond: 0,
    samplesPerSecond: 0,
    worstMs: 0,
    windowStartedAt: undefined,
    windowMs: 0,
    windowSamples: 0,
    windowWorstMs: 0
  };
}

/** Closes the window when it is due, so a quiet second reads as zero. */
export function advanceWork(meter: WorkMeter, nowMs: number): WorkMeter {
  if (!Number.isFinite(nowMs)) return meter;
  if (meter.windowStartedAt === undefined) return { ...meter, windowStartedAt: nowMs };
  const elapsed = nowMs - meter.windowStartedAt;
  if (elapsed < WINDOW_MS) return meter;
  // Scaled by the second that happened rather than the one that was asked for,
  // so a tab that stopped being scheduled does not report its backlog as a rate.
  const perSecond = WINDOW_MS / elapsed;
  return {
    msPerSecond: meter.windowMs * perSecond,
    samplesPerSecond: meter.windowSamples * perSecond,
    worstMs: meter.windowWorstMs,
    windowStartedAt: nowMs,
    windowMs: 0,
    windowSamples: 0,
    windowWorstMs: 0
  };
}

export function recordWork(meter: WorkMeter, ms: number, nowMs: number): WorkMeter {
  const spent = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const rolled = advanceWork(meter, nowMs);
  return {
    ...rolled,
    windowMs: rolled.windowMs + spent,
    windowSamples: rolled.windowSamples + 1,
    windowWorstMs: Math.max(rolled.windowWorstMs, spent)
  };
}
