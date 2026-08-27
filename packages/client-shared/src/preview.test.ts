import { describe, expect, it } from "vitest";

import { isPreviewMode, previewPhaseLabel, PREVIEW_PHASES } from "./preview.js";

describe("isPreviewMode", () => {
  it("opens only for a dev build asked for it", () => {
    expect(isPreviewMode("?preview=1", true)).toBe(true);
  });

  it("stays closed in a production build", () => {
    expect(isPreviewMode("?preview=1", false)).toBe(false);
  });

  it("stays closed without the parameter", () => {
    expect(isPreviewMode("", true)).toBe(false);
  });

  it("stays closed for an unrelated parameter", () => {
    expect(isPreviewMode("?room=ABC123", true)).toBe(false);
  });
});

describe("previewPhaseLabel", () => {
  it("names every phase the switches offer", () => {
    expect(PREVIEW_PHASES.map(previewPhaseLabel)).toEqual(["Лобби", "Бой", "Передышка", "Итог"]);
  });
});
