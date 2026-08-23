import { describe, expect, it } from "vitest";

import { createControllerJoinUrl, toDisplayRoomView, type NetworkRoomState } from "./roomView.js";

function collection<T>(values: T[]) {
  return new Map(values.map((value, index) => [index, value]));
}

describe("display room view", () => {
  it("flattens stable display-only combat maps into spawn-ordered strict v9 arrays", () => {
    const state: NetworkRoomState = {
      roomId: "ROOM123",
      phase: "active",
      runNumber: 2,
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
        worldWidth: 2400,
        worldHeight: 1600,
        spaceship: {
          x: 1200,
          y: 800,
          velocityX: 0,
          velocityY: 0,
          radius: 52,
          hp: 850,
          maxHp: 1000
        },
        turretAngle: 0,
        shield: {
          angle: 0,
          arcHalfAngle: 0.72,
          active: false,
          energy: 75,
          capacity: 100
        },
        encounter: {
          phase: "combat",
          hasOutcome: false,
          outcome: "defeat",
          waveNumber: 3,
          encounterTick: 12,
          phaseTicksRemaining: 0,
          score: 240
        },
        roleModifiers: {
          pilot: { speedMultiplier: 1, accelerationMultiplier: 1, maxHpBonus: 0 },
          gunner: { damageMultiplier: 1, cooldownMultiplier: 1, projectileSpeedMultiplier: 1 },
          shield: { capacityBonus: 0, rechargeMultiplier: 1, arcWidthBonus: 0 }
        },
        display: {
          obstacles: collection([
            { obstacleId: "cloud", kind: "circle", x: 100, y: 100, radius: 20, width: 0, height: 0 }
          ]),
          enemyShips: collection([
            {
              entityId: "enemy-2",
              spawnSequence: 2,
              kind: "missileCarrier",
              x: 1800,
              y: 800,
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
              x: 1600,
              y: 800,
              velocityX: -40,
              velocityY: 0,
              radius: 18,
              heading: Math.PI,
              hp: 40,
              maxHp: 40
            }
          ]),
          asteroids: collection([]),
          friendlyProjectiles: collection([
            {
              entityId: "projectile-0",
              spawnSequence: 3,
              kind: "friendly",
              x: 1300,
              y: 800,
              velocityX: 720,
              velocityY: 0,
              radius: 8
            }
          ]),
          hostileProjectiles: collection([]),
          homingMissiles: collection([])
        }
      }
    };
    const view = toDisplayRoomView(state);
    expect(view?.players.map((player) => player.role)).toEqual(["pilot", "gunner"]);
    expect(view?.game?.obstacles).toEqual([
      { obstacleId: "cloud", kind: "circle", x: 100, y: 100, radius: 20 }
    ]);
    expect(view?.game?.friendlyProjectiles).toHaveLength(1);
    expect(view?.game?.enemyShips.map(({ entityId }) => entityId)).toEqual(["enemy-1", "enemy-2"]);
    expect(view?.game?.encounter).toMatchObject({ phase: "combat", waveNumber: 3, score: 240 });
    expect(view?.game?.encounter.outcome).toBeNull();
    expect(view?.runNumber).toBe(2);
    expect(view?.game?.spaceship.hp).toBe(850);
    expect(view?.game?.shield.energy).toBe(75);
    expect(view?.game?.shield.arcHalfAngle).toBe(0.72);
    expect(view?.displayLatencyMs).toBe(18);
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
