import { publicShipCatalogueSchema, type PublicShipCatalogue } from "@spaceship-defender/protocol";

/**
 * The hulls the display offers before a room exists.
 *
 * The display never reads the balance preset, so the names and the pitches come
 * from the one public route the server exposes. The catalogue is fetched once,
 * on the create screen, and a failure is not fatal: the room is created without
 * naming a hull and the server falls back to the preset's own default.
 */
export function toHttpOrigin(gameServerUrl: string): string {
  return gameServerUrl.replace(/^ws/u, "http").replace(/\/+$/u, "");
}

export async function fetchShipCatalogue(
  gameServerUrl: string,
  signal: AbortSignal
): Promise<PublicShipCatalogue | undefined> {
  try {
    const response = await fetch(`${toHttpOrigin(gameServerUrl)}/ships`, { signal });
    if (!response.ok) return undefined;
    const parsed = publicShipCatalogueSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
