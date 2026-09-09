import type { FxEffect } from "@spaceship-defender/fx-assets";

// Moved to components/ when the archetype editor became its second consumer;
// re-exported so a screen that only wants "one cell of a sheet" still has it
// here beside the rest of the preview's own maths.
export { spriteFrameStyle, type SpriteFrameStyle } from "../../components/fxSprite.js";

/**
 * Which cell of the atlas is showing at a given moment. A loop wraps; a one-shot
 * holds its last frame, so a burst stays readable after it has played instead of
 * snapping back to an empty first cell.
 */
export function frameForElapsed(effect: FxEffect, elapsedSeconds: number): number {
  const { frames, fps } = effect.meta;
  if (!(fps > 0) || frames <= 1) return 0;
  const step = Math.floor(Math.max(0, elapsedSeconds) * fps);
  return effect.loop ? step % frames : Math.min(step, frames - 1);
}

/** How much of the atlas has been shown, 0..1, for the scrubber's fill. */
export function playbackProgress(effect: FxEffect, frame: number): number {
  if (effect.meta.frames <= 1) return 1;
  return frame / (effect.meta.frames - 1);
}

/** `1.2 МБ` / `418 КБ` — the console's own readout, so it stays in Russian. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${String(Math.round(bytes / 1024))} КБ`;
}
