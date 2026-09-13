/**
 * What a built sprite is, on both sides of the wall: the display loads it into
 * Phaser, the console and the ship tiles draw it into SVG. Neither knows how the
 * pixels were produced.
 */
export interface SpriteArt {
  readonly id: string;
  /** Size of the committed file; the build's own test holds it to the file. */
  readonly bytes: number;
  /** Resolved by the bundler at build time; hand this to a loader as-is. */
  readonly url: string;
  /** The whole texture in pixels. Both sides are powers of two, so it mipmaps. */
  readonly width: number;
  readonly height: number;
  /** One cell of the grid; cells run left to right from the top-left corner. */
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frames: number;
}

/**
 * A sky picture. One image drawn about screen size and never minified far, so it
 * keeps its own size: no grid, no power-of-two sides, and no mipmaps - the
 * mechanism that once drew a moving line across the old tiled sky.
 */
export interface BackdropArt {
  readonly id: string;
  readonly bytes: number;
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

/**
 * An interface frame: a finished picture laid over the arena, built at twice the
 * size it takes on a 1080p screen. One image each, with no grid, and never
 * minified far enough to want mipmaps.
 */
export interface HudArt {
  readonly id: string;
  readonly bytes: number;
  readonly url: string;
  readonly width: number;
  readonly height: number;
}
