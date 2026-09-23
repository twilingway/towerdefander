import type {
  BalancePreset,
  BalancePresetsFile,
  BalanceTuning,
  ShipArchetype
} from "@spaceship-defender/protocol";
import {
  createSpaceshipSimulationConfig,
  validateSpaceshipSimulationConfig,
  type SpaceshipSimulationConfig
} from "@spaceship-defender/game-core";

/** Throws a RangeError when the tuning cannot drive a simulation. */
export function assertTuningIsPlayable(tuning: BalanceTuning): void {
  for (const hullId of Object.keys(tuning.shipArchetypes)) {
    validateSpaceshipSimulationConfig(toSimulationConfig(tuning, hullId));
  }
}

/**
 * The preset plus one chosen hull, as the simulation sees it.
 *
 * This is where a hull stops being a catalogue entry: its sparse diff lands on
 * the flat ship block and its tree becomes the tiers the offer is built from,
 * so the simulation is handed a ship and never learns that a choice was made.
 */
export function toSimulationConfig(
  tuning: BalanceTuning,
  shipArchetypeId?: string
): SpaceshipSimulationConfig {
  // The autopilot section drives the demo harness and the helm section drives
  // the controller's keyboard; neither reaches the simulation.
  const simulation: Partial<BalanceTuning> = { ...tuning };
  delete simulation.autopilot;
  delete simulation.helm;
  delete simulation.shipArchetypes;
  delete simulation.defaultShipArchetypeId;
  const hull = resolveShipArchetype(tuning, shipArchetypeId);
  // The world follows the arena radius inside the factory, so every caller that
  // builds a config from a preset gets the same geometry.
  return createSpaceshipSimulationConfig({
    ...simulation,
    ...hull.overrides.stats,
    ...(hull.overrides.cannonWeaponKind === null
      ? {}
      : { cannonWeaponKind: hull.overrides.cannonWeaponKind }),
    ...(hull.overrides.mgWeaponKind === null ? {} : { mgWeaponKind: hull.overrides.mgWeaponKind }),
    // The hull's own shield effects, the way its stats fold in: the simulation
    // is handed a ship and never learns a choice was made.
    ...(hull.effects?.shieldBand === undefined
      ? {}
      : { shieldBandEffect: hull.effects.shieldBand }),
    ...(hull.effects?.shieldImpact === undefined
      ? {}
      : { shieldImpactEffect: hull.effects.shieldImpact }),
    ...(hull.effects?.death === undefined ? {} : { shipDeathEffect: hull.effects.death }),
    ...(hull.effects?.muzzle === undefined ? {} : { shipMuzzleEffect: hull.effects.muzzle }),
    // And what it is heard doing, folded in the same way and for the same
    // reason: an unset slot is absent rather than empty, so the built-in stands.
    ...(hull.sounds?.cannonShot === undefined ? {} : { shipCannonSound: hull.sounds.cannonShot }),
    ...(hull.sounds?.mgShot === undefined ? {} : { shipMgSound: hull.sounds.mgShot }),
    ...(hull.sounds?.hit === undefined ? {} : { shipHitSound: hull.sounds.hit }),
    ...(hull.sounds?.death === undefined ? {} : { shipDeathSound: hull.sounds.death }),
    moduleTiers: hull.tiers,
    endlessTier: hull.endlessTier
  });
}

/** The named hull, or the preset's own default when the name is not a hull. */
export function resolveShipArchetype(
  tuning: BalanceTuning,
  shipArchetypeId?: string
): ShipArchetype {
  const chosen = shipArchetypeId === undefined ? undefined : tuning.shipArchetypes[shipArchetypeId];
  const fallback = tuning.shipArchetypes[tuning.defaultShipArchetypeId];
  const hull = chosen ?? fallback;
  if (hull === undefined) throw new RangeError("Preset has no hull to play on");
  return hull;
}

export function findActivePreset(file: BalancePresetsFile): BalancePreset {
  // The schema guarantees the active id resolves, so this only guards hand-built values.
  const active = file.presets.find(({ id }) => id === file.activePresetId) ?? file.presets[0];
  if (active === undefined) {
    throw new Error("Balance document must contain at least one preset.");
  }
  return active;
}
