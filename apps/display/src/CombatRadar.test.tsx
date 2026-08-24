import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CombatRadar } from "./CombatRadar.js";

const baseGame: DisplayGameSnapshot = {
  tick: 1,
  elapsedMs: 50,
  worldWidth: 4_400,
  worldHeight: 4_400,
  arenaRadius: 2_200,
  spaceship: {
    x: 2_200,
    y: 2_200,
    velocityX: 0,
    velocityY: 0,
    radius: 55,
    hp: 500,
    maxHp: 500,
    heading: 0
  },
  turretAngle: 0,
  shield: { angle: 0, arcHalfAngle: 0.72, active: false, energy: 100, capacity: 100 },
  machineGun: { heat: 0, capacity: 100, overheated: false },
  encounter: {
    phase: "combat",
    outcome: null,
    defeatReason: null,
    waveNumber: 1,
    encounterTick: 1,
    phaseTicksRemaining: 0,
    waveSecondsRemaining: 1200,
    score: 0
  },
  roleModifiers: {
    pilot: { speedMultiplier: 1, accelerationMultiplier: 1, maxHpBonus: 0 },
    gunner: { damageMultiplier: 1, cooldownMultiplier: 1, projectileSpeedMultiplier: 1 },
    shield: { capacityBonus: 0, rechargeMultiplier: 1, arcWidthBonus: 0 }
  },
  obstacles: [],
  enemyShips: [
    {
      entityId: "enemy-1",
      spawnSequence: 1,
      kind: "gunship",
      x: 4_400,
      y: 2_200,
      velocityX: 0,
      velocityY: 0,
      radius: 30,
      heading: 0,
      hp: 80,
      maxHp: 80
    }
  ],
  asteroids: [
    {
      entityId: "asteroid-1",
      spawnSequence: 2,
      x: 1_000,
      y: 1_000,
      velocityX: 0,
      velocityY: 0,
      radius: 40,
      hp: 40,
      maxHp: 40
    }
  ],
  friendlyProjectiles: [],
  hostileProjectiles: [],
  homingMissiles: [
    {
      entityId: "missile-1",
      spawnSequence: 3,
      x: 3_000,
      y: 3_000,
      velocityX: 0,
      velocityY: 0,
      radius: 10,
      heading: 0
    }
  ]
};

describe("CombatRadar", () => {
  it("renders the shared spaceship and enemy ships inside a circular clip", () => {
    const markup = renderToStaticMarkup(<CombatRadar game={baseGame} />);

    expect(markup).toContain('data-testid="combat-radar"');
    expect(markup).toContain("clip-path");
    expect(markup).toContain('data-entity-id="enemy-1"');
    expect(markup).toContain("Корабль экипажа. Врагов: 1");
  });

  it("does not render asteroid, missile or projectile markers", () => {
    const markup = renderToStaticMarkup(<CombatRadar game={baseGame} />);

    expect(markup).not.toContain('data-entity-id="asteroid-1"');
    expect(markup).not.toContain('data-entity-id="missile-1"');
  });

  it("removes an enemy marker when it is absent from the next snapshot", () => {
    const markup = renderToStaticMarkup(<CombatRadar game={{ ...baseGame, enemyShips: [] }} />);

    expect(markup).not.toContain('data-entity-id="enemy-1"');
    expect(markup).toContain("Корабль экипажа. Врагов: 0");
  });
});
