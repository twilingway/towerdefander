import { describe, expect, it } from "vitest";

import { createStepClock } from "./clock.js";

const STEP_MS = 1000 / 60;

describe("createStepClock", () => {
  it("owes nothing on its first call, having no previous frame to measure from", () => {
    const clock = createStepClock(STEP_MS);

    expect(clock.stepsFor(1000)).toBe(0);
  });

  it("hands out whole steps and carries the remainder", () => {
    const clock = createStepClock(STEP_MS);
    clock.stepsFor(0);

    // 25 ms is one step and a half; the half waits for the next frame.
    expect(clock.stepsFor(25)).toBe(1);
    expect(clock.stepsFor(35)).toBe(1);
  });

  it("gives a slow panel two steps a frame and a fast one every other frame", () => {
    const slow = createStepClock(STEP_MS);
    slow.stepsFor(0);
    expect(slow.stepsFor(33.4)).toBe(2);

    const fast = createStepClock(STEP_MS);
    fast.stepsFor(0);
    expect(fast.stepsFor(7)).toBe(0);
    expect(fast.stepsFor(14)).toBe(0);
    expect(fast.stepsFor(21)).toBe(1);
  });

  /*
   * The frame after a stall must not be the most expensive one in the run, or
   * the stall repeats itself. What is dropped is game time, which on a device
   * nobody else's clock disagrees with.
   */
  it("drops the remainder after a long stall instead of replaying it", () => {
    const clock = createStepClock(STEP_MS, { maxSteps: 5 });
    clock.stepsFor(0);

    expect(clock.stepsFor(2000)).toBe(5);
    // And the next frame starts clean rather than still owing the stall.
    expect(clock.stepsFor(2016.7)).toBe(1);
  });

  it("forgets the gap when told to", () => {
    const clock = createStepClock(STEP_MS);
    clock.stepsFor(0);

    clock.reset(5000);

    expect(clock.stepsFor(5008)).toBe(0);
    expect(clock.stepsFor(5017)).toBe(1);
  });

  /*
   * One step of lead is what lets a fast panel draw the hull between its two
   * newest steps at the instant the frame is for: the step it moves towards is
   * already taken, and the frame sits `ahead` steps behind it.
   */
  it("steps a lead early and says how far the newest step is ahead", () => {
    const clock = createStepClock(STEP_MS, { leadMs: STEP_MS });
    clock.stepsFor(0);
    expect(clock.ahead()).toBe(0);

    // One step is taken at once - the one this frame moves towards.
    expect(clock.stepsFor(4)).toBe(1);
    expect(clock.ahead()).toBeCloseTo(1 - 4 / STEP_MS, 9);
    expect(clock.stepsFor(12)).toBe(0);
    expect(clock.ahead()).toBeCloseTo(1 - 12 / STEP_MS, 9);
    // The next is taken as the frame reaches the one before it.
    expect(clock.stepsFor(17)).toBe(1);
    expect(clock.ahead()).toBeCloseTo(1 - (17 - STEP_MS) / STEP_MS, 9);
  });

  it("resumes after a pause where the frame stood, a fraction of a step included", () => {
    const clock = createStepClock(STEP_MS, { leadMs: STEP_MS });
    clock.stepsFor(0);
    clock.stepsFor(10);
    const before = clock.ahead();

    clock.reset(60_000);

    expect(clock.ahead()).toBe(before);
    expect(clock.stepsFor(60_001)).toBe(0);
  });
});
