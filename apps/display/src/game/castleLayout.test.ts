import { describe, expect, it } from "vitest";

import {
  BATTLEFIELD_HEIGHT,
  BATTLEFIELD_WIDTH,
  CASTLE_LAYOUT,
  EnvironmentLayerController,
  getLanePoint,
  transitionEnvironmentLayer
} from "./castleLayout.js";

describe("castle battlefield layout", () => {
  it("moves both sectors from opposite edges toward their own castle gates", () => {
    const leftStart = getLanePoint(0, 0, 100);
    const leftMiddle = getLanePoint(0, 50, 100);
    const leftGate = getLanePoint(0, 100, 100);
    const rightStart = getLanePoint(1, 0, 100);
    const rightMiddle = getLanePoint(1, 50, 100);
    const rightGate = getLanePoint(1, 100, 100);

    expect(leftStart.x).toBeCloseTo(0.06 * BATTLEFIELD_WIDTH);
    expect(leftGate.x).toBeCloseTo(CASTLE_LAYOUT[0].gate.x * BATTLEFIELD_WIDTH);
    expect(leftMiddle.x).toBeGreaterThan(leftStart.x);
    expect(leftMiddle.x).toBeLessThan(leftGate.x);

    expect(rightStart.x).toBeCloseTo(0.97 * BATTLEFIELD_WIDTH);
    expect(rightGate.x).toBeCloseTo(CASTLE_LAYOUT[1].gate.x * BATTLEFIELD_WIDTH);
    expect(rightMiddle.x).toBeLessThan(rightStart.x);
    expect(rightMiddle.x).toBeGreaterThan(rightGate.x);
    expect(leftGate.y).toBeCloseTo(0.56 * BATTLEFIELD_HEIGHT);
    expect(rightGate.y).toBeCloseTo(0.56 * BATTLEFIELD_HEIGHT);
  });

  it("clamps invalid progress to the authored lane", () => {
    expect(getLanePoint(0, -20, 100)).toEqual(getLanePoint(0, 0, 100));
    expect(getLanePoint(1, 120, 100)).toEqual(getLanePoint(1, 100, 100));
    expect(getLanePoint(0, 50, 0)).toEqual(getLanePoint(0, 0, 100));
  });

  it("keeps late environment resolution terminal", () => {
    expect(transitionEnvironmentLayer("loading", "loaded")).toBe("ready");
    expect(transitionEnvironmentLayer("loading", "failed")).toBe("failed");
    expect(transitionEnvironmentLayer("ready", "failed")).toBe("ready");
    expect(transitionEnvironmentLayer("failed", "loaded")).toBe("failed");
  });

  it("publishes ready only after the late image factory succeeds", () => {
    const states: string[] = [];
    const controller = new EnvironmentLayerController((state) => states.push(state));
    let environmentCreated = false;

    controller.resolve(true, () => {
      environmentCreated = true;
    });

    expect(environmentCreated).toBe(true);
    expect(controller.state).toBe("ready");
    expect(states).toEqual(["ready"]);
  });

  it("keeps updates alive when loading or image creation fails", () => {
    for (const failure of ["load", "image"] as const) {
      const states: string[] = [];
      const controller = new EnvironmentLayerController((state) => states.push(state));
      let snapshotUpdates = 0;
      const updateSnapshot = () => {
        snapshotUpdates += 1;
      };

      updateSnapshot();
      controller.resolve(failure === "image", () => {
        throw new Error("GPU image creation failed.");
      });
      updateSnapshot();

      expect(controller.state).toBe("failed");
      expect(states).toEqual(["failed"]);
      expect(snapshotUpdates).toBe(2);
    }
  });
});
