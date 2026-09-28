import { describe, expect, it } from "vitest";

import type { PredictedPoseFrame } from "../shipPrediction.js";
import { createPoseTrack } from "./poseTrack.js";

const pose = (x: number, heading = 0): PredictedPoseFrame =>
  ({ x, y: 0, heading, turretAngle: heading, velocityX: x }) as PredictedPoseFrame;

describe("createPoseTrack", () => {
  it("draws the hull between the two steps around the tick", () => {
    const track = createPoseTrack();
    track.push(10, pose(100));
    track.push(11, pose(110));

    const drawn = track.sample(10.25);

    expect(drawn?.tick).toBe(10.25);
    expect(drawn?.pose.x).toBeCloseTo(102.5, 9);
    // Rates are read, not drawn: they come from the newer step.
    expect(drawn?.pose.velocityX).toBe(110);
  });

  it("turns the short way across the seam", () => {
    const track = createPoseTrack();
    track.push(0, pose(0, Math.PI - 0.1));
    track.push(1, pose(0, -Math.PI + 0.1));

    const heading = track.sample(0.5)?.pose.heading ?? 0;

    expect(Math.abs(Math.abs(heading) - Math.PI)).toBeLessThan(1e-9);
  });

  it("holds the ends rather than guessing past them", () => {
    const early = createPoseTrack();
    early.push(5, pose(50));
    early.push(6, pose(60));
    expect(early.sample(2)).toEqual({ pose: pose(50), tick: 5 });

    const late = createPoseTrack();
    late.push(5, pose(50));
    late.push(6, pose(60));
    expect(late.sample(7.5)).toEqual({ pose: pose(60), tick: 6 });
  });

  it("keeps a third step, for a lead that runs past the frame's", () => {
    const track = createPoseTrack();
    for (let tick = 0; tick < 6; tick += 1) track.push(tick, pose(tick * 10));

    expect(track.sample(2)?.tick).toBe(3);
    expect(track.sample(3.5)?.tick).toBe(3.5);
    expect(track.sample(3.5)?.pose.x).toBeCloseTo(35, 9);
  });

  /*
   * A run that has stopped stepping while the frame clock still turns asks for
   * a tick that saws back and forth under its newest step; a stale anchor for
   * one frame after a pause asks for the newest step and then for one before
   * it. Either way the hull - and the camera - would step backwards.
   */
  it("never draws an earlier tick than it drew last in the same run", () => {
    const track = createPoseTrack();
    track.push(10, pose(100));
    track.push(11, pose(110));

    expect(track.sample(10.8)?.tick).toBe(10.8);
    expect(track.sample(10.1)?.tick).toBe(10.8);
    expect(track.sample(10.1)?.pose.x).toBeCloseTo(108, 9);
    expect(track.sample(10.9)?.tick).toBe(10.9);
  });

  it("spans a batch of several steps as one move", () => {
    const track = createPoseTrack();
    track.push(10, pose(100));
    track.push(13, pose(130));

    expect(track.sample(11)?.pose.x).toBeCloseTo(110, 9);
  });

  it("does not sweep a placed hull across the field", () => {
    const track = createPoseTrack();
    track.push(10, pose(100));
    track.push(11, pose(2000));

    expect(track.sample(10.1)?.pose.x).toBe(2000);
  });

  it("starts over when the run does", () => {
    const track = createPoseTrack();
    track.push(90, pose(900));
    track.push(91, pose(910));
    track.sample(90.5);

    track.push(0, pose(0));
    track.push(1, pose(10));

    // Not held at 90.5 from the last run.
    expect(track.sample(0.5)?.tick).toBe(0.5);
    expect(track.sample(0.5)?.pose.x).toBeCloseTo(5, 9);
  });

  it("takes a repeated step as a fresher word on the same step", () => {
    const track = createPoseTrack();
    track.push(3, pose(30));
    track.push(4, pose(40));
    track.push(4, pose(41));

    expect(track.sample(3.5)?.pose.x).toBeCloseTo(35.5, 9);
  });
});
