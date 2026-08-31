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
      crewSize: 3,
      shipArchetypeId: "guardian",
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
          rearmRequired: false,
          active: true,
          energy: 64,
          capacity: 100
        },
        cannon: { heat: 0, capacity: 100, overheated: false },
        machineGun: { heat: 0, capacity: 100, overheated: false },
        encounter: {
          phase: "combat",
          hasOutcome: false,
          outcome: "defeat",
          hasDefeatReason: false,
          defeatReason: "spaceship_destroyed",
          waveNumber: 2,
          encounterTick: 14,
          phaseTicksRemaining: 0,
          waveSecondsRemaining: 1186,
          lootWindowSecondsRemaining: 0,
          score: 120
        },
        helm: {
          scheme: "tank",
          headingLeadRadians: 0.5,
          stopDampening: 1,
          rotateInPlaceThrottle: 0.02,
          hullAngularBrakingPerSecondSquared: 50
        },
        credits: 4
      }
    };
    const view = toControllerRoomView(state, "p2");
    expect(view?.players.map((player) => player.role)).toEqual(["pilot", "shield"]);
    expect(view?.game).not.toHaveProperty("projectiles");
    expect(view?.game?.shield).toEqual({
      angle: Math.PI,
      arcHalfAngle: 0.8,
      active: true,
      // The panel needs the lockout to know when its button is dead.
      rearmRequired: false,
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
    expect(view?.game?.credits).toBe(4);
    expect(view?.game?.teamUpgrade.offer).toBeNull();
    expect(view?.game?.teamUpgrade.votes).toEqual({ pilot: null, gunner: null, shield: null });
    expect(view?.game?.encounter.defeatReason).toBeNull();
    expect(view?.game?.encounter.waveSecondsRemaining).toBe(1186);
    expect(view?.game).not.toHaveProperty("enemyShips");
  });

  it("projects the shared offer with public votes for every role", () => {
    const state: NetworkRoomState = {
      roomId: "ROOM123",
      phase: "active",
      runNumber: 1,
      crewSize: 3,
      shipArchetypeId: "guardian",
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
          rearmRequired: false,
          active: false,
          energy: 100,
          capacity: 100
        },
        cannon: { heat: 40, capacity: 100, overheated: false },
        machineGun: { heat: 40, capacity: 100, overheated: false },
        encounter: {
          phase: "intermission",
          outcome: null,
          defeatReason: null,
          waveNumber: 1,
          encounterTick: 40,
          phaseTicksRemaining: 200,
          waveSecondsRemaining: 0,
          lootWindowSecondsRemaining: 0,
          score: 100
        },
        credits: 7,
        helm: {
          scheme: "tank",
          headingLeadRadians: 0.5,
          stopDampening: 1,
          rotateInPlaceThrottle: 0.02,
          hullAngularBrakingPerSecondSquared: 50
        },
        teamUpgrade: {
          hasOffer: true,
          offer: {
            offerId: "offer-w1",
            waveNumber: 1,
            tier: 6,
            cards: collection([
              {
                upgradeId: "afterburner",
                role: "pilot",
                label: "Форсаж",
                summary: "Скорость +14%",
                price: 5
              },
              {
                upgradeId: "turretDrive",
                role: "gunner",
                label: "Привод башни",
                summary: "Скорость поворота башни +25%",
                price: 5
              },
              {
                upgradeId: "capacitor2",
                role: "shield",
                label: "Батарея",
                summary: "Ёмкость щита +40",
                price: 5
              }
            ])
          },
          votes: collection([
            { role: "shield", upgradeId: "afterburner", revision: 1 },
            { role: "pilot", upgradeId: "afterburner", revision: 2 }
          ]),
          hasSelection: false,
          selection: {
            offerId: "",
            waveNumber: 1,
            upgradeId: "afterburner",
            role: "pilot",
            price: 5
          }
        }
      }
    };

    const view = toControllerRoomView(state, "p1");
    expect(view?.game?.credits).toBe(7);
    expect(view?.game?.teamUpgrade.offer?.offerId).toBe("offer-w1");
    expect(view?.game?.teamUpgrade.offer?.cards.map((card) => card.role)).toEqual([
      "pilot",
      "gunner",
      "shield"
    ]);
    expect(view?.game?.teamUpgrade.votes.pilot).toEqual({
      role: "pilot",
      upgradeId: "afterburner",
      revision: 2
    });
    expect(view?.game?.teamUpgrade.votes.shield?.revision).toBe(1);
    expect(view?.game?.teamUpgrade.votes.gunner).toBeNull();
    expect(view?.game?.teamUpgrade.selection).toBeNull();
    expect(view?.game).not.toHaveProperty("hostileProjectiles");
  });

  it("hydrates an authoritative terminal result and readiness", () => {
    const state: NetworkRoomState = {
      roomId: "ROOM123",
      phase: "active",
      runNumber: 3,
      crewSize: 3,
      shipArchetypeId: "guardian",
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
          rearmRequired: false,
          active: false,
          energy: 0,
          capacity: 100
        },
        cannon: { heat: 100, capacity: 100, overheated: true },
        machineGun: { heat: 100, capacity: 100, overheated: true },
        encounter: {
          phase: "result",
          hasOutcome: true,
          outcome: "defeat",
          hasDefeatReason: true,
          defeatReason: "spaceship_destroyed",
          waveNumber: 4,
          encounterTick: 400,
          phaseTicksRemaining: 0,
          waveSecondsRemaining: 0,
          lootWindowSecondsRemaining: 0,
          score: 900
        },
        helm: {
          scheme: "tank",
          headingLeadRadians: 0.5,
          stopDampening: 1,
          rotateInPlaceThrottle: 0.02,
          hullAngularBrakingPerSecondSquared: 50
        },
        credits: 12
      }
    };

    const view = toControllerRoomView(state, "p1");
    expect(view?.runNumber).toBe(3);
    expect(view?.game?.credits).toBe(12);
    expect(view?.game?.encounter).toMatchObject({ phase: "result", outcome: "defeat" });
    expect(view?.game?.encounter.defeatReason).toBe("spaceship_destroyed");
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
