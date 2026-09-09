/**
 * What a baked effect is, on both sides of the wall: the display loads the atlas
 * into Phaser, the balance console draws the same cells into a canvas. Neither
 * knows anything about the editor that produced it.
 */

/** Where an effect belongs, and the order the console lists them in. */
export const FX_CATEGORIES = ["exhaust", "muzzle", "explosion", "destruction"] as const;
export type FxCategory = (typeof FX_CATEGORIES)[number];

export const FX_CATEGORY_LABELS: Record<FxCategory, string> = {
  exhaust: "Выхлоп",
  muzzle: "Выстрел",
  explosion: "Взрыв",
  destruction: "Разрушение"
};

/**
 * The grid the atlas was cut on. Written by `pnpm fx:bake` straight from the
 * editor's own `Atlas.build` report, so it always describes the PNG beside it.
 */
export interface FxAtlasMeta {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly cols: number;
  readonly rows: number;
  readonly frames: number;
  /** Frames per second the window was sampled at; the playback rate to use. */
  readonly fps: number;
  /** Seconds of effect time the window covers. */
  readonly duration: number;
}

export interface FxEffect {
  readonly id: string;
  readonly title: string;
  readonly category: FxCategory;
  readonly hint: string;
  /**
   * Authored pointing up (-Y) and meant to be rotated to face something. The
   * catalogue keeps one convention for all of them so a consumer needs one
   * rotation rule, not one per effect.
   */
  readonly oriented: boolean;
  /** The window closes on itself and can play on repeat. */
  readonly loop: boolean;
  /** Size of the committed PNG, for the console's own readout. */
  readonly bytes: number;
  /** Resolved by the bundler at build time; hand this to a loader as-is. */
  readonly url: string;
  readonly meta: FxAtlasMeta;
}
