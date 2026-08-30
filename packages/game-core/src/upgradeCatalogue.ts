import type { GameplayRole, UpgradeId } from "./combatTypes.ts";
import type { ShipStatEffect } from "./shipStats.ts";

export interface UpgradeDefinition {
  readonly role: GameplayRole;
  readonly label: string;
  /** The number the label states, published on the card so clients need no table. */
  readonly value: number;
  /** What the module does to the ship, as data the stat engine applies. */
  readonly effects: readonly ShipStatEffect[];
}

/**
 * One entry per upgrade: the card a crew sees and the effect it buys, kept in
 * the same place so a label can never drift from the number it promises.
 *
 * The effects are data rather than code on purpose. A percent joins the other
 * percents on its field and a multiplier joins the other multipliers, so the
 * same set of modules always produces the same ship whatever order it was
 * bought in — and adding a module is an entry here, not a new field on the
 * wire and a new multiplication in the simulation.
 */
export const UPGRADE_CATALOGUE: Readonly<Record<UpgradeId, UpgradeDefinition>> = {
  pilot_speed: {
    role: "pilot",
    label: "Maximum speed +10%",
    value: 0.1,
    effects: [{ target: "spaceshipSpeedPerSecond", op: "percent", value: 0.1 }]
  },
  pilot_acceleration: {
    role: "pilot",
    label: "Acceleration +12%",
    value: 0.12,
    effects: [{ target: "spaceshipAccelerationPerSecondSquared", op: "percent", value: 0.12 }]
  },
  pilot_hull: {
    role: "pilot",
    label: "Hull +25 and repair 25",
    value: 25,
    // The repair is not a second effect: a rising maximum always repairs by
    // exactly what it added. See the hull rule where stats are recomputed.
    effects: [{ target: "spaceshipMaxHp", op: "add", value: 25 }]
  },
  gunner_damage: {
    role: "gunner",
    label: "Damage +15%",
    value: 0.15,
    effects: [{ target: "friendlyProjectileDamage", op: "percent", value: 0.15 }]
  },
  gunner_cooldown: {
    role: "gunner",
    label: "Cooldown -10%",
    value: 0.1,
    // A multiplier rather than a percent, because that is how it compounded
    // before it became data: two of them make 0.81 of the base, not 0.8.
    effects: [{ target: "fireCooldownTicks", op: "multiply", value: 0.9 }]
  },
  gunner_projectile_speed: {
    role: "gunner",
    label: "Projectile speed +12%",
    value: 0.12,
    effects: [{ target: "projectileSpeedPerSecond", op: "percent", value: 0.12 }]
  },
  shield_capacity: {
    role: "shield",
    label: "Capacity +20",
    value: 20,
    effects: [{ target: "shieldCapacity", op: "add", value: 20 }]
  },
  shield_recharge: {
    role: "shield",
    label: "Recharge +15%",
    value: 0.15,
    effects: [{ target: "shieldRechargePerSecond", op: "percent", value: 0.15 }]
  },
  shield_arc: {
    role: "shield",
    label: "Arc width +10 degrees",
    value: Math.PI / 18,
    effects: [{ target: "shieldArcRadians", op: "add", value: Math.PI / 18 }]
  }
};

/** Every effect the crew has paid for, in purchase order. */
export function effectsOf(upgrades: readonly UpgradeId[]): readonly ShipStatEffect[] {
  return upgrades.flatMap((upgradeId) => UPGRADE_CATALOGUE[upgradeId].effects);
}

/** Offer pools are derived from the catalogue, so a new entry joins its role's pool. */
export const UPGRADE_IDS_BY_ROLE: Readonly<Record<GameplayRole, readonly UpgradeId[]>> = {
  pilot: upgradeIdsFor("pilot"),
  gunner: upgradeIdsFor("gunner"),
  shield: upgradeIdsFor("shield")
};

function upgradeIdsFor(role: GameplayRole): readonly UpgradeId[] {
  return (Object.keys(UPGRADE_CATALOGUE) as UpgradeId[]).filter(
    (id) => UPGRADE_CATALOGUE[id].role === role
  );
}
