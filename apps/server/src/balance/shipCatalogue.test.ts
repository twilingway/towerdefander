import { describe, expect, it } from "vitest";

import {
  computeShipStats,
  createSpaceshipSimulationConfig,
  shipStatsFromConfig,
  type ShipStatEffect,
  type ShipStatField,
  type ShipStats
} from "@spaceship-defender/game-core";
import type { ShipArchetype, ShipModule } from "@spaceship-defender/protocol";

import { DEFAULT_SHIP_ARCHETYPES } from "./shipCatalogue.js";

/**
 * Stats a ship wants less of. Everything not named here is better larger, and
 * the direction is the whole point of the guard below: a card is a straight
 * gain, so an effect that moves its stat the wrong way is a bug in the tree
 * rather than a design choice.
 */
const LOWER_IS_BETTER = new Set<ShipStatField>([
  "spaceshipRadius",
  "fireCooldownTicks",
  "mgFireCooldownTicks",
  "cannonHeatPerShot",
  "mgHeatPerShot",
  "cannonRearmThreshold",
  "mgRearmThreshold",
  "shieldDrainPerSecond",
  "shieldEngageTicks",
  "shieldMinimumUpTicks",
  "shieldCooldownTicks",
  "shieldRearmEnergy"
]);

/** The hull's own numbers, because a clamp is measured against the run's base. */
function baseOf(hull: ShipArchetype): ShipStats {
  return {
    ...shipStatsFromConfig(createSpaceshipSimulationConfig()),
    ...hull.overrides.stats
  };
}

function everyCard(hull: ShipArchetype): readonly ShipModule[] {
  return [...hull.tiers.flat(), ...hull.endlessTier];
}

function movement(base: ShipStats, effect: ShipStatEffect): number {
  const after = computeShipStats(base, [effect]);
  const delta = after[effect.target] - base[effect.target];
  const moved = LOWER_IS_BETTER.has(effect.target) ? -delta : delta;
  // Negating a zero delta gives -0, and `Object.is(-0, 0)` is false: the dead
  // card guard below passed a planted no-op until this line existed.
  return moved === 0 ? 0 : moved;
}

describe("hull trees", () => {
  it.each(Object.keys(DEFAULT_SHIP_ARCHETYPES))("has no dead card on %s", (hullId) => {
    const hull = DEFAULT_SHIP_ARCHETYPES[hullId];
    if (hull === undefined) throw new Error(`no hull ${hullId}`);
    const base = baseOf(hull);
    for (const card of everyCard(hull)) {
      for (const effect of card.effects) {
        // Zero means the number was already at a clamp, so the card promises
        // something it cannot deliver - the operator would see a caption and no
        // change at all.
        expect(movement(base, effect), `${card.id}: ${effect.target} does not move`).not.toBe(0);
      }
    }
  });

  it.each(Object.keys(DEFAULT_SHIP_ARCHETYPES))("only ever improves %s", (hullId) => {
    const hull = DEFAULT_SHIP_ARCHETYPES[hullId];
    if (hull === undefined) throw new Error(`no hull ${hullId}`);
    const base = baseOf(hull);
    for (const card of everyCard(hull)) {
      for (const effect of card.effects) {
        expect(
          movement(base, effect),
          `${card.id}: ${effect.target} moves the wrong way`
        ).toBeGreaterThan(0);
      }
    }
  });

  it("gives every hull its own tree rather than the base one relabelled", () => {
    const guardian = DEFAULT_SHIP_ARCHETYPES.guardian;
    if (guardian === undefined) throw new Error("no guardian");
    // Ids carry the hull prefix, so the comparison is on what a card does.
    const shapeOf = (hull: ShipArchetype) =>
      everyCard(hull).map((card) => JSON.stringify(card.effects));
    const baseShape = shapeOf(guardian);
    for (const [hullId, hull] of Object.entries(DEFAULT_SHIP_ARCHETYPES)) {
      if (hullId === "guardian") continue;
      const shared = shapeOf(hull).filter((card, index) => card === baseShape[index]).length;
      // Half the tree may legitimately carry over - a gyroscope is a gyroscope -
      // but a hull that shares almost all of it has no identity of its own.
      expect(shared, `${hullId} repeats the base tree`).toBeLessThan(baseShape.length * 0.6);
    }
  });
});
