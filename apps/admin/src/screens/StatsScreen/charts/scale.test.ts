import { describe, expect, it } from "vitest";

import { bandsOf, extentOf, formatNumber, heatShare, linePath, project, ticksOf } from "./scale.js";

describe("extentOf", () => {
  it("anchors at zero so a chart of counts is not misread", () => {
    expect(extentOf([4, 7, 9])).toEqual({ min: 0, max: 9 });
  });

  it("survives an empty series", () => {
    expect(extentOf([])).toEqual({ min: 0, max: 1 });
  });

  it("gives a flat series a span so nothing divides by zero", () => {
    expect(extentOf([3, 3, 3], false)).toEqual({ min: 3, max: 4 });
  });
});

describe("project", () => {
  it("maps the ends of the extent onto the ends of the span", () => {
    const extent = { min: 0, max: 10 };
    expect(project(0, extent, 100)).toBe(0);
    expect(project(10, extent, 100)).toBe(100);
    expect(project(5, extent, 100)).toBe(50);
  });
});

describe("ticksOf", () => {
  it("rounds the step up to a readable one rather than dividing exactly", () => {
    // 10/4 is 2.5, which is not a tick anyone reads; 5 is the next nice step.
    expect(ticksOf({ min: 0, max: 10 }, 4)).toEqual([0, 5, 10]);
    expect(ticksOf({ min: 0, max: 40 }, 4)).toEqual([0, 10, 20, 30, 40]);
  });

  it("never returns an empty axis", () => {
    expect(ticksOf({ min: 5, max: 5 })).toEqual([5]);
  });
});

describe("bandsOf", () => {
  it("splits the width evenly and leaves a gap between bars", () => {
    const bands = bandsOf(4, 400);
    expect(bands).toHaveLength(4);
    expect(bands[0]?.width).toBe(75);
    expect(bands[1]?.start).toBeGreaterThan((bands[0]?.start ?? 0) + (bands[0]?.width ?? 0));
    expect((bands[3]?.start ?? 0) + (bands[3]?.width ?? 0)).toBeLessThanOrEqual(400);
  });

  it("returns nothing for an empty series", () => {
    expect(bandsOf(0, 400)).toEqual([]);
  });
});

describe("linePath", () => {
  it("moves to the first point and draws to the rest", () => {
    expect(
      linePath([
        { x: 0, y: 10 },
        { x: 5, y: 0 }
      ])
    ).toBe("M0.00 10.00 L5.00 0.00");
  });

  it("draws nothing for an empty series", () => {
    expect(linePath([])).toBe("");
  });
});

describe("heatShare", () => {
  it("clamps outside the extent", () => {
    expect(heatShare(-5, { min: 0, max: 10 })).toBe(0);
    expect(heatShare(50, { min: 0, max: 10 })).toBe(1);
    expect(heatShare(5, { min: 0, max: 10 })).toBe(0.5);
  });
});

describe("formatNumber", () => {
  it("keeps integers whole and shortens thousands", () => {
    expect(formatNumber(7)).toBe("7");
    expect(formatNumber(7.25)).toBe("7.3");
    expect(formatNumber(1500)).toBe("1.5k");
    expect(formatNumber(Number.NaN)).toBe("—");
  });
});
