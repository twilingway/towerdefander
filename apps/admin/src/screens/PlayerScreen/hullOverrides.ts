import { SHIP_STAT_FIELDS } from "@spaceship-defender/protocol";
import type {
  BalanceTuning,
  FriendlyWeaponKind,
  ShipArchetype,
  ShipStatField
} from "@spaceship-defender/protocol";

type ShipStatOverrides = ShipArchetype["overrides"]["stats"];

/**
 * The player screen edits one hull at a time.
 *
 * The flat block is the base every hull inherits; a hull names only what it
 * changes. So the screen shows base plus diff, and an edit goes back into the
 * diff — a number typed back to its base value stops being a difference at all,
 * which is the only way the sparse list stays sparse while someone is tuning.
 */
export function hullTuning(tuning: BalanceTuning, hull: ShipArchetype): BalanceTuning {
  return {
    ...tuning,
    ...hull.overrides.stats,
    cannonWeaponKind: hull.overrides.cannonWeaponKind ?? tuning.cannonWeaponKind,
    mgWeaponKind: hull.overrides.mgWeaponKind ?? tuning.mgWeaponKind
  };
}

/** How many fields this hull refuses to inherit; the switcher names the count. */
export function overrideCount(hull: ShipArchetype): number {
  const kinds = [hull.overrides.cannonWeaponKind, hull.overrides.mgWeaponKind];
  return Object.keys(hull.overrides.stats).length + kinds.filter((kind) => kind !== null).length;
}

export function withHullEdit(
  tuning: BalanceTuning,
  hullId: string,
  values: Partial<BalanceTuning>
): BalanceTuning {
  const hull = tuning.shipArchetypes[hullId];
  if (hull === undefined) return tuning;
  let stats = hull.overrides.stats;
  for (const field of SHIP_STAT_FIELDS) {
    const value = values[field];
    if (value === undefined) continue;
    stats = value === tuning[field] ? withoutStat(stats, field) : { ...stats, [field]: value };
  }
  return {
    ...tuning,
    shipArchetypes: {
      ...tuning.shipArchetypes,
      [hullId]: {
        ...hull,
        overrides: {
          stats,
          cannonWeaponKind: nextKind(
            values.cannonWeaponKind,
            tuning.cannonWeaponKind,
            hull.overrides.cannonWeaponKind
          ),
          mgWeaponKind: nextKind(
            values.mgWeaponKind,
            tuning.mgWeaponKind,
            hull.overrides.mgWeaponKind
          )
        }
      }
    }
  };
}

function nextKind(
  edited: FriendlyWeaponKind | undefined,
  base: FriendlyWeaponKind,
  current: FriendlyWeaponKind | null
): FriendlyWeaponKind | null {
  if (edited === undefined) return current;
  return edited === base ? null : edited;
}

function withoutStat(stats: ShipStatOverrides, field: ShipStatField): ShipStatOverrides {
  return Object.fromEntries(Object.entries(stats).filter(([name]) => name !== field));
}
