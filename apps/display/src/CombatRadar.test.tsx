import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CombatRadar } from "./CombatRadar.js";

const baseGame: DisplayGameSnapshot = {
  tick: 1,
  elapsedMs: 50,
  worldWidth: 4_400,
  cameraViewWidth: 1600,
  background: { parallaxStrength: 1, driftSpeed: 1, nebulaAlpha: 0.72, nebulaPreset: "blue" },
  worldHeight: 4_400,
  arenaRadius: 2_200,
  rimBandWidth: 260,
  shieldPhase: "down",
  purchasedModules: [],
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
  shield: {
    angle: 0,
    arcHalfAngle: 0.72,
    rearmRequired: false,
    active: false,
    energy: 100,
    capacity: 100
  },
  cannon: { heat: 0, capacity: 100, overheated: false },
  machineGun: { heat: 0, capacity: 100, overheated: false },
  encounter: {
    phase: "combat",
    outcome: null,
    defeatReason: null,
    waveNumber: 1,
    encounterTick: 1,
    phaseTicksRemaining: 0,
    waveSecondsRemaining: 1200,
    lootWindowSecondsRemaining: 0,
    score: 0
  },
  credits: 0,
  teamUpgrade: {
    offer: null,
    votes: { pilot: null, gunner: null, shield: null },
    selection: null
  },
  enemyCatalogue: [],
  asteroidVisual: null,
  spaceshipVisual: null,
  turretVisual: null,
  shieldRadius: 104,
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
  lootDrops: [],
  laserBeams: [],
  asteroids: [
    {
      origin: "wave",
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
      heading: 0,
      visual: null
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

  it("does not render missile or projectile markers", () => {
    const markup = renderToStaticMarkup(<CombatRadar game={baseGame} />);

    expect(markup).not.toContain('data-entity-id="missile-1"');
  });

  it("marks the rocks that pay credits apart from the ambient drift", () => {
    const [wave] = baseGame.asteroids;
    if (wave === undefined) throw new Error("fixture lost its asteroid");
    const ambient = {
      ...wave,
      entityId: "asteroid-2",
      spawnSequence: 9,
      origin: "ambient" as const
    };
    const markup = renderToStaticMarkup(
      <CombatRadar game={{ ...baseGame, asteroids: [...baseGame.asteroids, ambient] }} />
    );

    expect(markup).toContain('data-entity-id="asteroid-1"');
    expect(markup).toContain('data-entity-id="asteroid-2"');
    expect(markup).toContain('data-origin="wave"');
    expect(markup).toContain('data-origin="ambient"');
    expect(markup).toContain('data-asteroid-count="2"');
  });

  it("drops an asteroid marker once the rock is gone", () => {
    const markup = renderToStaticMarkup(<CombatRadar game={{ ...baseGame, asteroids: [] }} />);

    expect(markup).not.toContain('data-entity-id="asteroid-1"');
    expect(markup).toContain('data-asteroid-count="0"');
  });

  it("removes an enemy marker when it is absent from the next snapshot", () => {
    const markup = renderToStaticMarkup(<CombatRadar game={{ ...baseGame, enemyShips: [] }} />);

    expect(markup).not.toContain('data-entity-id="enemy-1"');
    expect(markup).toContain("Корабль экипажа. Врагов: 0");
  });
});

describe("status rings", () => {
  it("reads the hull and the shield as fractions of their own capacity", () => {
    const markup = renderToStaticMarkup(
      <CombatRadar
        game={{
          ...baseGame,
          spaceship: { ...baseGame.spaceship, hp: 125, maxHp: 500 },
          shield: { ...baseGame.shield, energy: 50, capacity: 100 }
        }}
      />
    );

    expect(markup).toContain('data-hull-fraction="0.25"');
    expect(markup).toContain('data-shield-fraction="0.50"');
    // A quarter of the hull left is the critical band, not a colour the CSS guesses.
    expect(markup).toContain('data-level="critical"');
  });

  it("opens both rings at the bottom and paints a full hull green", () => {
    const markup = renderToStaticMarkup(<CombatRadar game={baseGame} />);

    // Half past seven: the empty end of both arcs, with the numbers below it.
    expect(markup).toContain("rotate(135 100 100)");
    expect(markup).toContain('stroke="hsl(138 72% 52%)"');
  });

  it("labels each arc with its zero and with what it is filling to", () => {
    const markup = renderToStaticMarkup(
      <CombatRadar
        game={{
          ...baseGame,
          spaceship: { ...baseGame.spaceship, hp: 320, maxHp: 500 },
          shield: { ...baseGame.shield, energy: 64, capacity: 120 }
        }}
      />
    );

    expect(markup).toContain(">320 / 500</text>");
    expect(markup).toContain(">64 / 120</text>");
    expect(markup.match(/>0<\/text>/gu)).toHaveLength(2);
  });

  it("carries the shield state word the HUD card used to show", () => {
    const markup = renderToStaticMarkup(
      <CombatRadar game={{ ...baseGame, shieldPhase: "up", shield: { ...baseGame.shield } }} />
    );

    expect(markup).toContain('data-testid="hud-shield-status"');
    expect(markup).toContain("АКТИВЕН");
  });

  it("reddens the hull ring as the hull goes", () => {
    const markup = renderToStaticMarkup(
      <CombatRadar
        game={{ ...baseGame, spaceship: { ...baseGame.spaceship, hp: 60, maxHp: 500 } }}
      />
    );

    expect(markup).toContain('stroke="hsl(4 72% 52%)"');
  });

  it("reads the speed off the velocity the room publishes", () => {
    const markup = renderToStaticMarkup(
      <CombatRadar
        game={{ ...baseGame, spaceship: { ...baseGame.spaceship, velocityX: 300, velocityY: 400 } }}
      />
    );

    expect(markup).toContain("500 ед/с");
  });

  it("draws an empty ring rather than a full one when there is no capacity", () => {
    const markup = renderToStaticMarkup(
      <CombatRadar game={{ ...baseGame, shield: { ...baseGame.shield, energy: 0, capacity: 0 } }} />
    );

    expect(markup).toContain('data-shield-fraction="0.00"');
    expect(markup).toContain('data-hull-fraction="1.00"');
  });
});
