import { describe, expect, it } from "vitest";

import type { PredictedPoseFrame } from "../shipPrediction.js";
import { createLocalDriver, createRemoteDriver } from "./driver.js";
import type { LocalRun } from "./engine.js";
import { createPoseTrack } from "./poseTrack.js";

const poseAt = (x: number): PredictedPoseFrame =>
  ({ x, y: 0, heading: 0, turretAngle: 0 }) as PredictedPoseFrame;

/*
 * The page's own shells are born on the tick its hull is drawn at, so a driver
 * has to report exactly that tick - the fractional one between the two steps it
 * drew the hull between, not the newest step and not a stale one when it
 * handed out nothing.
 */
describe("local drivers draw the hull between steps and report that tick", () => {
  it("in the tab: a step early, drawn back by the clock's lead", () => {
    let tick = 40;
    let paused = false;
    let steps = 0;
    const run = {
      step: () => {
        tick += 1;
      },
      // A hull moving ten units a step.
      pose: () => poseAt(tick * 10),
      tick: () => tick
    } as unknown as LocalRun;
    const driver = createLocalDriver({
      run,
      clock: { stepsFor: () => steps, reset: () => undefined, ahead: () => 0.25 },
      readIntent: () => ({}) as never,
      onStepped: () => undefined,
      paused: () => paused
    });

    // Only one step held: nothing to draw between, so it is drawn whole.
    expect(driver.drive()?.x).toBe(400);
    expect(driver.readShellClock()).toEqual({ own: 40, room: undefined });

    steps = 1;
    expect(driver.drive()?.x).toBeCloseTo(407.5, 9);
    expect(driver.readShellClock()).toEqual({ own: 40.75, room: undefined });

    // Paused, the hull is not handed out, but shells in the air still need the
    // tick it was last drawn at - or they jump back to the playback clock.
    paused = true;
    expect(driver.drive()).toBeUndefined();
    expect(driver.readShellClock().own).toBe(40.75);
  });

  it("in the tab: a run that stopped stepping holds rather than saws", () => {
    // One last step, then settled: stepping is a no-op, but the frame clock
    // keeps turning and the frame's tick saws under the newest step.
    let tick = 39;
    const run = {
      step: () => {
        tick = 40;
      },
      pose: () => poseAt(tick * 10),
      tick: () => tick
    } as unknown as LocalRun;
    let ahead = 0.8;
    let steps = 0;
    const driver = createLocalDriver({
      run,
      clock: { stepsFor: () => steps, reset: () => undefined, ahead: () => ahead },
      readIntent: () => ({}) as never,
      onStepped: () => undefined,
      paused: () => false
    });
    driver.drive();
    steps = 1;
    const drawn: number[] = [];
    for (const next of [0.8, 0.3, 0.9, 0.2]) {
      ahead = next;
      driver.drive();
      drawn.push(driver.readShellClock().own ?? Number.NaN);
    }

    expect(drawn.map((value) => Math.round(value * 10) / 10)).toEqual([39.2, 39.7, 39.7, 39.8]);
  });

  it("in the tab: a restarted run is not drawn sweeping back from the last one", () => {
    let tick = 90;
    const run = {
      step: () => {
        tick += 1;
      },
      pose: () => poseAt(tick),
      tick: () => tick
    } as unknown as LocalRun;
    const driver = createLocalDriver({
      run,
      clock: { stepsFor: () => 0, reset: () => undefined, ahead: () => 0.5 },
      readIntent: () => ({}) as never,
      onStepped: () => undefined,
      paused: () => false
    });
    driver.drive();

    tick = 0;
    expect(driver.drive()?.x).toBe(0);
    expect(driver.readShellClock().own).toBe(0);
  });

  it("from a worker: at the tick the page's instant falls on", () => {
    const track = createPoseTrack();
    const at: { tick?: number } = {};
    const driver = createRemoteDriver({
      track,
      tickAt: () => at.tick,
      sendIntent: () => undefined,
      paused: () => false
    });

    expect(driver.drive()).toBeUndefined();
    expect(driver.readShellClock().own).toBeUndefined();

    track.push(76, poseAt(760));
    track.push(77, poseAt(770));
    at.tick = 76.4;
    expect(driver.drive()?.x).toBeCloseTo(764, 9);
    expect(driver.readShellClock()).toEqual({ own: 76.4, room: undefined });

    // The next step is late: the newest is held, not guessed past.
    at.tick = 77.3;
    expect(driver.drive()?.x).toBe(770);
    expect(driver.readShellClock().own).toBe(77);
  });
});
