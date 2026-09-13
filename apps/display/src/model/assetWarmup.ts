import { FX_EFFECTS } from "@spaceship-defender/fx-assets";
import { BACKDROP_ARTS, HUD_ARTS, SPRITE_ARTS } from "@spaceship-defender/sprite-assets";

import { audioBus } from "../audio/AudioBus.js";

/**
 * Every picture a fight may draw: the catalogue's sprite sheets, the backdrops,
 * the HUD frames and the effect atlases. Phaser and the HUD ask for these same
 * addresses once a run starts, and find them in the browser's cache.
 */
export function fightImageUrls(): readonly string[] {
  return [...SPRITE_ARTS, ...BACKDROP_ARTS, ...HUD_ARTS, ...FX_EFFECTS].map((asset) => asset.url);
}

/** One picture fetched and decoded. A picture that fails is as finished as one that loaded. */
export async function warmImage(
  url: string,
  createImage: () => Pick<HTMLImageElement, "src" | "decode"> = () => new Image()
): Promise<void> {
  const image = createImage();
  image.src = url;
  try {
    await image.decode();
  } catch {
    // The fight draws without it, as it did before anything waited for it.
  }
}

let warming: Promise<void> | undefined;

/**
 * Everything the fight draws and plays, loaded once per page: the pictures,
 * and the sounds decoded into buffers. Settles when all of it has loaded or
 * failed, which is when the screen tells its room it is ready.
 */
export function warmFightAssets(): Promise<void> {
  warming ??= Promise.all([
    ...fightImageUrls().map((url) => warmImage(url)),
    audioBus().preload()
  ]).then(() => undefined);
  return warming;
}
