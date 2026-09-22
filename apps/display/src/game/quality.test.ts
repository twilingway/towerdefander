import { describe, expect, it } from "vitest";

import {
  nextAutoQuality,
  QUALITY_FALLBACK_SAMPLES,
  QUALITY_SETTINGS,
  readQualityChoice
} from "./quality.js";

const slow = Array.from({ length: QUALITY_FALLBACK_SAMPLES }, () => 38);

describe("quality levels", () => {
  it("keeps everything on high and paces only low", () => {
    expect(QUALITY_SETTINGS.high).toEqual({
      vectors: true,
      muzzleFlashes: true,
      exhaust: true,
      floorFill: true,
      frameCap: 60
    });
    expect(QUALITY_SETTINGS.mid.frameCap).toBe(60);
    expect(QUALITY_SETTINGS.low.frameCap).toBe(30);
  });

  it("steps down one level after a run of slow samples", () => {
    expect(nextAutoQuality("high", slow)).toBe("mid");
    expect(nextAutoQuality("mid", slow)).toBe("low");
  });

  it("leaves mid alone near fifty, where low measured no smoother", () => {
    const nearFifty = slow.map(() => 47);
    expect(nextAutoQuality("high", nearFifty)).toBe("mid");
    expect(nextAutoQuality("mid", nearFifty)).toBe("mid");
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
