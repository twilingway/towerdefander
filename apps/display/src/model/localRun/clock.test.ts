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
    const clock = createStepClock(STEP_MS, 5);
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
});
