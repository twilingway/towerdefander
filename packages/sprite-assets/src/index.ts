export * from "./types.ts";
export * from "./manifest.ts";

import type { BackdropArt, SpriteArt } from "./types.ts";
import { BACKDROP_ARTS, SPRITE_ARTS } from "./manifest.ts";

const BY_ID = new Map<string, SpriteArt>(SPRITE_ARTS.map((art) => [art.id, art]));
const BACKDROPS_BY_ID = new Map<string, BackdropArt>(BACKDROP_ARTS.map((art) => [art.id, art]));

/** Undefined for `none` and for any picture this build does not ship. */
export function getBackdropArt(id: string): BackdropArt | undefined {
  return BACKDROPS_BY_ID.get(id);
}

/**
 * Undefined rather than a fallback: what stands in for missing art is the visual
 * catalogue's decision, not this package's.
 */
export function getSpriteArt(id: string): SpriteArt | undefined {
  return BY_ID.get(id);
}
