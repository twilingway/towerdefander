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
  /** Forget the gap: used after a pause, so it is not replayed as a burst. */
  readonly reset: (now: number) => void;
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

export function createStepClock(stepMs: number, maxSteps = MAX_STEPS_PER_FRAME): StepClock {
  let last: number | undefined;
  let carried = 0;

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
      carried = 0;
    }
  };
}
