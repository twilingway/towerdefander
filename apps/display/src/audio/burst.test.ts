import { describe, expect, it } from "vitest";

import { createBurstTracker } from "./burst.js";

const BURST = { shots: 8, shotGapMs: 100 };
const SINGLE = { shots: 1, shotGapMs: 0 };

describe("keeping a burst sample on the gun", () => {
  /**
   * The bug this exists for: a three-second recording of eight rounds started
   * again on every trigger pull is eight overlapping bursts.
   */
  it("starts a burst once per the rounds it contains", () => {
    const tracker = createBurstTracker();
    const started = [];
    for (let shot = 0; shot < 17; shot += 1) {
      started.push(tracker.shot("machine-gun-alt", shot * 100, BURST) !== null);
    }
    expect(started.filter(Boolean)).toHaveLength(3);
    expect(started[0]).toBe(true);
    expect(started[8]).toBe(true);
    expect(started[16]).toBe(true);
  });

  /**
   * The answer to "what happens when rate of fire is upgraded": the recording
   * is stretched onto the rate actually being fired, so eight recorded rounds
   * still cover eight fired ones.
   */
  it("stretches the recording onto the rate actually being fired", () => {
    const tracker = createBurstTracker();
    // First burst at the recorded rate: nothing to stretch.
    expect(tracker.shot("machine-gun-alt", 0, BURST)?.rate).toBeCloseTo(1, 2);
    for (let shot = 1; shot < 8; shot += 1) tracker.shot("machine-gun-alt", shot * 50, BURST);
    // Twice as fast as recorded. The stretch is capped short of that on
    // purpose: past about 1.8x a sample stops sounding like the weapon it was
    // recorded from, it sounds like a smaller one. That ceiling is the reason
    // the machine gun ships as a single round instead of a burst - one round
    // per shot follows any rate of fire with nothing stretched at all.
    const faster = tracker.shot("machine-gun-alt", 8 * 50, BURST);
    expect(faster?.rate).toBeCloseTo(1.8, 2);
  });

  it("plays a single-round sample on every round, unstretched", () => {
    const tracker = createBurstTracker();
    for (const at of [0, 60, 120, 180]) {
      expect(tracker.shot("machine-gun", at, SINGLE)).toEqual({ rate: 1 });
    }
    // And never holds one open, so nothing has to be stopped.
    expect(tracker.settle(10_000)).toEqual([]);
  });

  it("releases a burst when the trigger stops", () => {
    const tracker = createBurstTracker();
    tracker.shot("machine-gun-alt", 0, BURST);
    tracker.shot("machine-gun-alt", 100, BURST);
    expect(tracker.settle(150)).toEqual([]);
    expect(tracker.settle(600)).toEqual(["machine-gun-alt"]);
    // And only once: a released burst is not released again every frame.
    expect(tracker.settle(900)).toEqual([]);
  });

  it("treats a long silence as a new burst rather than the middle of one", () => {
    const tracker = createBurstTracker();
    tracker.shot("machine-gun-alt", 0, BURST);
    tracker.shot("machine-gun-alt", 100, BURST);
    expect(tracker.shot("machine-gun-alt", 5_000, BURST)).not.toBeNull();
  });
});
