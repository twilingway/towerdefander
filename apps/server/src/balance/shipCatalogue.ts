import type { ShipArchetype, ShipModule } from "@spaceship-defender/protocol";
import {
  DEFAULT_ENDLESS_TIER,
  DEFAULT_MODULE_TIERS,
  type ShipModuleDefinition
} from "@spaceship-defender/game-core";

/**
 * The hull catalogue a fresh preset starts from.
 *
 * The tree itself lives in `game-core` beside the stat engine that applies it,
 * because the simulation needs a default tree with or without a preset. What a
 * preset adds on top is the hull: a name, a look, and the sparse diff that
 * makes one ship fly differently from another. The base hull's diff is empty on
 * purpose — a run on it is the run the game had before hulls existed.
 */

const toModule = (module: ShipModuleDefinition): ShipModule => ({
  id: module.id,
  label: module.label,
  role: module.role,
  effects: module.effects.map(({ target, op, value }) => ({ target, op, value }))
});

const GUARDIAN: ShipArchetype = {
  label: "Страж",
  description:
    "Кинетическая турель и носовой пулемёт. Ни в чём не лучший и ни в чём не худший — корпус, по которому меряют остальные.",
  visual: null,
  unlockedAtWave: 1,
  overrides: { stats: {}, cannonWeaponKind: null, mgWeaponKind: null },
  tiers: DEFAULT_MODULE_TIERS.map((tier) => tier.map(toModule)),
  endlessTier: DEFAULT_ENDLESS_TIER.map(toModule)
};

export const DEFAULT_SHIP_ARCHETYPE_ID = "guardian";

export const DEFAULT_SHIP_ARCHETYPES: Readonly<Record<string, ShipArchetype>> = {
  [DEFAULT_SHIP_ARCHETYPE_ID]: GUARDIAN
};
