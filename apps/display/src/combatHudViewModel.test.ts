import { describe, expect, it } from "vitest";

import {
  createRadarProjection,
  getResourcePercent,
  projectWorldToRadar
} from "./combatHudViewModel.js";

describe("combat HUD view model", () => {
  it("clamps resource percentages and handles zero capacity", () => {
    expect(getResourcePercent(40, 100)).toBe(40);
    expect(getResourcePercent(140, 100)).toBe(100);
    expect(getResourcePercent(-10, 100)).toBe(0);
    expect(getResourcePercent(10, 0)).toBe(0);
  });

  it("projects the world center and arena cardinal points into the radar circle", () => {
    const projection = createRadarProjection(2_200);

    expect(projectWorldToRadar(2_200, 2_200, 4_400, 4_400, projection)).toEqual({
      x: 100,
      y: 100
    });
    expect(projectWorldToRadar(4_400, 2_200, 4_400, 4_400, projection)).toEqual({
      x: 188,
      y: 100
    });
    expect(projectWorldToRadar(2_200, 0, 4_400, 4_400, projection)).toEqual({
      x: 100,
      y: 12
    });
  });
});
