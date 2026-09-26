import { createDefaultTuning, toSimulationConfig } from "@spaceship-defender/balance-core";
import { describe, expect, it } from "vitest";

import { createArenaRun, type ArenaCockpitFrame, type ArenaRun } from "./arenaRun.ts";

function training(seed: number): ArenaRun {
  const tuning = createDefaultTuning();
  return createArenaRun({
    tuning,
    hull: toSimulationConfig(tuning, tuning.defaultShipArchetypeId),
    seed
  });
}

/** A pilot who circles, sweeps the gun and fires in bursts - the same every run. */
function frameAt(tick: number): ArenaCockpitFrame {
  const bearing = tick / 45;
  return {
    vector: { x: Math.cos(bearing), y: Math.sin(bearing) },
    turn: null,
    thrust: null,
    mgFiring: tick % 90 < 30,
    aim: { x: Math.cos(-bearing), y: Math.sin(-bearing) },
    aimTurn: null,
    // A released aim stick every so often, which is what the held bearing is for.
    firing: tick % 120 < 40
  };
}

function play(run: ArenaRun, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    run.step(frameAt(tick));
    if (tick % 300 === 0) run.scan();
  }
}

describe("createArenaRun", () => {
  it("replays the same match from the same seed and the same frames", () => {
    const first = training(4242);
    const second = training(4242);

    play(first, 900);
    play(second, 900);

    expect(second.state()).toEqual(first.state());
    expect(second.scanState()).toEqual(first.scanState());
    expect(first.state().clock.tick).toBe(900);
  });

  // Without this the test above could pass on a match that ignores its seed.
  it("plays a different match from a different seed", () => {
    const first = training(4242);
    const second = training(9001);

    play(first, 300);
    play(second, 300);

    expect(second.state().ships.map((ship) => ship.spaceship)).not.toEqual(
      first.state().ships.map((ship) => ship.spaceship)
    );
  });

  it("flies the player's hull from the cockpit, not from the bot", () => {
    const run = training(4242);
    const idle: ArenaCockpitFrame = {
      vector: { x: 0, y: 0 },
      turn: null,
      thrust: null,
      mgFiring: false,
      aim: { x: 0, y: 0 },
      aimTurn: null,
      firing: false
    };
    for (let tick = 0; tick < 120; tick += 1) run.step(idle);

    const player = run.state().ships[0];
    expect(player?.shotsFired).toBe(0);
    // The bots were not held still: somebody else on the field is moving.
    expect(
      run
        .state()
        .ships.slice(1)
        .some((ship) => ship.spaceship.velocity.x !== 0)
    ).toBe(true);
  });

  it("sweeps once, then waits out its cooldown", () => {
    const run = training(4242);
    play(run, 10);

    run.scan();
    const swept = run.scanState();
    expect(swept.readyTick).toBeGreaterThan(run.state().clock.tick);

    run.step(frameAt(10));
    run.scan();
    expect(run.scanState()).toBe(swept);
  });

  it("starts a fresh match on restart", () => {
    const run = training(4242);
    play(run, 120);
    const fresh = training(4242).state();

    run.restart();

    expect(run.state().clock.tick).toBe(0);
    // A new seed, not a replay of the first match's opening.
    expect(run.state().ships.map((ship) => ship.spaceship)).not.toEqual(
      fresh.ships.map((ship) => ship.spaceship)
    );
    expect(run.scanState().readyTick).toBe(0);
  });
});
