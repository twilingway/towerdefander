import { describe, expect, it } from "vitest";
import type { FxEffect } from "@spaceship-defender/fx-assets";

import { formatBytes, frameForElapsed, playbackProgress, spriteFrameStyle } from "./playback.js";

function effect(overrides: Partial<FxEffect> = {}): FxEffect {
  return {
    id: "test",
    title: "Тест",
    category: "explosion",
    hint: "",
    oriented: false,
    loop: false,
    bytes: 1024,
    url: "sheet.png",
    meta: {
      frameWidth: 40,
      frameHeight: 20,
      cols: 3,
      rows: 2,
      frames: 6,
      fps: 10,
      duration: 0.6
    },
    ...overrides
  };
}

describe("frame from elapsed time", () => {
  it("advances at the sheet's own rate", () => {
    const fx = effect();
    expect(frameForElapsed(fx, 0)).toBe(0);
    expect(frameForElapsed(fx, 0.09)).toBe(0);
    expect(frameForElapsed(fx, 0.1)).toBe(1);
    expect(frameForElapsed(fx, 0.35)).toBe(3);
  });

  it("holds the last frame of a one-shot", () => {
    // A burst that snapped back to an empty first cell would read as a loop
    // that never happened.
    const fx = effect();
    expect(frameForElapsed(fx, 10)).toBe(5);
  });

  it("wraps a loop", () => {
    const fx = effect({ loop: true });
    expect(frameForElapsed(fx, 0.6)).toBe(0);
    expect(frameForElapsed(fx, 0.7)).toBe(1);
  });

  it("stays on the first frame for a still sheet or a stopped clock", () => {
    expect(frameForElapsed(effect({ meta: { ...effect().meta, frames: 1 } }), 5)).toBe(0);
    expect(frameForElapsed(effect({ meta: { ...effect().meta, fps: 0 } }), 5)).toBe(0);
    expect(frameForElapsed(effect(), -3)).toBe(0);
  });
});

describe("sprite frame window", () => {
  it("scales the sheet and the offset together", () => {
    // The window shows one cell of a background scaled as a whole; if the two
    // scaled by different amounts the preview would show parts of two frames.
    const style = spriteFrameStyle(effect(), 4, 2);
    expect(style.width).toBe("80px");
    expect(style.height).toBe("40px");
    expect(style.backgroundSize).toBe("240px 80px");
    // Frame 4 of a 3-wide grid is row 1, column 1.
    expect(style.backgroundPosition).toBe("-80px -40px");
  });

  it("points at the effect's own atlas", () => {
    expect(spriteFrameStyle(effect(), 0).backgroundImage).toBe("url(sheet.png)");
  });
});

describe("readouts", () => {
  it("fills the scrubber across the sheet", () => {
    expect(playbackProgress(effect(), 0)).toBe(0);
    expect(playbackProgress(effect(), 5)).toBe(1);
  });

  it("prints kilobytes below a megabyte and megabytes above", () => {
    expect(formatBytes(427_026)).toBe("417 КБ");
    expect(formatBytes(2_202_010)).toBe("2.1 МБ");
  });
});
