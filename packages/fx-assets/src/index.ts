export * from "./types.ts";
export * from "./manifest.ts";

import { FX_CATEGORIES, type FxCategory, type FxEffect } from "./types.ts";
import { FX_EFFECTS } from "./manifest.ts";

const BY_ID = new Map<string, FxEffect>(FX_EFFECTS.map((effect) => [effect.id, effect]));

/** Undefined rather than a fallback: a missing effect is a bake that never ran. */
export function getFxEffect(id: string): FxEffect | undefined {
  return BY_ID.get(id);
}

export function getFxEffectsByCategory(category: FxCategory): readonly FxEffect[] {
  return FX_EFFECTS.filter((effect) => effect.category === category);
}

/** Categories that actually carry an effect, in `FX_CATEGORIES` order. */
export function getPopulatedFxCategories(): readonly FxCategory[] {
  return FX_CATEGORIES.filter((category) =>
    FX_EFFECTS.some((effect) => effect.category === category)
  );
}

/**
 * Top-left corner of one cell in the atlas, in pixels. The display gets this
 * from Phaser's own spritesheet loader; the console draws the cells itself.
 */
export function getFxFrameOffset(
  effect: FxEffect,
  frame: number
): { readonly x: number; readonly y: number } {
  const clamped = Math.min(Math.max(Math.trunc(frame), 0), effect.meta.frames - 1);
  return {
    x: (clamped % effect.meta.cols) * effect.meta.frameWidth,
    y: Math.floor(clamped / effect.meta.cols) * effect.meta.frameHeight
  };
}
