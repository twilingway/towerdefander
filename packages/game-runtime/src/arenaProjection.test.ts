import { createDefaultTuning, toSimulationConfig } from "@spaceship-defender/balance-core";
import { describe, expect, it } from "vitest";

import {
  PLAIN_ARENA_PROJECTION_FACTORIES,
  createArenaProjectionMemo,
  projectArenaMatch
} from "./arenaProjection.ts";
import { createArenaRun, type ArenaCockpitFrame } from "./arenaRun.ts";
import { createLocalMirror } from "./localMirror.ts";

const IDLE: ArenaCockpitFrame = {
  vector: { x: 0, y: 0 },
  turn: null,
  thrust: null,
  mgFiring: false,
  aim: { x: 0, y: 0 },
  aimTurn: null,
  firing: false
};

function trainingAfter(ticks: number) {
  const tuning = createDefaultTuning();
  const run = createArenaRun({
    tuning,
    hull: toSimulationConfig(tuning, tuning.defaultShipArchetypeId),
    seed: 4242
  });
  for (let tick = 0; tick < ticks; tick += 1) run.step(IDLE);
  return run;
}

/*
 * The device's mirror is a target of the same projection the room's schema is:
 * this call is the type-level half of that, and the expectations are the rest.
 */
describe("projectArenaMatch into the local mirror", () => {
  it("publishes every hull, the sheet and the player's own ship", () => {
    const run = trainingAfter(240);
    const mirror = createLocalMirror();
    const match = run.state();

    projectArenaMatch(
      mirror.game,
      match,
      run.config,
      { seated: true, scan: run.scanState() },
      createArenaProjectionMemo(),
      PLAIN_ARENA_PROJECTION_FACTORIES
    );

    const ships = [...mirror.game.display.arenaShips.values()];
    expect(ships).toHaveLength(match.ships.length);
    expect(ships.filter((ship) => ship.isSelf)).toHaveLength(1);
    expect(mirror.game.display.arenaZones).toHaveLength(match.zones.length);
    expect(mirror.game.tick).toBe(match.clock.tick);
    expect(mirror.game.spaceship.x).toBe(match.ships[0]?.spaceship.x);
    expect(mirror.game.encounter.phase).toBe("combat");
    expect(mirror.game.encounter.waveSecondsRemaining).toBeGreaterThan(0);
  });

  it("publishes each shell's birth tick as the match stamped it", () => {
    const run = trainingAfter(240);
    // The player's own guns, so the field is not waiting on a bot's decision.
    for (let tick = 0; tick < 30; tick += 1) run.step({ ...IDLE, mgFiring: true, firing: true });
    const mirror = createLocalMirror();
    const match = run.state();

    projectArenaMatch(
      mirror.game,
      match,
      run.config,
      { seated: true, scan: run.scanState() },
      createArenaProjectionMemo(),
      PLAIN_ARENA_PROJECTION_FACTORIES
    );

    // Otherwise an empty field would satisfy the loop below.
    expect(match.projectiles.length).toBeGreaterThan(0);
    const published = new Map(
      [
        ...mirror.game.display.friendlyProjectiles.values(),
        ...mirror.game.display.hostileProjectiles.values()
      ].map((shell) => [shell.entityId, shell.spawnTick])
    );
    for (const shot of match.projectiles) {
      expect(published.get(shot.id)).toBe(shot.spawnedTick);
    }
  });

  it("marks what a sweep found, and only while the reveal lasts", () => {
    const run = trainingAfter(10);
    const match = run.state();
    const rival = match.ships[1];
    if (rival === undefined) throw new Error("the match has no rival");
    const mirror = createLocalMirror();
    const memo = createArenaProjectionMemo();
    const projectWithRevealUntil = (revealedUntilTick: number) => {
      projectArenaMatch(
        mirror.game,
        match,
        run.config,
        { seated: true, scan: { readyTick: 0, revealedUntilTick, revealed: new Set([rival.id]) } },
        memo,
        PLAIN_ARENA_PROJECTION_FACTORIES
      );
    };
    const revealed = () =>
      [...mirror.game.display.arenaShips.values()]
        .filter((ship) => ship.revealed)
        .map((ship) => ship.entityId);

    projectWithRevealUntil(match.clock.tick + 1);
    expect(revealed()).toEqual([rival.id]);

    projectWithRevealUntil(match.clock.tick);
    expect(revealed()).toEqual([]);
  });
});
