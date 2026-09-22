import { createDefaultTuning, toSimulationConfig } from "@spaceship-defender/balance-core";
import { toDisplayRoomView } from "../roomView.js";
import { describe, expect, it } from "vitest";

import { createLocalRun, IDLE_INTENT } from "./engine.js";

const tuning = createDefaultTuning();
const config = toSimulationConfig(tuning, tuning.defaultShipArchetypeId);

function run(startWave = 1) {
  return createLocalRun({
    config,
    tuning,
    shipArchetypeId: tuning.defaultShipArchetypeId,
    playerName: "Пилот",
    startWave,
    waveTtlSeconds: 180
  });
}

describe("createLocalRun", () => {
  it("starts a run without anything to connect to", () => {
    const local = run(3);

    expect(local.state().waveNumber).toBe(3);
    expect(local.mirror.phase).toBe("active");
    expect(local.mirror.runNumber).toBe(1);
    expect(local.mirror.players.size).toBe(1);
  });

  /*
   * The whole point of the mirror: what the device steps has to arrive at the
   * screen through the very adapter the networked path uses, or the two would
   * be drawing different worlds.
   */
  it("produces a view the display adapter accepts", () => {
    const local = run();
    for (let index = 0; index < 120; index += 1) local.step(IDLE_INTENT);
    local.project(0.4);

    const view = toDisplayRoomView(local.mirror);

    expect(view).toBeDefined();
    expect(view?.game?.tick).toBe(local.state().clock.tick);
    expect(view?.game?.arenaRadius).toBe(config.arenaRadius);
    // A device has no round trip, and the adapter reads -1 as "unknown".
    expect(view?.displayLatencyMs).toBeNull();
  });

  it("carries the hull's own look and the enemy catalogue into the view", () => {
    const local = run();
    local.project(0);

    const view = toDisplayRoomView(local.mirror);

    expect(view?.game?.enemyCatalogue.length).toBeGreaterThan(0);
    // The hull's own silhouette comes from the preset; the code defaults carry
    // none, and the scene falls back to its built-in shape.
    expect(view?.game?.shieldRadius).toBe(config.shieldRadius);
  });

  it("answers the hand: thrust moves the ship, idle does not", () => {
    const still = run();
    for (let index = 0; index < 60; index += 1) still.step(IDLE_INTENT);
    const idleTravel = Math.hypot(
      still.state().spaceship.x - config.worldWidth / 2,
      still.state().spaceship.y - config.worldHeight / 2
    );

    const flying = run();
    for (let index = 0; index < 60; index += 1) {
      // A tank helm names a spin and a thrust along the nose; `turn: null`
      // would be a panel naming a bearing instead, which is a different scheme.
      flying.step({ ...IDLE_INTENT, turn: 0, thrust: 1 });
    }
    const flownTravel = Math.hypot(
      flying.state().spaceship.x - config.worldWidth / 2,
      flying.state().spaceship.y - config.worldHeight / 2
    );

    expect(flownTravel).toBeGreaterThan(idleTravel + 50);
  });

  /*
   * A wave the crew cannot finish has to end, and on a device that verdict
   * comes from the run's own ticks rather than from a clock nobody keeps.
   */
  it("loses a wave that outlives its deadline, counted in ticks", () => {
    const local = createLocalRun({
      config,
      tuning,
      shipArchetypeId: tuning.defaultShipArchetypeId,
      playerName: "Пилот",
      startWave: 1,
      waveTtlSeconds: 1
    });

    for (let index = 0; index < 120; index += 1) local.step(IDLE_INTENT);

    expect(local.state().outcome).toBe("defeat");
    expect(local.state().defeatReason).toBe("wave_timeout");
  });

  it("starts a fresh run on restart, with a new number", () => {
    const local = run();
    for (let index = 0; index < 60; index += 1) local.step(IDLE_INTENT);

    local.restart();

    expect(local.state().clock.tick).toBe(0);
    expect(local.mirror.runNumber).toBe(2);
  });
});
