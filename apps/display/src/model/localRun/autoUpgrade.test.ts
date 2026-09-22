import { createDefaultTuning, toSimulationConfig } from "@spaceship-defender/balance-core";
import { describe, expect, it } from "vitest";

import { createLocalRun, IDLE_INTENT } from "./engine.js";

const tuning = createDefaultTuning();
const config = toSimulationConfig(tuning, tuning.defaultShipArchetypeId);

/**
 * An intermission nobody voted in still has to buy something.
 *
 * The core already decides this - "nobody chose, so the offer chooses" - and a
 * solo pilot hits it every break, because there is one pair of hands and they
 * are busy flying. What this asserts is that a run hosted by the tab reaches
 * that decision at all: the local engine drives its own phases, and a host that
 * stopped stepping through the break, or ended it early, would leave the wave's
 * worth of value on the table with nothing failing.
 */
describe("a local intermission with no vote", () => {
  it("buys the offer's first affordable card by itself", () => {
    const local = createLocalRun({
      config,
      tuning,
      shipArchetypeId: tuning.defaultShipArchetypeId,
      playerName: "Пилот",
      startWave: 1,
      waveTtlSeconds: 180,
      botSeats: ["pilot", "gunner", "shield"]
    });

    const reached = stepUntil(local, () => local.state().encounterPhase === "intermission");
    expect(reached, "the run never reached an intermission").toBe(true);

    const offer = local.state().teamUpgradeOffer;
    expect(offer, "the break produced no offer").not.toBeNull();
    const credits = local.state().credits;
    const affordable = offer?.cards.filter((card) => credits >= card.price) ?? [];
    expect(
      affordable.length,
      `nothing in the offer is affordable on ${String(credits)} credits, so this test proves nothing`
    ).toBeGreaterThan(0);

    const before = local.state().purchasedModules.length;
    const left = stepUntil(local, () => local.state().encounterPhase !== "intermission");
    expect(left, "the intermission never ended").toBe(true);

    expect(local.state().purchasedModules.length).toBe(before + 1);
    expect(local.state().credits).toBe(credits - (affordable[0]?.price ?? 0));
  });
});

/** Steps until the condition holds or the run ends; ten minutes of ticks is the ceiling. */
function stepUntil(local: ReturnType<typeof createLocalRun>, done: () => boolean): boolean {
  for (let index = 0; index < 60 * 60 * 10; index += 1) {
    local.step(IDLE_INTENT);
    if (done()) return true;
    if (local.state().outcome !== null) return false;
  }
  return false;
}
