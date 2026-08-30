import { describe, expect, it } from "vitest";

import { createControllerJoinUrl, toDisplayRoomView, type NetworkRoomState } from "./roomView.js";

function collection<T>(values: T[]) {
  return new Map(values.map((value, index) => [index, value]));
}

describe("display room view", () => {
  it("flattens stable display-only combat maps into spawn-ordered strict v11 arrays", () => {
    const state: NetworkRoomState = {
      roomId: "ROOM123",
      phase: "active",
      runNumber: 2,
      crewSize: 3,
      displayConnected: true,
      displayLatencyMs: 18,
      players: collection([
        {
          playerId: "p2",
          playerName: "Sam",
          role: "gunner",
          ready: true,
          connected: true,
          latencyMs: 47
        },
        {
          playerId: "p1",
          playerName: "Alex",
          role: "pilot",
          ready: true,
          connected: true,
          latencyMs: -1
        }
      ]),
      hasGame: true,
      game: {
        tick: 2,
        elapsedMs: 100,
        worldWidth: 4400,
        worldHeight: 4400,
        arenaRadius: 2200,
        rimBandWidth: 260,
        spaceship: {
          x: 2200,
          y: 2200,
          velocityX: 0,
          velocityY: 0,
          radius: 52,
          hp: 850,
          maxHp: 1000,
          heading: Math.PI / 3
        },
        turretAngle: 0,
        shield: {
          angle: 0,
          arcHalfAngle: 0.72,
          rearmRequired: false,
          active: false,
          energy: 75,
          capacity: 100
        },
        cannon: { heat: 30, capacity: 100, overheated: false },
        machineGun: { heat: 30, capacity: 100, overheated: false },
        encounter: {
          phase: "combat",
          hasOutcome: false,
          outcome: "defeat",
          hasDefeatReason: false,
          defeatReason: "spaceship_destroyed",
          waveNumber: 3,
          encounterTick: 12,
          phaseTicksRemaining: 0,
          waveSecondsRemaining: 1188,
          score: 240
        },
        roleModifiers: {
          pilot: { speedMultiplier: 1, accelerationMultiplier: 1, maxHpBonus: 0 },
          gunner: { damageMultiplier: 1, cooldownMultiplier: 1, projectileSpeedMultiplier: 1 },
          shield: { capacityBonus: 0, rechargeMultiplier: 1, arcWidthBonus: 0 }
        },
        credits: 6,
        display: {
          cameraViewWidth: 1600,
          backgroundParallaxStrength: 0.8,
          backgroundDriftSpeed: 2,
          backgroundNebulaAlpha: 0.5,
          backgroundNebulaPreset: "gold",
          spaceshipVisualShape: "ship-lancer",
          spaceshipVisualScale: 1.25,
          shieldRadius: 140,
          shieldPhase: "raising",
          enemyCatalogue: [],
          obstacles: collection([
            {
              obstacleId: "cloud",
              kind: "circle",
              x: 2200,
              y: 1600,
              radius: 20,
              width: 0,
              height: 0
            }
          ]),
          enemyShips: collection([
            {
              entityId: "enemy-2",
              spawnSequence: 2,
              kind: "missileCarrier",
              x: 2800,
              y: 2200,
              velocityX: -20,
              velocityY: 0,
              radius: 24,
              heading: Math.PI,
              hp: 80,
              maxHp: 100
            },
            {
              entityId: "enemy-1",
              spawnSequence: 1,
              kind: "gunship",
              x: 2600,
              y: 2200,
              velocityX: -40,
              velocityY: 0,
              radius: 18,
              heading: Math.PI,
              hp: 40,
              maxHp: 40
            }
          ]),
          asteroids: collection([]),
          lootDrops: collection([]),
          friendlyProjectiles: collection([
            {
              entityId: "projectile-0",
              spawnSequence: 3,
              kind: "friendly",
              x: 2300,
              y: 2200,
              velocityX: 720,
              velocityY: 0,
              radius: 8,
              source: "cannon"
            },
            {
              entityId: "projectile-1",
              spawnSequence: 4,
              kind: "friendly",
              x: 2350,
              y: 2200,
              velocityX: 760,
              velocityY: 0,
              radius: 5,
              source: "machineGun"
            }
          ]),
          hostileProjectiles: collection([
            {
              entityId: "hostile-0",
              spawnSequence: 5,
              kind: "hostile",
              x: 2100,
              y: 2200,
              velocityX: -300,
              velocityY: 0,
              radius: 9,
              source: ""
            }
          ]),
          homingMissiles: collection([])
        }
      }
    };
    const view = toDisplayRoomView(state);
    expect(view?.players.map((player) => player.role)).toEqual(["pilot", "gunner"]);
    expect(view?.game?.obstacles).toEqual([
      { obstacleId: "cloud", kind: "circle", x: 2200, y: 1600, radius: 20 }
    ]);
    expect(view?.game?.friendlyProjectiles).toHaveLength(2);
    expect(view?.game?.friendlyProjectiles[0]?.source).toBe("cannon");
    expect(view?.game?.friendlyProjectiles[1]?.source).toBe("machineGun");
    expect(view?.game?.hostileProjectiles).toHaveLength(1);
    expect(view?.game?.hostileProjectiles[0]).not.toHaveProperty("source");
    expect(view?.game?.spaceship.heading).toBe(Math.PI / 3);
    expect(view?.game?.machineGun).toEqual({ heat: 30, capacity: 100, overheated: false });
    expect(view?.game?.enemyShips.map(({ entityId }) => entityId)).toEqual(["enemy-1", "enemy-2"]);
    expect(view?.game?.encounter).toMatchObject({ phase: "combat", waveNumber: 3, score: 240 });
    expect(view?.game?.encounter.outcome).toBeNull();
    expect(view?.game?.encounter.defeatReason).toBeNull();
    expect(view?.game?.encounter.waveSecondsRemaining).toBe(1188);
    expect(view?.runNumber).toBe(2);
    expect(view?.game?.background).toEqual({
      parallaxStrength: 0.8,
      driftSpeed: 2,
      nebulaAlpha: 0.5,
      nebulaPreset: "gold"
    });
    expect(view?.game?.arenaRadius).toBe(2200);
    expect(view?.game?.spaceship.hp).toBe(850);
    expect(view?.game?.shield.energy).toBe(75);
    expect(view?.game?.shield.arcHalfAngle).toBe(0.72);
    expect(view?.game?.shieldRadius).toBe(140);
    // Display-gated, so it has to survive the trip through the display branch.
    expect(view?.game?.shieldPhase).toBe("raising");
    expect(view?.game?.spaceshipVisual).toEqual({ shape: "ship-lancer", modelScale: 1.25 });
    expect(view?.displayLatencyMs).toBe(18);
    expect(view?.game?.credits).toBe(6);
    expect(view?.game?.teamUpgrade).toEqual({
      offer: null,
      votes: { pilot: null, gunner: null, shield: null },
      selection: null
    });
    expect(view?.players.map((player) => player.latencyMs)).toEqual([null, 47]);
  });

  it("requires a root run number before publishing a hydrated view", () => {
    expect(
      toDisplayRoomView({
        roomId: "ROOM123",
        phase: "lobby",
        displayConnected: true,
        players: collection([]),
        hasGame: false
      })
    ).toBeUndefined();
  });

  it("builds a controller URL without losing existing parameters", () => {
    expect(createControllerJoinUrl("https://game.test/controller?lang=ru", "ROOM123")).toBe(
      "https://game.test/controller?lang=ru&room=ROOM123"
    );
  });
});
