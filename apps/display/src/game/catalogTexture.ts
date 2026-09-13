import type Phaser from "phaser";
import { getVisualAsset, type VisualSpriteAsset } from "@spaceship-defender/protocol";
import { SPRITE_ARTS } from "@spaceship-defender/sprite-assets";

/** Bakes a drawing centred on zero and hands back its texture key. */
export type BakeShape = (
  key: string,
  half: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void
) => string;

/** Where a whole sprite sheet sits in the texture cache; the stamps cut from it are keyed by their callers. */
export function spriteSheetKey(id: string): string {
  return `spriteSheet:${id}`;
}

/**
 * Queues every built sprite on the scene's loader. Called from `preload`, so the
 * sheets are in the cache before the first hull is created - a hull is on screen
 * from the first frame and cannot wait for a late load the way a burst can.
 *
 * A file that fails to load never reaches the cache, and `bakeCatalogArt` then
 * draws the fallback silhouette in its place: nothing waits and nothing throws.
 */
export function preloadSpriteArt(scene: Phaser.Scene): void {
  for (const art of SPRITE_ARTS) {
    const key = spriteSheetKey(art.id);
    if (scene.textures.exists(key)) continue;
    scene.load.spritesheet(key, art.url, {
      frameWidth: art.frameWidth,
      frameHeight: art.frameHeight,
      endFrame: art.frames - 1
    });
  }
}

/**
 * Which cell of a sheet an entity shows: an FNV-1a hash of its id. Every display
 * sees the same id, so every display picks the same rock for the same asteroid,
 * and the rock does not change while the asteroid lives.
 */
export function spriteFrameFor(seed: string, frames: number): number {
  if (frames <= 1) return 0;
  return fnv1a(seed) % frames;
}

/** Radians per second a rock may tumble at; the band the reference art was shown with. */
const ASTEROID_SPIN_MIN = 0.22;
const ASTEROID_SPIN_MAX = 0.84;

/**
 * How a rock tumbles: a starting angle, a rate and a direction, all from the
 * same hash of its id. Every display sees the same id and the same clock, so
 * every display turns the same rock the same way. Purely a look - the
 * simulation never turns an asteroid, and its hitbox is a circle.
 */
export function asteroidSpinFor(seed: string): { readonly phase: number; readonly rate: number } {
  const hash = fnv1a(seed);
  const phase = ((hash & 0xffff) / 0x10000) * Math.PI * 2;
  const speed =
    ASTEROID_SPIN_MIN +
    (((hash >>> 16) & 0x7fff) / 0x8000) * (ASTEROID_SPIN_MAX - ASTEROID_SPIN_MIN);
  return { phase, rate: hash >>> 31 === 0 ? speed : -speed };
}

function fnv1a(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The normalisation `drawCatalogAsset` applies to geometry, applied to a cell. */
export function spriteScale(asset: VisualSpriteAsset, worldRadius: number): number {
  return (worldRadius / asset.radius) * asset.scaleHint;
}

export interface CatalogArt {
  readonly shape: string;
  /** Radius the art should occupy in the world, model scale already applied. */
  readonly worldRadius: number;
  /** What picks the cell of a multi-cell sheet; the entity id where there is one. */
  readonly seed?: string;
}

/**
 * A catalogue asset as a texture key, whichever kind of asset it is.
 *
 * A vector asset is baked exactly as before: `drawVector` into a `Graphics`,
 * once per key. A sprite is stamped from its loaded sheet into a texture of the
 * same size, turned and scaled the way the geometry would have been - nose from
 * up to +X, normalised by the asset's radius - so a caller keeps placing and
 * rotating a plain image and never learns which kind it got. A sprite whose
 * sheet did not load falls through to `drawVector`, which draws the fallback.
 */
export function bakeCatalogArt(
  scene: Phaser.Scene,
  bake: BakeShape,
  art: CatalogArt,
  key: string,
  half: number,
  drawVector: (graphics: Phaser.GameObjects.Graphics) => void
): string {
  const asset = getVisualAsset(art.shape);
  if (asset.kind !== "sprite" || !scene.textures.exists(spriteSheetKey(asset.id))) {
    return bake(key, half, drawVector);
  }
  const frame = spriteFrameFor(art.seed ?? "", asset.sprite.frames);
  const stampKey = `${key}:sprite:${String(frame)}`;
  if (scene.textures.exists(stampKey)) return stampKey;
  const size = Math.max(2, Math.ceil(half * 2));
  const texture = scene.textures.addDynamicTexture(stampKey, size, size);
  if (texture === null) return bake(key, half, drawVector);
  texture
    .stamp(spriteSheetKey(asset.id), frame, texture.width / 2, texture.height / 2, {
      rotation: Math.PI / 2,
      scale: spriteScale(asset, art.worldRadius)
    })
    .render();
  return stampKey;
}
