import type { BalanceTuning, PublicShipCatalogue } from "@spaceship-defender/protocol";

/**
 * The hulls a display offers before anyone joins: names and looks and the tree,
 * never the stats behind them.
 *
 * Kept here rather than inside the route handler because a device that plays
 * without a server draws the same tiles off its own preset. Two mappings would
 * mean a hull list on the setup screen that does not match the run.
 */
export function toPublicShipCatalogue(tuning: BalanceTuning): PublicShipCatalogue {
  return {
    ships: Object.entries(tuning.shipArchetypes).map(([id, hull]) => ({
      id,
      label: hull.label,
      description: hull.description,
      visual: hull.visual,
      unlockedAtWave: hull.unlockedAtWave,
      tiers: hull.tiers,
      endlessTier: hull.endlessTier
    })),
    defaultShipId: tuning.defaultShipArchetypeId
  };
}
