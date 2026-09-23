import { describe, expect, it } from "vitest";

import {
  drawRateCap,
  nextAutoQuality,
  QUALITY_FALLBACK_SAMPLES,
  QUALITY_SETTINGS,
  readQualityChoice
} from "./quality.js";

const slow = Array.from({ length: QUALITY_FALLBACK_SAMPLES }, () => 38);

describe("quality levels", () => {
  it("keeps every effect on high and mid, and paces mid and low", () => {
    const everything = {
      vectors: true,
      muzzleFlashes: true,
      exhaust: true,
      floorFill: true
    };
    expect(QUALITY_SETTINGS.high).toEqual({ ...everything, frameCap: 60 });
    expect(QUALITY_SETTINGS.mid).toEqual({ ...everything, frameCap: 30 });
    expect(QUALITY_SETTINGS.low.frameCap).toBe(30);
    expect(QUALITY_SETTINGS.low.muzzleFlashes).toBe(false);
  });

  it("steps down one level after a run of slow samples", () => {
    expect(nextAutoQuality("high", slow)).toBe("mid");
    expect(
      nextAutoQuality(
        "mid",
        slow.map(() => 20)
      )
    ).toBe("low");
  });

  it("leaves a mid that holds its paced 30 alone", () => {
    const paced = slow.map(() => 28.5);
    expect(nextAutoQuality("high", paced)).toBe("mid");
    expect(nextAutoQuality("mid", paced)).toBe("mid");
  });

  it("never steps below low, whose rate is paced on purpose", () => {
    expect(
      nextAutoQuality(
        "low",
        slow.map(() => 20)
      )
    ).toBe("low");
  });

  it("holds while any sample in the window was fast or missing", () => {
    expect(nextAutoQuality("high", slow.slice(1))).toBe("high");
    expect(nextAutoQuality("high", [...slow.slice(1), 58])).toBe("high");
    expect(nextAutoQuality("high", [...slow.slice(1), 0])).toBe("high");
  });

  it("takes the address over the saved choice, and the saved over automatic", () => {
    expect(readQualityChoice("?quality=low", "high")).toBe("low");
    expect(readQualityChoice("", "mid")).toBe("mid");
    expect(readQualityChoice("?quality=ultra", "nonsense")).toBe("auto");
  });
});

describe("the draw rate", () => {
  it("holds a device without a mouse to 60, and leaves a computer its panel's rate", () => {
    expect(drawRateCap(QUALITY_SETTINGS.high, false)).toBe(60);
    expect(drawRateCap(QUALITY_SETTINGS.high, true)).toBeUndefined();
  });

  it("keeps the low level's 30 on every device", () => {
    expect(drawRateCap(QUALITY_SETTINGS.low, false)).toBe(30);
    expect(drawRateCap(QUALITY_SETTINGS.low, true)).toBe(30);
  });
});
