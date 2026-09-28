/**
 * Real time in, whole simulation steps out.
 *
 * The step is fixed at 60 Hz and a panel refreshes at whatever it refreshes at,
 * so the two have to be kept apart: a 30 Hz television takes two steps in a
 * frame, a 144 Hz monitor takes one every other frame, and the game runs at the
 * same speed on both.
 */
export interface StepClock {
  /** Whole steps owed for the time since the last call. */
  readonly stepsFor: (now: number) => number;
  /**
   * Forget the gap: used after a pause, so it is not replayed as a burst. The
   * part of a step already carried is kept, so the drawn hull resumes where it
   * stood rather than a fraction of a step back.
   */
  readonly reset: (now: number) => void;
  /**
   * How far the newest step is ahead of the last `now`, in steps: the frame is
   * drawn at the run's tick minus this. See `leadMs`.
   */
  readonly ahead: () => number;
}

/**
 * Never spend more than this on one frame.
 *
 * A device that stalled for a second must not try to make the second up at
 * once: that is the frame after a stall being the most expensive one, which
 * stalls it again. Dropping the remainder makes game time run slower than the
 * wall clock on hardware that cannot keep up, which is the honest outcome - and
 * for a single player, nobody else's clock disagrees.
 */
const MAX_STEPS_PER_FRAME = 5;

export interface StepClockOptions {
  readonly maxSteps?: number;
  /**
   * How far ahead of real time the run is stepped.
   *
   * A panel faster than the step draws two or three frames per step, and a hull
   * drawn on its newest step stands still for those frames and then jumps - the
   * camera with it, so the whole screen shakes. Drawing it between its two
   * newest steps needs a step that is not yet due; stepping one step early
   * gives it one, at the instant the frame is for, so smoothing the hull costs
   * no input latency. A run in a worker adds the time a step takes to reach
   * the page.
   */
  readonly leadMs?: number;
}

export function createStepClock(stepMs: number, options: StepClockOptions = {}): StepClock {
  const maxSteps = options.maxSteps ?? MAX_STEPS_PER_FRAME;
  const leadMs = options.leadMs ?? 0;
  let last: number | undefined;
  // The lead is owed from the start: the first step comes that much early.
  let carried = leadMs;

  return {
    stepsFor(now) {
      if (last === undefined) {
        last = now;
        return 0;
      }
      carried += now - last;
      last = now;
      if (carried < stepMs) return 0;

      const owed = Math.floor(carried / stepMs);
      if (owed > maxSteps) {
        carried = 0;
        return maxSteps;
      }
      carried -= owed * stepMs;
      return owed;
    },
    reset(now) {
      last = now;
    },
    ahead: () => (leadMs - carried) / stepMs
  };
}
