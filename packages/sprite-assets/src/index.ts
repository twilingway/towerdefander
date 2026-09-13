export * from "./types.ts";
export * from "./manifest.ts";

import type { SpriteArt } from "./types.ts";
import { SPRITE_ARTS } from "./manifest.ts";

const BY_ID = new Map<string, SpriteArt>(SPRITE_ARTS.map((art) => [art.id, art]));

/**
 * Undefined rather than a fallback: what stands in for missing art is the visual
 * catalogue's decision, not this package's.
 */
export function getSpriteArt(id: string): SpriteArt | undefined {
  return BY_ID.get(id);
}
