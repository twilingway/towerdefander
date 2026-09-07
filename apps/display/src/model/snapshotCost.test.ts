import { describe, expect, it } from "vitest";

import { advanceSnapshotCost, createSnapshotCost, recordSnapshot } from "./snapshotCost.js";

describe("snapshotCost", () => {
  it("adds up the second the patches actually cost", () => {
    let cost = advanceSnapshotCost(createSnapshotCost(), 0);
    for (let index = 0; index < 20; index += 1) {
      cost = recordSnapshot(cost, 8, index * 50);
    }

    cost = advanceSnapshotCost(cost, 1_000);

    // Twenty patches at eight milliseconds is 160 ms of every second - sixteen
    // percent of the thread before a sprite has moved.
    expect(cost.msPerSecond).toBe(160);
    expect(cost.patchesPerSecond).toBe(20);
    expect(cost.worstMs).toBe(8);
  });

  it("keeps the worst single conversion, not just the sum", () => {
    let cost = advanceSnapshotCost(createSnapshotCost(), 0);
    cost = recordSnapshot(cost, 1, 100);
    cost = recordSnapshot(cost, 24, 200);
    cost = recordSnapshot(cost, 1, 300);

    cost = advanceSnapshotCost(cost, 1_000);

    expect(cost.msPerSecond).toBe(26);
    expect(cost.worstMs).toBe(24);
  });

  it("falls back to zero over a second with no patches", () => {
    let cost = advanceSnapshotCost(createSnapshotCost(), 0);
    cost = recordSnapshot(cost, 5, 100);
    cost = advanceSnapshotCost(cost, 1_000);
    expect(cost.msPerSecond).toBe(5);

    cost = advanceSnapshotCost(cost, 2_000);

    expect(cost.msPerSecond).toBe(0);
    expect(cost.patchesPerSecond).toBe(0);
  });

  it("scales by the second that happened, not the one asked for", () => {
    let cost = advanceSnapshotCost(createSnapshotCost(), 0);
    cost = recordSnapshot(cost, 100, 50);

    cost = advanceSnapshotCost(cost, 4_000);

    expect(cost.msPerSecond).toBe(25);
  });
});
