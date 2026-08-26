import { VISUAL_ASSETS, getVisualAsset } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import {
  SPACESHIP_WORLD_RADIUS,
  assetReach,
  modelWorldRadius,
  previewScale,
  shapeReach
} from "./enemyShapes.js";

describe("preview geometry", () => {
  it("measures a reach for every asset the catalogue carries", () => {
    for (const asset of VISUAL_ASSETS) {
      expect(assetReach(asset), `asset ${asset.id} measures nothing`).toBeGreaterThan(0);
      expect(shapeReach(asset.id), `asset ${asset.id} has no relative reach`).toBeGreaterThan(0);
    }
  });

  it("expresses reach relative to the asset's own nominal radius", () => {
    const spear = getVisualAsset("ship-spear");
    expect(shapeReach("ship-spear")).toBeCloseTo(
      (assetReach(spear) / spear.radius) * spear.scaleHint
    );
    // Fins and rings routinely stick out past the collision circle; without that
    // the preview could never warn about a model wider than its frame.
    expect(VISUAL_ASSETS.filter((asset) => shapeReach(asset.id) > 1)).not.toHaveLength(0);
  });

  it("falls back rather than throwing on an id this build does not carry", () => {
    expect(shapeReach("ship-from-the-future")).toBeCloseTo(shapeReach("ship-spear"));
  });

  it("keeps the rings still when only the model scale changes", () => {
    const box = 148;
    const plain = previewScale(28, 1, "ship-spear", box);
    const grown = previewScale(28, 2.6, "ship-spear", box);
    // Same hit radius means the same view scale: the rings must not move.
    expect(grown.factor).toBeCloseTo(plain.factor);
    expect(plain.modelOverflows).toBe(false);
    expect(grown.modelOverflows).toBe(true);
  });

  it("scales the view with the hit radius so bigger enemies read bigger", () => {
    const box = 148;
    // Below the player hull the reference keeps the scale fixed for comparison.
    expect(previewScale(20, 1, "ship-spear", box).factor).toBeCloseTo(
      previewScale(40, 1, "ship-spear", box).factor
    );
    // Past it, the hitbox drives the zoom and stays inside the frame.
    const boss = previewScale(90, 1, "boss-dreadnought", box);
    expect(boss.factor).toBeLessThan(previewScale(52, 1, "boss-dreadnought", box).factor);
    expect(90 * boss.factor).toBeLessThanOrEqual(box * 0.46 + 1e-9);
  });

  it("keeps both rings and their labels inside the frame", () => {
    const box = 148;
    const half = box * 0.46;
    for (const hitRadius of [8, 18, 28, 52, 90, 400]) {
      const { factor } = previewScale(hitRadius, 1, "ship-spear", box);
      expect(hitRadius * factor, `hit ring escapes at ${String(hitRadius)}`).toBeLessThan(half);
      expect(
        SPACESHIP_WORLD_RADIUS * factor,
        `ship ring escapes at ${String(hitRadius)}`
      ).toBeLessThan(half);
    }
  });

  it("reports the world radius the model occupies", () => {
    expect(modelWorldRadius(28, 2.6)).toBe(73);
    expect(modelWorldRadius(28, 1)).toBe(28);
  });
});
