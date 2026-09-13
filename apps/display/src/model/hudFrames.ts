import { HUD_ARTS } from "@spaceship-defender/sprite-assets";

const URLS = new Map<string, string>(HUD_ARTS.map((art) => [art.id, art.url]));

/**
 * Address of a built HUD frame by its asset id. Undefined only in a build that
 * ships without it, and a frame panel then draws its numbers on nothing rather
 * than on a broken image.
 */
export function hudFrameUrl(id: string): string | undefined {
  return URLS.get(id);
}
