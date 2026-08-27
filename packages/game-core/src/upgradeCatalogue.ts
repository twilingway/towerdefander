import type { GameplayRole, RoleModifiers, UpgradeId } from "./combatTypes.ts";

/** What one upgrade may change: role multipliers and, for the hull, max health. */
export interface UpgradeEffect {
  readonly roleModifiers: RoleModifiers;
  readonly maxHpBonus: number;
}

export interface UpgradeDefinition {
  readonly role: GameplayRole;
  readonly label: string;
  /** The number the label states, published on the card so clients need no table. */
  readonly value: number;
  readonly apply: (modifiers: RoleModifiers) => UpgradeEffect;
}

const noHullChange = (roleModifiers: RoleModifiers): UpgradeEffect => ({
  roleModifiers,
  maxHpBonus: 0
});

/**
 * One entry per upgrade: the card a crew sees and the effect it buys, kept in the
 * same place so a label can never drift from the number it promises. Adding an
 * upgrade is one entry here plus its id in the protocol enum.
 */
export const UPGRADE_CATALOGUE: Readonly<Record<UpgradeId, UpgradeDefinition>> = {
  pilot_speed: {
    role: "pilot",
    label: "Maximum speed +10%",
    value: 0.1,
    apply: (modifiers) =>
      noHullChange({
        ...modifiers,
        pilot: { ...modifiers.pilot, speedMultiplier: modifiers.pilot.speedMultiplier + 0.1 }
      })
  },
  pilot_acceleration: {
    role: "pilot",
    label: "Acceleration +12%",
    value: 0.12,
    apply: (modifiers) =>
      noHullChange({
        ...modifiers,
        pilot: {
          ...modifiers.pilot,
          accelerationMultiplier: modifiers.pilot.accelerationMultiplier + 0.12
        }
      })
  },
  pilot_hull: {
    role: "pilot",
    label: "Hull +25 and repair 25",
    value: 25,
    apply: (modifiers) => ({
      roleModifiers: {
        ...modifiers,
        pilot: { ...modifiers.pilot, maxHpBonus: modifiers.pilot.maxHpBonus + 25 }
      },
      maxHpBonus: 25
    })
  },
  gunner_damage: {
    role: "gunner",
    label: "Damage +15%",
    value: 0.15,
    apply: (modifiers) =>
      noHullChange({
        ...modifiers,
        gunner: { ...modifiers.gunner, damageMultiplier: modifiers.gunner.damageMultiplier + 0.15 }
      })
  },
  gunner_cooldown: {
    role: "gunner",
    label: "Cooldown -10%",
    value: 0.1,
    apply: (modifiers) =>
      noHullChange({
        ...modifiers,
        gunner: {
          ...modifiers.gunner,
          cooldownMultiplier: Math.max(0.25, modifiers.gunner.cooldownMultiplier * 0.9)
        }
      })
  },
  gunner_projectile_speed: {
    role: "gunner",
    label: "Projectile speed +12%",
    value: 0.12,
    apply: (modifiers) =>
      noHullChange({
        ...modifiers,
        gunner: {
          ...modifiers.gunner,
          projectileSpeedMultiplier: modifiers.gunner.projectileSpeedMultiplier + 0.12
        }
      })
  },
  shield_capacity: {
    role: "shield",
    label: "Capacity +20",
    value: 20,
    apply: (modifiers) =>
      noHullChange({
        ...modifiers,
        shield: { ...modifiers.shield, capacityBonus: modifiers.shield.capacityBonus + 20 }
      })
  },
  shield_recharge: {
    role: "shield",
    label: "Recharge +15%",
    value: 0.15,
    apply: (modifiers) =>
      noHullChange({
        ...modifiers,
        shield: {
          ...modifiers.shield,
          rechargeMultiplier: modifiers.shield.rechargeMultiplier + 0.15
        }
      })
  },
  shield_arc: {
    role: "shield",
    label: "Arc width +10 degrees",
    value: Math.PI / 18,
    apply: (modifiers) =>
      noHullChange({
        ...modifiers,
        shield: {
          ...modifiers.shield,
          arcWidthBonus: modifiers.shield.arcWidthBonus + Math.PI / 18
        }
      })
  }
};

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
