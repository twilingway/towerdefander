import { describe, expect, it } from "vitest";

import { HUD_FRAME_CSS_VARIABLES, hudFrameUrl } from "./hudFrames.js";

describe("HUD frames", () => {
  it("finds every frame the skin draws by its asset id", () => {
    for (const id of ["ui-info", "ui-timer", "ui-status", "ui-radar", "ui-stick-left"]) {
      expect(hudFrameUrl(id), id).toBeTruthy();
    }
    expect(hudFrameUrl("ui-pause")).toBeUndefined();
  });

  it("hands the stylesheet the radar, the ring and both knobs as urls", () => {
    expect(Object.keys(HUD_FRAME_CSS_VARIABLES).sort()).toEqual([
      "--hud-knob-aim-art",
      "--hud-knob-move-art",
      "--hud-radar-art",
      "--hud-stick-ring-art"
    ]);
    for (const value of Object.values(HUD_FRAME_CSS_VARIABLES)) {
      expect(value).toMatch(/^url\(".+"\)$/);
    }
  });
});
