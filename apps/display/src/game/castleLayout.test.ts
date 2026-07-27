import { describe, expect, it } from "vitest";

import {
  BATTLEFIELD_HEIGHT,
  BATTLEFIELD_WIDTH,
  CASTLE_LAYOUT,
  CASTLE_LAYOUT_CATALOG,
  EnvironmentLayerController,
  SUPPORTED_PLAYER_CAPACITIES,
  getCastleEnvironmentAsset,
  getCastleLayout,
  getLanePoint,
  transitionEnvironmentLayer
} from "./castleLayout.js";

describe("castle battlefield layout", () => {
  it("provides one complete manifest for every capacity", () => {
    expect(Object.keys(CASTLE_LAYOUT_CATALOG).map(Number)).toEqual([
      ...SUPPORTED_PLAYER_CAPACITIES
    ]);

    for (const capacity of SUPPORTED_PLAYER_CAPACITIES) {
      const layout = getCastleLayout(capacity);

      expect(layout.playerCapacity).toBe(capacity);
      expect(layout.sectors).toHaveLength(capacity);
      expect(layout.sectors.map(({ sectorId }) => sectorId)).toEqual(
        Array.from({ length: capacity }, (_, sectorId) => sectorId)
      );
    }
  });

  it("keeps every road and critical anchor within the layout contract", () => {
    for (const capacity of SUPPORTED_PLAYER_CAPACITIES) {
      for (const sector of getCastleLayout(capacity).sectors) {
        const [start, , , end] = sector.lane;
        const distanceToPerimeter = Math.min(start.x, 1 - start.x, start.y, 1 - start.y);

        expect(distanceToPerimeter).toBeLessThanOrEqual(0.03);
        expect(end).toBe(sector.gate);

        for (const anchor of [sector.gate, sector.tower, sector.label, sector.effect]) {
          expect(anchor.x).toBeGreaterThanOrEqual(0.03);
          expect(anchor.x).toBeLessThanOrEqual(0.97);
          expect(anchor.y).toBeGreaterThanOrEqual(0.08);
          expect(anchor.y).toBeLessThanOrEqual(0.9);
        }
      }
    }
  });

  it("maps authoritative progress to the selected sector gate for every capacity", () => {
    for (const capacity of SUPPORTED_PLAYER_CAPACITIES) {
      for (const sector of getCastleLayout(capacity).sectors) {
        const start = getLanePoint(capacity, sector.sectorId, 0, 100);
        const gate = getLanePoint(capacity, sector.sectorId, 100, 100);

        expect(start).toEqual({
          x: sector.lane[0].x * BATTLEFIELD_WIDTH,
          y: sector.lane[0].y * BATTLEFIELD_HEIGHT
        });
        expect(gate).toEqual({
          x: sector.gate.x * BATTLEFIELD_WIDTH,
          y: sector.gate.y * BATTLEFIELD_HEIGHT
        });
      }
    }
  });

  it("selects the two-road WebP only for capacity two", () => {
    expect(getCastleEnvironmentAsset(2)).toEqual({
      key: "castle-environment-v1",
      url: "/assets/castle-environment-v1.webp"
    });

    for (const capacity of [3, 4, 5, 6] as const) {
      expect(getCastleEnvironmentAsset(capacity)).toBeNull();
    }
  });

  it("moves both sectors from opposite edges toward their own castle gates", () => {
    const leftStart = getLanePoint(2, 0, 0, 100);
    const leftMiddle = getLanePoint(2, 0, 50, 100);
    const leftGate = getLanePoint(2, 0, 100, 100);
    const rightStart = getLanePoint(2, 1, 0, 100);
    const rightMiddle = getLanePoint(2, 1, 50, 100);
    const rightGate = getLanePoint(2, 1, 100, 100);

    expect(leftStart.x).toBeCloseTo(0.02 * BATTLEFIELD_WIDTH);
    expect(leftGate.x).toBeCloseTo(CASTLE_LAYOUT[0].gate.x * BATTLEFIELD_WIDTH);
    expect(leftMiddle.x).toBeGreaterThan(leftStart.x);
    expect(leftMiddle.x).toBeLessThan(leftGate.x);

    expect(rightStart.x).toBeCloseTo(0.98 * BATTLEFIELD_WIDTH);
    expect(rightGate.x).toBeCloseTo(CASTLE_LAYOUT[1].gate.x * BATTLEFIELD_WIDTH);
    expect(rightMiddle.x).toBeLessThan(rightStart.x);
    expect(rightMiddle.x).toBeGreaterThan(rightGate.x);
    expect(leftGate.y).toBeCloseTo(0.56 * BATTLEFIELD_HEIGHT);
    expect(rightGate.y).toBeCloseTo(0.56 * BATTLEFIELD_HEIGHT);
  });

  it("clamps invalid progress to the authored lane", () => {
    expect(getLanePoint(6, 0, -20, 100)).toEqual(getLanePoint(6, 0, 0, 100));
    expect(getLanePoint(6, 5, 120, 100)).toEqual(getLanePoint(6, 5, 100, 100));
    expect(getLanePoint(6, 0, 50, 0)).toEqual(getLanePoint(6, 0, 0, 100));
  });

  it("rejects a sector outside the selected manifest", () => {
    expect(() => getLanePoint(3, 3, 0, 100)).toThrow(RangeError);
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
