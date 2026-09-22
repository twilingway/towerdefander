import { createDefaultTuning, toSimulationConfig } from "@spaceship-defender/balance-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createLocalRun, IDLE_INTENT } from "./engine.js";
import { toDisplayRoomView } from "../roomView.js";
import { TeamUpgradeOverlay } from "../../screens/RoomScreen/TeamUpgradeOverlay.js";

const tuning = createDefaultTuning();
const config = toSimulationConfig(tuning, tuning.defaultShipArchetypeId);

/**
 * The break after a cleared wave, drawn from a real local run.
 *
 * The engine reaching an intermission is not the same as the screen surviving
 * one: the offer travels through the mirror, the adapter and the overlay, and
 * any of the three could refuse a shape the schema used to smooth over.
 */
describe("the intermission of a local run", () => {
  it("renders the upgrade window off the run's own offer", () => {
    const local = createLocalRun({
      config,
      tuning,
      shipArchetypeId: tuning.defaultShipArchetypeId,
      playerName: "Пилот",
      startWave: 1,
      waveTtlSeconds: 180,
      botSeats: ["pilot", "gunner", "shield"]
    });

    let reached = false;
    for (let index = 0; index < 60 * 60 * 10; index += 1) {
      local.step(IDLE_INTENT);
      if (local.state().encounterPhase === "intermission") {
        reached = true;
        break;
      }
      if (local.state().outcome !== null) break;
    }
    expect(reached, "the run never reached an intermission").toBe(true);

    local.project(0);
    const view = toDisplayRoomView(local.mirror);
    const game = view?.game;
    expect(game, "the adapter refused the intermission frame").toBeDefined();
    if (game === undefined || game === null) return;

    expect(game.encounter.phase).toBe("intermission");
    expect(game.teamUpgrade.offer, "the break produced no offer").not.toBeNull();

    const markup = renderToStaticMarkup(
      <TeamUpgradeOverlay
        teamUpgrade={game.teamUpgrade}
        credits={game.credits}
        score={game.encounter.score}
        waveNumber={game.encounter.waveNumber}
        phaseTicksRemaining={game.encounter.phaseTicksRemaining}
        purchasedModules={game.purchasedModules}
        cockpit={{ role: "pilot", onVote: () => undefined }}
      />
    );

    expect(markup.length).toBeGreaterThan(0);
  });
});
