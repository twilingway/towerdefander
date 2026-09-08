import type { PublicShip } from "@spaceship-defender/protocol";

import { PREVIEW_ENDLESS_TIER, PREVIEW_MODULE_TIERS } from "./preview/moduleTree.js";

export interface ModuleTree {
  readonly tiers: PublicShip["tiers"];
  readonly endlessTier: PublicShip["endlessTier"];
}

/**
 * Which tree the crew is walking: this run's hull out of the catalogue, or the
 * fixture when the preview has no server to ask.
 */
export function selectModuleTree(
  ships: readonly PublicShip[] | undefined,
  shipArchetypeId: string | undefined,
  preview: boolean
): ModuleTree | undefined {
  const hull = ships?.find((ship) => ship.id === shipArchetypeId);
  if (hull !== undefined) return { tiers: hull.tiers, endlessTier: hull.endlessTier };
  if (!preview) return undefined;
  return { tiers: PREVIEW_MODULE_TIERS, endlessTier: PREVIEW_ENDLESS_TIER };
}
