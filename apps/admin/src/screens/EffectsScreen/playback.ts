import { getFxFrameOffset, type FxEffect } from "@spaceship-defender/fx-assets";

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

export interface SpriteFrameStyle {
  readonly width: string;
  readonly height: string;
  readonly backgroundImage: string;
  readonly backgroundSize: string;
  readonly backgroundPosition: string;
}

/**
 * One cell of the sheet, shown through a window the size of that cell.
 *
 * A scaled background rather than a canvas: the browser already decodes and
 * filters the PNG, and stepping `background-position` costs nothing, so the
 * preview needs no image loading, no context and no per-frame draw call.
 */
export function spriteFrameStyle(effect: FxEffect, frame: number, scale = 1): SpriteFrameStyle {
  const { frameWidth, frameHeight, cols, rows } = effect.meta;
  const offset = getFxFrameOffset(effect, frame);
  const px = (value: number): string => `${String(Math.round(value * scale))}px`;
  return {
    width: px(frameWidth),
    height: px(frameHeight),
    backgroundImage: `url(${effect.url})`,
    backgroundSize: `${px(frameWidth * cols)} ${px(frameHeight * rows)}`,
    backgroundPosition: `-${px(offset.x)} -${px(offset.y)}`
  };
}

/** `1.2 МБ` / `418 КБ` — the console's own readout, so it stays in Russian. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${String(Math.round(bytes / 1024))} КБ`;
}
