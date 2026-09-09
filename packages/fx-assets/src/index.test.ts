import { describe, expect, it } from "vitest";

import {
  FX_CATEGORIES,
  FX_CATEGORY_LABELS,
  FX_EFFECTS,
  getFxEffect,
  getFxEffectsByCategory,
  getFxFrameOffset,
  getPopulatedFxCategories
} from "./index.ts";

/**
 * The manifest is generated, so these guard the generator rather than a human:
 * a hand edit or a bake that wrote atlases without rewriting the manifest shows
 * up here. Whether the files themselves match is checked on disk by
 * `scripts/bake-fx-atlases.node-test.mjs`, which has Node's types.
 */
describe("effect manifest", () => {
  it("carries every effect the catalogue promises", () => {
    expect(FX_EFFECTS.length).toBeGreaterThan(0);
    const ids = FX_EFFECTS.map((effect) => effect.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("describes a grid that can hold its own frames", () => {
    for (const effect of FX_EFFECTS) {
      expect(effect.meta.frameWidth).toBeGreaterThan(0);
      expect(effect.meta.frameHeight).toBeGreaterThan(0);
      expect(effect.meta.frames).toBeGreaterThan(0);
      // Atlas.build clamps frames to cols*rows, so a manifest claiming more
      // frames than cells would be describing cells that were never drawn.
      expect(effect.meta.frames).toBeLessThanOrEqual(effect.meta.cols * effect.meta.rows);
      expect(effect.meta.fps).toBeGreaterThan(0);
      expect(effect.meta.duration).toBeGreaterThan(0);
      expect(effect.bytes).toBeGreaterThan(0);
      expect(effect.url).not.toBe("");
    }
  });

  it("uses only known categories, and labels all of them", () => {
    for (const effect of FX_EFFECTS) expect(FX_CATEGORIES).toContain(effect.category);
    for (const category of FX_CATEGORIES) expect(FX_CATEGORY_LABELS[category]).toBeTruthy();
  });

  it("has a plasma exhaust that loops and is oriented", () => {
    // The display rotates it to the heading and plays it on repeat; both flags
    // are what the catalogue page tells an operator about it.
    const exhaust = getFxEffect("plasma-exhaust");
    expect(exhaust?.loop).toBe(true);
    expect(exhaust?.oriented).toBe(true);
  });

  it("answers undefined for an effect that was never baked", () => {
    expect(getFxEffect("no-such-effect")).toBeUndefined();
  });
});

describe("catalogue queries", () => {
  it("groups by category without losing anything", () => {
    const grouped = FX_CATEGORIES.flatMap((category) => getFxEffectsByCategory(category));
    expect(grouped).toHaveLength(FX_EFFECTS.length);
  });

  it("lists populated categories in catalogue order", () => {
    const populated = getPopulatedFxCategories();
    const expected = FX_CATEGORIES.filter((category) =>
      FX_EFFECTS.some((effect) => effect.category === category)
    );
    expect(populated).toEqual(expected);
  });
});

describe("frame offsets", () => {
  const effect = FX_EFFECTS[0];

  it("walks left to right, then down a row", () => {
    if (effect === undefined) throw new Error("the manifest is empty");
    const { cols, frameWidth, frameHeight } = effect.meta;
    expect(getFxFrameOffset(effect, 0)).toEqual({ x: 0, y: 0 });
    expect(getFxFrameOffset(effect, 1)).toEqual({ x: frameWidth, y: 0 });
    expect(getFxFrameOffset(effect, cols)).toEqual({ x: 0, y: frameHeight });
  });

  it("clamps instead of reading past the sheet", () => {
    if (effect === undefined) throw new Error("the manifest is empty");
    const last = getFxFrameOffset(effect, effect.meta.frames - 1);
    expect(getFxFrameOffset(effect, effect.meta.frames + 99)).toEqual(last);
    expect(getFxFrameOffset(effect, -5)).toEqual({ x: 0, y: 0 });
  });
});
