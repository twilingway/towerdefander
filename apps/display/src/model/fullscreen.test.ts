import { describe, expect, it } from "vitest";

import { autoFullscreenEnabled, fullscreenSupported, isFullscreen } from "./fullscreen.js";

/**
 * Without a document there is nothing to make full screen, and these are read
 * during render - so each has to answer rather than throw.
 */
describe("full screen, where there is no browser", () => {
  it("reports it as unavailable instead of throwing", () => {
    expect(fullscreenSupported()).toBe(false);
    expect(isFullscreen()).toBe(false);
  });

  /** A phone arrives in full screen unless somebody has turned it off. */
  it("defaults to taking the screen", () => {
    expect(autoFullscreenEnabled()).toBe(true);
  });
});
