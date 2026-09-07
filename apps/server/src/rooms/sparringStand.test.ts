import {
  createCleanSpaceshipRun,
  createSpaceshipSimulationConfig
} from "@spaceship-defender/game-core";
import { describe, expect, it } from "vitest";

import { openSparringStand, refillSparringStand } from "./sparringStand.js";

const config = createSpaceshipSimulationConfig();

function freshRun() {
  return createCleanSpaceshipRun(config, 4242, 1);
}

describe("sparring stand", () => {
  it("keeps a handful of arrivals and drops the rest of the wave", () => {
    const run = freshRun();
    const stand = openSparringStand(run, 2);

    expect(run.pendingSpawns.length).toBeGreaterThan(2);
    expect(stand.pendingSpawns).toHaveLength(2);
    // All at once: a stand that trickles is a wave with fewer ships in it.
    expect(stand.pendingSpawns.every((spawn) => spawn.dueTick === 0)).toBe(true);
  });

  it("stops the ambient drift, so nothing else is moving to blame", () => {
    const stand = openSparringStand(freshRun(), 2);

    expect(stand.ambientAsteroidSpawnDueTick).toBeGreaterThan(1_000_000);
  });

  it("refills the field once it is shot empty", () => {
    const run = freshRun();
    const template = run.pendingSpawns.slice(0, 1);
    const emptied = { ...openSparringStand(run, 2), pendingSpawns: [], enemies: [] };

    const refilled = refillSparringStand(emptied, 2, template);

    expect(refilled.pendingSpawns).toHaveLength(2);
    expect(refilled.pendingSpawns[0]?.kind).toBe(template[0]?.kind);
  });

  it("adds nothing while the field is full", () => {
    const stand = openSparringStand(freshRun(), 2);

    expect(refillSparringStand(stand, 2, stand.pendingSpawns)).toBe(stand);
  });
});
