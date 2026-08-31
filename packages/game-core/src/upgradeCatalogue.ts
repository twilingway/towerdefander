import type { ModuleId, ShipModuleDefinition } from "./combatTypes.ts";
import type { ShipStatEffect } from "./shipStats.ts";

/**
 * Reading a run's purchases back into the effects they bought.
 *
 * The catalogue is no longer code: modules come from the hull the run is played
 * on, so the lookup is over that hull's tree plus its repeatable tail. A tail
 * module can be bought more than once, which is why this maps over the purchase
 * list rather than over the tree.
 */
export function effectsOf(
  purchasedModules: readonly ModuleId[],
  moduleTiers: readonly (readonly ShipModuleDefinition[])[],
  endlessTier: readonly ShipModuleDefinition[]
): readonly ShipStatEffect[] {
  if (purchasedModules.length === 0) return [];
  const byId = moduleIndex(moduleTiers, endlessTier);
  return purchasedModules.flatMap((id) => byId.get(id)?.effects ?? []);
}

/** The module a card names, or undefined when the tree no longer holds it. */
export function findModule(
  id: ModuleId,
  moduleTiers: readonly (readonly ShipModuleDefinition[])[],
  endlessTier: readonly ShipModuleDefinition[]
): ShipModuleDefinition | undefined {
  return moduleIndex(moduleTiers, endlessTier).get(id);
}

function moduleIndex(
  moduleTiers: readonly (readonly ShipModuleDefinition[])[],
  endlessTier: readonly ShipModuleDefinition[]
): ReadonlyMap<ModuleId, ShipModuleDefinition> {
  const byId = new Map<ModuleId, ShipModuleDefinition>();
  for (const tier of [...moduleTiers, endlessTier]) {
    for (const module of tier) byId.set(module.id, module);
  }
  return byId;
}
