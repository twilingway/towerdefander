import { describe, expect, it } from "vitest";

import {
  createRadarProjection,
  getCurrentWaveUpgrade,
  getShieldStatusLabel,
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

describe("current wave upgrade", () => {
  const selection = { waveNumber: 3, upgradeId: "pilot_speed" } as const;

  it("presents the purchase in the wave it paid for", () => {
    expect(getCurrentWaveUpgrade(selection, 4)).toBe(selection);
  });

  it("hides a purchase that an older wave paid for", () => {
    expect(getCurrentWaveUpgrade(selection, 5)).toBeNull();
    expect(getCurrentWaveUpgrade(selection, 3)).toBeNull();
  });

  it("has nothing to present without a selection", () => {
    expect(getCurrentWaveUpgrade(null, 2)).toBeNull();
  });
});

describe("shield status label", () => {
  it("names the phase the crew is looking at", () => {
    expect(getShieldStatusLabel("up", false, 40)).toBe("АКТИВЕН");
    // The one that matters: a shield on its way up looks broken otherwise.
    expect(getShieldStatusLabel("raising", false, 100)).toBe("ПОДНИМАЕТСЯ");
    expect(getShieldStatusLabel("cooling", false, 12)).toBe("ОСТЫВАЕТ");
  });

  it("explains a shield that is down rather than calling it off", () => {
    expect(getShieldStatusLabel("down", true, 30)).toBe("НУЖЕН ПЕРЕВЗВОД");
    expect(getShieldStatusLabel("down", false, 0)).toBe("РАЗРЯЖЕН");
    expect(getShieldStatusLabel("down", false, 80)).toBe("выключен");
  });
});
