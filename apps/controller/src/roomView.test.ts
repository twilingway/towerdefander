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
  it("decodes compact v8 state without mass entities and derives the assigned role", () => {
    const state: NetworkRoomState = {
      roomId: "ROOM123",
      phase: "active",
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
        worldWidth: 2400,
        worldHeight: 1600,
        castle: {
          x: 1200,
          y: 800,
          velocityX: 0,
          velocityY: 0,
          radius: 52,
          hp: 900,
          maxHp: 1000
        },
        turretAngle: 0,
        shield: {
          angle: Math.PI,
          arcHalfAngle: 0.8,
          active: true,
          energy: 64,
          capacity: 100
        },
        encounter: {
          phase: "combat",
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
    expect(findCurrentPlayer(view, "p2")?.role).toBe("shield");
    expect(findCurrentPlayer(view, "p2")?.latencyMs).toBe(62);
    expect(view?.displayLatencyMs).toBeNull();
    expect(view?.assignedRole).toBe("shield");
    expect(view?.game?.upgrade).toBeNull();
    expect(view?.game).not.toHaveProperty("enemyShips");
  });

  it("unwraps only the personalized upgrade entry visible to this controller", () => {
    const state: NetworkRoomState = {
      roomId: "ROOM123",
      phase: "active",
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
        worldWidth: 2400,
        worldHeight: 1600,
        castle: {
          x: 1200,
          y: 800,
          velocityX: 0,
          velocityY: 0,
          radius: 52,
          hp: 1000,
          maxHp: 1000
        },
        turretAngle: 0,
        shield: {
          angle: 0,
          arcHalfAngle: 0.72,
          active: false,
          energy: 100,
          capacity: 100
        },
        encounter: {
          phase: "intermission",
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

  it("reads trimmed room code from URL", () => {
    expect(getRoomFromLocation("?room=%20ABC123%20")).toBe("ABC123");
  });
});
