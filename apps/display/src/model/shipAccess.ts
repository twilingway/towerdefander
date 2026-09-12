import type { PublicShip } from "@spaceship-defender/protocol";

/**
 * Which hulls the prototype actually flies.
 *
 * The catalogue publishes three, and only the Guardian is balanced and drawn
 * well enough to hand a player right now. The other two stay on the screen
 * rather than being filtered out: a tile that says "скоро" tells a player the
 * game has more in it, and an empty grid does not.
 */
export const UNLOCKED_SHIP_IDS: readonly string[] = ["guardian"];

export function isShipUnlocked(ship: PublicShip): boolean {
  return UNLOCKED_SHIP_IDS.includes(ship.id);
}

/** The hull a screen should start on: the first unlocked one the server offers. */
export function defaultUnlockedShipId(
  ships: readonly PublicShip[],
  serverDefaultId: string | undefined
): string | undefined {
  if (serverDefaultId !== undefined && UNLOCKED_SHIP_IDS.includes(serverDefaultId)) {
    return serverDefaultId;
  }
  return ships.find((ship) => isShipUnlocked(ship))?.id ?? serverDefaultId;
}
