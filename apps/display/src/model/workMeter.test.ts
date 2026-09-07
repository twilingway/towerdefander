import { describe, expect, it } from "vitest";

import { advanceWork, createWorkMeter, recordWork } from "./workMeter.js";

describe("workMeter", () => {
  it("adds up the second the samples actually cost", () => {
    let meter = advanceWork(createWorkMeter(), 0);
    for (let index = 0; index < 20; index += 1) {
      meter = recordWork(meter, 8, index * 50);
    }

    meter = advanceWork(meter, 1_000);

    // Twenty samples at eight milliseconds is 160 ms of every second - a sixth
    // of the thread before a sprite has moved.
    expect(meter.msPerSecond).toBe(160);
    expect(meter.samplesPerSecond).toBe(20);
    expect(meter.worstMs).toBe(8);
  });

  it("keeps the worst single sample, not just the sum", () => {
    let meter = advanceWork(createWorkMeter(), 0);
    meter = recordWork(meter, 1, 100);
    meter = recordWork(meter, 24, 200);
    meter = recordWork(meter, 1, 300);

    meter = advanceWork(meter, 1_000);

    expect(meter.msPerSecond).toBe(26);
    expect(meter.worstMs).toBe(24);
  });

  it("falls back to zero over a second with no samples", () => {
    let meter = advanceWork(createWorkMeter(), 0);
    meter = recordWork(meter, 5, 100);
    meter = advanceWork(meter, 1_000);
    expect(meter.msPerSecond).toBe(5);

    meter = advanceWork(meter, 2_000);

    expect(meter.msPerSecond).toBe(0);
    expect(meter.samplesPerSecond).toBe(0);
  });

  it("scales by the second that happened, not the one asked for", () => {
    let meter = advanceWork(createWorkMeter(), 0);
    meter = recordWork(meter, 100, 50);

    meter = advanceWork(meter, 4_000);

    expect(meter.msPerSecond).toBe(25);
  });

  it("ignores a sample that is not a positive duration", () => {
    let meter = advanceWork(createWorkMeter(), 0);
    meter = recordWork(meter, Number.NaN, 100);
    meter = recordWork(meter, -3, 200);

    meter = advanceWork(meter, 1_000);

    expect(meter.msPerSecond).toBe(0);
    expect(meter.samplesPerSecond).toBe(2);
  });
});
