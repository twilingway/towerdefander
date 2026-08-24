import { describe, expect, it } from "vitest";

import {
  findCurrentPlayer,
  getRoomFromLocation,
  toControllerRoomView,
  type NetworkRoomState
} from "./roomView.js";

function collection<T>(values: T[]) {
  return new Map(values.map((value, index) => [index, value]));
}

describe("controller room view", () => {
  it("decodes compact current state without mass entities and derives the assigned role", () => {
    const state: NetworkRoomState = {
      roomId: "ROOM123",
      phase: "active",
      runNumber: 2,
      displayConnected: true,
      displayLatencyMs: -1,
      players: collection([
        {
          playerId: "p2",
          playerName: "Sam",
          role: "shield",
          ready: true,
          connected: true,
          latencyMs: 62
        },
        {
          playerId: "p1",
          playerName: "Alex",
          role: "pilot",
          ready: true,
          connected: true,
          latencyMs: 28
        }
      ]),
      hasGame: true,
      game: {
        tick: 1,
        elapsedMs: 50,
        worldWidth: 4400,
        worldHeight: 4400,
        arenaRadius: 2200,
        spaceship: {
          x: 2200,
          y: 2200,
          velocityX: 0,
          velocityY: 0,
          radius: 52,
          hp: 900,
          maxHp: 1000,
          heading: 0
        },
        turretAngle: 0,
        shield: {
          angle: Math.PI,
          arcHalfAngle: 0.8,
          active: true,
          energy: 64,
          capacity: 100
        },
        machineGun: { heat: 0, capacity: 100, overheated: false },
        encounter: {
          phase: "combat",
          hasOutcome: false,
          outcome: "defeat",
          waveNumber: 2,
          encounterTick: 14,
          phaseTicksRemaining: 0,
          score: 120
        },
        roleModifiers: {
          pilot: { speedMultiplier: 1.1, accelerationMultiplier: 1, maxHpBonus: 0 },
          gunner: { damageMultiplier: 1, cooldownMultiplier: 1, projectileSpeedMultiplier: 1 },
          shield: { capacityBonus: 25, rechargeMultiplier: 1, arcWidthBonus: 0 }
        }
      }
    };
    const view = toControllerRoomView(state, "p2");
    expect(view?.players.map((player) => player.role)).toEqual(["pilot", "shield"]);
    expect(view?.game).not.toHaveProperty("projectiles");
    expect(view?.game?.shield).toEqual({
      angle: Math.PI,
      arcHalfAngle: 0.8,
      active: true,
      energy: 64,
      capacity: 100
    });
    expect(view?.game?.machineGun).toEqual({ heat: 0, capacity: 100, overheated: false });
    expect(view?.game?.spaceship.heading).toBe(0);
    expect(findCurrentPlayer(view, "p2")?.role).toBe("shield");
    expect(findCurrentPlayer(view, "p2")?.latencyMs).toBe(62);
    expect(view?.displayLatencyMs).toBeNull();
    expect(view?.assignedRole).toBe("shield");
    expect(view?.runNumber).toBe(2);
    expect(view?.game?.upgrade).toBeNull();
    expect(view?.game).not.toHaveProperty("enemyShips");
  });

  it("unwraps only the personalized upgrade entry visible to this controller", () => {
    const state: NetworkRoomState = {
      roomId: "ROOM123",
      phase: "active",
      runNumber: 1,
      displayConnected: true,
      displayLatencyMs: 20,
      players: collection([
        {
          playerId: "p1",
          playerName: "Alex",
          role: "pilot",
          ready: true,
          connected: true,
          latencyMs: 30
        }
      ]),
      hasGame: true,
      game: {
        tick: 40,
        elapsedMs: 2000,
        worldWidth: 4400,
        worldHeight: 4400,
        arenaRadius: 2200,
        spaceship: {
          x: 2200,
          y: 2200,
          velocityX: 0,
          velocityY: 0,
          radius: 52,
          hp: 1000,
          maxHp: 1000,
          heading: Math.PI / 4
        },
        turretAngle: 0,
        shield: {
          angle: 0,
          arcHalfAngle: 0.72,
          active: false,
          energy: 100,
          capacity: 100
        },
        machineGun: { heat: 40, capacity: 100, overheated: false },
        encounter: {
          phase: "intermission",
          outcome: null,
          waveNumber: 1,
          encounterTick: 40,
          phaseTicksRemaining: 200,
          score: 100
        },
        roleModifiers: {
          pilot: { speedMultiplier: 1, accelerationMultiplier: 1, maxHpBonus: 0 },
          gunner: { damageMultiplier: 1, cooldownMultiplier: 1, projectileSpeedMultiplier: 1 },
          shield: { capacityBonus: 0, rechargeMultiplier: 1, arcWidthBonus: 0 }
        },
        upgrade: collection([
          {
            status: "available",
            offer: {
              offerId: "offer-pilot-1",
              role: "pilot",
              waveNumber: 1,
              cards: collection([
                { upgradeId: "pilot_speed", label: "Скорость +10%", value: 0.1 },
                { upgradeId: "pilot_acceleration", label: "Разгон +10%", value: 0.1 },
                { upgradeId: "pilot_hull", label: "Корпус +100", value: 100 }
              ])
            },
            hasSelection: false,
            selection: {
              offerId: "",
              upgradeId: "pilot_speed",
              role: "pilot",
              source: "player"
            }
          }
        ])
      }
    };

    const view = toControllerRoomView(state, "p1");
    expect(view?.game?.upgrade?.offer.role).toBe("pilot");
    expect(view?.game?.upgrade?.offer.cards).toHaveLength(3);
    expect(view?.game).not.toHaveProperty("hostileProjectiles");
  });

  it("hydrates an authoritative terminal result and readiness", () => {
    const state: NetworkRoomState = {
      roomId: "ROOM123",
      phase: "active",
      runNumber: 3,
      displayConnected: true,
      displayLatencyMs: 20,
      players: collection([
        {
          playerId: "p1",
          playerName: "Alex",
          role: "pilot",
          ready: true,
          connected: true,
          latencyMs: 30
        }
      ]),
      hasGame: true,
      game: {
        tick: 400,
        elapsedMs: 20_000,
        worldWidth: 4400,
        worldHeight: 4400,
        arenaRadius: 2200,
        spaceship: {
          x: 2200,
          y: 2200,
          velocityX: 0,
          velocityY: 0,
          radius: 52,
          hp: 0,
          maxHp: 1000,
          heading: Math.PI / 4
        },
        turretAngle: 0,
        shield: {
          angle: 0,
          arcHalfAngle: 0.72,
          active: false,
          energy: 0,
          capacity: 100
        },
        machineGun: { heat: 100, capacity: 100, overheated: true },
        encounter: {
          phase: "result",
          hasOutcome: true,
          outcome: "defeat",
          waveNumber: 4,
          encounterTick: 400,
          phaseTicksRemaining: 0,
          score: 900
        },
        roleModifiers: {
          pilot: { speedMultiplier: 1, accelerationMultiplier: 1, maxHpBonus: 0 },
          gunner: { damageMultiplier: 1, cooldownMultiplier: 1, projectileSpeedMultiplier: 1 },
          shield: { capacityBonus: 0, rechargeMultiplier: 1, arcWidthBonus: 0 }
        }
      }
    };

    const view = toControllerRoomView(state, "p1");
    expect(view?.runNumber).toBe(3);
    expect(view?.game?.encounter).toMatchObject({ phase: "result", outcome: "defeat" });
    expect(view?.players[0]?.ready).toBe(true);
  });

  it("does not hydrate a v8 projection without runNumber", () => {
    expect(
      toControllerRoomView(
        {
          roomId: "ROOM123",
          phase: "lobby",
          displayConnected: true,
          players: collection([])
        },
        "p1"
      )
    ).toBeUndefined();
  });

  it("reads trimmed room code from URL", () => {
    expect(getRoomFromLocation("?room=%20ABC123%20")).toBe("ABC123");
  });
});
