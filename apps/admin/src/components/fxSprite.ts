import { getFxFrameOffset, type FxEffect } from "@spaceship-defender/fx-assets";

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
