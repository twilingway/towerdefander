import { describe, expect, it } from "vitest";

import {
  FALLBACK_VISUAL_ASSET_ID,
  VISUAL_ASSETS,
  VISUAL_ASSET_CATEGORIES,
  VISUAL_ASSET_IDS,
  VISUAL_PALETTE,
  getVisualAsset,
  getVisualAssetsByCategory,
  isVisualAssetId,
  type VisualColor,
  type VisualLayer
} from "./visualCatalog.js";

const PALETTE_KEYS = new Set<string>(Object.keys(VISUAL_PALETTE));

function colorsOf(layer: VisualLayer): readonly VisualColor[] {
  return "fill" in layer ? [layer.fill, layer.stroke] : [layer.stroke];
}

describe("visual asset catalogue", () => {
  it("keeps the id tuple in step with the assets it describes", () => {
    // The tuple is hand-written so the balance schema can be a z.enum; this is
    // the guard that stops it drifting from the geometry it names.
    expect(VISUAL_ASSETS.map((entry) => entry.id)).toEqual([...VISUAL_ASSET_IDS]);
    expect(new Set(VISUAL_ASSET_IDS).size).toBe(VISUAL_ASSET_IDS.length);
    expect(VISUAL_ASSETS).toHaveLength(70);
  });

  it("numbers assets from one without gaps", () => {
    expect(VISUAL_ASSETS.map((entry) => entry.index)).toEqual(
      VISUAL_ASSETS.map((_, position) => position + 1)
    );
  });

  it("gives every asset geometry that can be normalised", () => {
    for (const entry of VISUAL_ASSETS) {
      expect(entry.radius, entry.id).toBeGreaterThan(0);
      expect(entry.scaleHint, entry.id).toBeGreaterThan(0);
      expect(entry.layers.length, entry.id).toBeGreaterThan(0);
    }
  });

  it("paints only with colours a renderer can resolve", () => {
    for (const entry of VISUAL_ASSETS) {
      for (const layer of entry.layers) {
        for (const color of colorsOf(layer)) {
          if (typeof color === "number") {
            expect(Number.isInteger(color), entry.id).toBe(true);
            continue;
          }
          expect(color === "accent" || PALETTE_KEYS.has(color), `${entry.id}: ${color}`).toBe(true);
        }
      }
    }
  });

  it("fills every category the console offers as a filter", () => {
    for (const category of VISUAL_ASSET_CATEGORIES) {
      expect(getVisualAssetsByCategory(category).length, category).toBeGreaterThan(0);
    }
    expect(
      VISUAL_ASSET_CATEGORIES.reduce(
        (total, category) => total + getVisualAssetsByCategory(category).length,
        0
      )
    ).toBe(VISUAL_ASSETS.length);
  });

  it("resolves an unknown id to the fallback instead of leaving nothing to draw", () => {
    expect(getVisualAsset("boss-mothership").name).toBe("Материнский корабль");
    expect(getVisualAsset("no-such-asset").id).toBe(FALLBACK_VISUAL_ASSET_ID);
    expect(isVisualAssetId("no-such-asset")).toBe(false);
    expect(isVisualAssetId(FALLBACK_VISUAL_ASSET_ID)).toBe(true);
  });
});
