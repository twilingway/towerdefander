import { PLAYER_CAPACITY, PROTOCOL_VERSION } from "@spaceship-defender/protocol";
import { getEnemyArchetype, type SpaceshipSimulationConfig } from "@spaceship-defender/game-core";
import type { BalanceTuning } from "@spaceship-defender/protocol";
import type { Client } from "colyseus";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BalanceStore, createDefaultTuning } from "../balance/store.js";

const store = new BalanceStore({
  filePath: "unused-in-tests.json",
  logger: { warn: vi.fn() }
});

vi.mock("../balance/index.js", () => ({
  getBalanceStore: () => store
}));

const { SpaceshipDefenderRoom } = await import("./SpaceshipDefenderRoom.js");

type Room = InstanceType<typeof SpaceshipDefenderRoom>;

function client(sessionId: string): Client {
  return { sessionId, send: vi.fn() } as unknown as Client;
}

function startedRoom(): Room {
  const room = new SpaceshipDefenderRoom();
  room.roomId = "ROOM123";
  room.onCreate({ role: "display", protocolVersion: PROTOCOL_VERSION });
  const controllers = Array.from({ length: PLAYER_CAPACITY }, (_, index) => {
    const controller = client(`player-${String(index + 1)}`);
    room.onJoin(controller, {
      role: "controller",
      protocolVersion: PROTOCOL_VERSION,
      playerName: `Player ${String(index + 1)}`
    });
    return controller;
  });
  for (const controller of controllers) {
    room.handleReady(controller, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      playerId: controller.sessionId,
      runNumber: room.state.runNumber
    });
  }
  return room;
}

function activeConfig(room: Room): SpaceshipSimulationConfig {
  return (room as unknown as { gameConfig: SpaceshipSimulationConfig }).gameConfig;
}

function requireArchetype(tuning: BalanceTuning, kind: string) {
  const archetype = tuning.enemyArchetypes[kind];
  if (archetype === undefined) throw new Error(`missing archetype ${kind}`);
  return archetype;
}

function tuningWithGunshipHp(hp: number): BalanceTuning {
  const tuning = createDefaultTuning();
  return {
    ...tuning,
    enemyArchetypes: {
      ...tuning.enemyArchetypes,
      gunship: { ...requireArchetype(tuning, "gunship"), hp }
    }
  };
}

describe("balance application to runs", () => {
  beforeEach(() => {
    vi.spyOn(store, "getActiveSimulationConfig");
  });

  it("starts a run on the active preset", () => {
    vi.spyOn(store, "getActiveTuning").mockReturnValue(tuningWithGunshipHp(512));
    const room = startedRoom();
    expect(getEnemyArchetype(activeConfig(room), "gunship").hp).toBe(512);
    room.onDispose();
  });

  it("publishes the tuned camera frame to the display projection", () => {
    const tuning = createDefaultTuning();
    vi.spyOn(store, "getActiveTuning").mockReturnValue({ ...tuning, cameraViewWidth: 3200 });
    const room = startedRoom();

    // The display frames the world from this value, so a dropped sync would
    // silently leave every screen on the schema default.
    expect(activeConfig(room).cameraViewWidth).toBe(3200);
    expect(room.state.game.display.cameraViewWidth).toBe(3200);
    room.onDispose();
  });

  it("keeps a running run on the balance it started with", () => {
    vi.spyOn(store, "getActiveTuning").mockReturnValue(tuningWithGunshipHp(128));
    const room = startedRoom();
    expect(getEnemyArchetype(activeConfig(room), "gunship").hp).toBe(128);

    vi.spyOn(store, "getActiveTuning").mockReturnValue(tuningWithGunshipHp(999));
    expect(getEnemyArchetype(activeConfig(room), "gunship").hp).toBe(128);
    room.onDispose();
  });
});
