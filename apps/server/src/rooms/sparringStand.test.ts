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
  it("takes every enemy and every arrival off the arena", () => {
    const run = freshRun();
    const stand = openSparringStand(run, 2, config.arenaRadius);

    expect(run.pendingSpawns.length).toBeGreaterThan(0);
    expect(stand.pendingSpawns).toHaveLength(0);
    expect(stand.enemies).toHaveLength(0);
  });

  it("puts up the bodies asked for, moving at a steady speed", () => {
    const stand = openSparringStand(freshRun(), 3, config.arenaRadius);

    expect(stand.asteroids).toHaveLength(3);
    const speeds = stand.asteroids.map((body) => Math.hypot(body.velocity.x, body.velocity.y));
    for (const speed of speeds) expect(speed).toBeCloseTo(speeds[0] ?? 0, 6);
    expect(speeds[0]).toBeGreaterThan(0);
  });

  it("makes them harmless, so a measurement is not also a fight", () => {
    const stand = openSparringStand(freshRun(), 2, config.arenaRadius);

    expect(stand.asteroids.every((body) => body.damage === 0)).toBe(true);
  });

  it("stops the ambient drift, so nothing else is moving to blame", () => {
    const stand = openSparringStand(freshRun(), 2, config.arenaRadius);

    expect(stand.ambientAsteroidSpawnDueTick).toBeGreaterThan(1_000_000);
  });

  it("puts a body back once one has left the arena", () => {
    const stand = openSparringStand(freshRun(), 2, config.arenaRadius);
    const emptied = { ...stand, asteroids: stand.asteroids.slice(0, 1) };

    expect(refillSparringStand(emptied, 2, config.arenaRadius).asteroids).toHaveLength(2);
  });

  it("adds nothing while the field is full", () => {
    const stand = openSparringStand(freshRun(), 2, config.arenaRadius);

    expect(refillSparringStand(stand, 2, config.arenaRadius)).toBe(stand);
  });
});
