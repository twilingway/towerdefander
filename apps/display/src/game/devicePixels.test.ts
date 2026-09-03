import { describe, expect, it } from "vitest";

import { readPixelRatioCap } from "./devicePixels.js";
import { DEVICE_PIXEL_RATIO_CAP } from "./spaceshipViewModel.js";

describe("readPixelRatioCap", () => {
  it("takes the ceiling the address asks for", () => {
    // The knob exists so the ceiling can be chosen on the device that pays for
    // it, by walking the values against the frame counter.
    expect(readPixelRatioCap("?dpr=1")).toBe(1);
    expect(readPixelRatioCap("?dpr=1.5")).toBe(1.5);
    expect(readPixelRatioCap("?dpr=3&preview=1")).toBe(3);
  });

  it("ignores anything that is not a ceiling", () => {
    for (const search of ["", "?dpr=", "?dpr=0", "?dpr=-2", "?dpr=9", "?dpr=auto"]) {
      expect(readPixelRatioCap(search), search).toBe(DEVICE_PIXEL_RATIO_CAP);
    }
  });
});
