import { describe, expect, it } from "vitest";

import {
  createPlaybackDelayEstimate,
  observePatchArrival,
  playbackDelayMs
} from "./playbackDelay.js";

/** Feeds a stream of gaps and returns where the estimate settles. */
function settle(gaps: readonly number[], repeats = 60) {
  let estimate = createPlaybackDelayEstimate();
  let now = 1_000;
  for (let round = 0; round < repeats; round += 1) {
    for (const gap of gaps) {
      now += gap;
      estimate = observePatchArrival(estimate, now);
    }
  }
  return estimate;
}

describe("playback delay", () => {
  it("measures no interval from a single arrival", () => {
    const first = observePatchArrival(createPlaybackDelayEstimate(), 1_000);

    expect(first.intervalMs).toBe(50);
    expect(first.jitterMs).toBe(0);
  });

  it("settles on the pace the room actually keeps", () => {
    // What a host timer quantised to 15.625 ms does to a fifty millisecond
    // broadcast: sixty-two and a half, not fifty.
    const estimate = settle([62.5]);

    expect(estimate.intervalMs).toBeCloseTo(62.5, 1);
    expect(estimate.jitterMs).toBeLessThan(1);
  });

  it("buys more slack on an uneven stream than on an even one", () => {
    const even = playbackDelayMs(settle([62.5]));
    const uneven = playbackDelayMs(settle([31, 94, 62, 63]));

    expect(uneven).toBeGreaterThan(even);
  });

  it("keeps a fast even stream near the floor and a slow one well above it", () => {
    // The reference prototype's own pace: thirty-three millisecond broadcast.
    expect(playbackDelayMs(settle([33]))).toBe(83);
    expect(playbackDelayMs(settle([62.5]))).toBeGreaterThan(150);
  });

  it("refuses to be moved by a stall or a clock that went backwards", () => {
    const steady = settle([62.5]);
    const stalled = observePatchArrival(steady, (steady.lastArrivalMs ?? 0) + 5_000);
    const backwards = observePatchArrival(steady, (steady.lastArrivalMs ?? 0) - 10);

    expect(stalled.intervalMs).toBe(steady.intervalMs);
    expect(backwards.intervalMs).toBe(steady.intervalMs);
    // The arrival still counts as the moment to measure the next gap from.
    expect(stalled.lastArrivalMs).not.toBe(steady.lastArrivalMs);
  });

  it("never buys so much that a crew cannot aim, however bad the link", () => {
    expect(playbackDelayMs(settle([400, 900, 500]))).toBe(320);
  });
});
