import {
  advanceSpaceshipSimulation,
  createCleanSpaceshipRun,
  createSpaceshipSimulationConfig
} from "@spaceship-defender/game-core";
import { describe, expect, it } from "vitest";

import { createLocalMirror, PLAIN_PROJECTION_FACTORIES } from "./localMirror.ts";
import { projectGameState } from "./stateProjection.ts";

const config = createSpaceshipSimulationConfig();

describe("createLocalMirror", () => {
  /*
   * The point of the mirror is that the projection cannot tell it apart from
   * the schema. A compiler check would pass on a tree that is merely shaped
   * right; this one runs a real frame through it.
   */
  it("takes a projected frame the way the schema does", () => {
    const mirror = createLocalMirror();
    const game = createCleanSpaceshipRun(config, 11, 3);

    projectGameState(mirror.game, game, config, 47, PLAIN_PROJECTION_FACTORIES);

    expect(mirror.game.tick).toBe(game.clock.tick);
    expect(mirror.game.arenaRadius).toBe(config.arenaRadius);
    expect(mirror.game.spaceship.maxHp).toBe(game.ship.spaceshipMaxHp);
    expect(mirror.game.encounter.waveNumber).toBe(3);
    // Given as a number by the caller rather than read off a clock inside.
    expect(mirror.game.encounter.waveSecondsRemaining).toBe(47);
    expect(mirror.game.display.pose.x).toBe(game.spaceship.x);
  });

  it("fills its keyed collections with the run's entities", () => {
    const mirror = createLocalMirror();
    let game = createCleanSpaceshipRun(config, 11, 1);
    // A wave that has begun spawning, so the collections are not all empty.
    for (let index = 0; index < 400; index += 1) {
      game = advanceSpaceshipSimulation(game, config);
    }

    projectGameState(mirror.game, game, config, 60, PLAIN_PROJECTION_FACTORIES);

    // Otherwise an empty field would satisfy the comparison below.
    expect(game.enemies.length).toBeGreaterThan(0);
    expect(mirror.game.display.enemyShips.size).toBe(game.enemies.length);
    for (const enemy of game.enemies) {
      expect(mirror.game.display.enemyShips.get(enemy.id)?.x).toBe(enemy.x);
    }
  });

  /*
   * The adapter reads collections through `values()` and the projection writes
   * them through `get`/`set`/`delete`/`keys`. A `Map` answers both, which is
   * the whole reason the device needs no second description of the world.
   */
  it("exposes collections both contracts can use", () => {
    const mirror = createLocalMirror();

    expect(typeof mirror.game.display.enemyShips.values).toBe("function");
    expect(typeof mirror.game.display.enemyShips.keys).toBe("function");
    expect(typeof mirror.players.values).toBe("function");
    expect(Array.isArray(mirror.game.display.purchasedModules)).toBe(true);
  });
});
