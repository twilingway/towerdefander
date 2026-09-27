import { describe, expect, it } from "vitest";

import type { PredictedPoseFrame } from "../shipPrediction.js";
import { createLocalDriver, createRemoteDriver } from "./driver.js";
import type { LocalRun } from "./engine.js";

const pose = { x: 1, y: 2 } as PredictedPoseFrame;

/*
 * The page's own shells are born on the step its hull is drawn at, so a driver
 * has to report exactly that step - the one behind the pose it just handed out,
 * not a step later and not a stale one when it handed out nothing.
 */
describe("local drivers report the step of the pose they drew", () => {
  it("in the tab: the run's own step, after stepping it", () => {
    let tick = 40;
    let paused = false;
    const run = {
      step: () => {
        tick += 1;
      },
      pose: () => pose,
      tick: () => tick
    } as unknown as LocalRun;
    const driver = createLocalDriver({
      run,
      clock: { stepsFor: () => 2, reset: () => undefined },
      readIntent: () => ({}) as never,
      onStepped: () => undefined,
      paused: () => paused
    });

    expect(driver.drive()).toBe(pose);
    expect(driver.readShellClock()).toEqual({ own: 42, room: undefined });

    // Paused, the hull is not handed out, but shells in the air still need the
    // step it was last drawn on - or they jump back to the playback clock.
    paused = true;
    expect(driver.drive()).toBeUndefined();
    expect(driver.readShellClock().own).toBe(42);
  });

  it("from a worker: the step the posted pose belongs to", () => {
    const posted: { latest?: { pose: PredictedPoseFrame; tick: number } } = {};
    const driver = createRemoteDriver({
      latestPose: () => posted.latest,
      sendIntent: () => undefined,
      paused: () => false
    });

    expect(driver.drive()).toBeUndefined();
    expect(driver.readShellClock().own).toBeUndefined();

    posted.latest = { pose, tick: 77 };
    expect(driver.drive()).toBe(pose);
    expect(driver.readShellClock()).toEqual({ own: 77, room: undefined });
  });
});
