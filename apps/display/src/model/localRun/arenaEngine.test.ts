import { createDefaultTuning } from "@spaceship-defender/balance-core";
import { describe, expect, it } from "vitest";

import { toDisplayRoomView } from "../roomView.js";
import { createLocalArena } from "./arenaEngine.js";
import { IDLE_INTENT, type LocalIntent } from "./engine.js";

function training() {
  return createLocalArena({ tuning: createDefaultTuning(), playerName: "Ада", seed: 4242 });
}

const FORWARD: LocalIntent = { ...IDLE_INTENT, vector: { x: 1, y: 0 } };

describe("a training match on the device", () => {
  /*
   * The view adapter runs the display's own schema over the mirror, and a
   * refused view is a screen that never draws: this is the check that the
   * device's match reaches the screen at all.
   */
  it("publishes a match the display's contract accepts", () => {
    const arena = training();
    for (let tick = 0; tick < 60; tick += 1) arena.step(FORWARD);
    arena.project(0);

    const view = toDisplayRoomView(arena.mirror);

    expect(view?.game?.arenaShips).toHaveLength(16);
    expect(view?.game?.arenaShips.filter((ship) => ship.isSelf)).toHaveLength(1);
    expect(view?.game?.arenaZones.length).toBeGreaterThan(0);
    expect(view?.game?.encounter.phase).toBe("combat");
    expect(view?.game?.tick).toBe(60);
  });

  it("draws the player's hull where the match has it", () => {
    const arena = training();
    for (let tick = 0; tick < 30; tick += 1) arena.step(FORWARD);
    arena.project(0);

    const self = [...arena.mirror.game.display.arenaShips.values()].find((ship) => ship.isSelf);
    expect(arena.pose().x).toBe(self?.x);
    expect(arena.pose().y).toBe(self?.y);
  });

  it("starts the sweep's cooldown when the button is pressed", () => {
    const arena = training();
    arena.step(IDLE_INTENT);
    arena.project(0);
    expect(arena.mirror.game.display.scanReadySeconds).toBe(0);

    arena.scan();
    arena.project(0);

    expect(arena.mirror.game.display.scanReadySeconds).toBeGreaterThan(0);
  });

  it("plays again from the first tick", () => {
    const arena = training();
    for (let tick = 0; tick < 90; tick += 1) arena.step(FORWARD);

    arena.restart();
    arena.project(0);

    const view = toDisplayRoomView(arena.mirror);
    expect(view?.game?.tick).toBe(0);
    expect(view?.runNumber).toBe(2);
    expect(view?.game?.encounter.outcome ?? null).toBeNull();
  });
});
