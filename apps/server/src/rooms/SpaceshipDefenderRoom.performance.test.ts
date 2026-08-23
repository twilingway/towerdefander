import { Decoder, Encoder, StateView } from "@colyseus/schema";
import { dynamicEntityCount, type SpaceshipSimulationState } from "@spaceship-defender/game-core";
import { PLAYER_CAPACITY, PROTOCOL_VERSION } from "@spaceship-defender/protocol";
import type { Client } from "colyseus";
import { describe, expect, it, vi } from "vitest";

import { createWorstCaseCombatFixture } from "../benchmarks/worstCaseCombat.js";
import { SpaceshipDefenderRoom } from "./SpaceshipDefenderRoom.js";
import { SpaceshipDefenderState } from "./SpaceshipDefenderState.js";

interface TestClient {
  readonly client: Client;
  readonly send: ReturnType<typeof vi.fn>;
}

interface RoomInternals {
  gameState: SpaceshipSimulationState | undefined;
  sequenceWatermarks: Map<string, Map<string, number>>;
  outstandingLatencyProbes: Map<string, { readonly probeId: string; readonly sentAt: number }>;
}

describe("SpaceshipDefenderRoom cap traffic", () => {
  it("encodes latency and one keyed entity change without resending unchanged collections", () => {
    const { room } = startGame();
    const runtime = internals(room);
    runtime.gameState = createWorstCaseCombatFixture();
    room.advanceGameStep();

    expect(schemaEntityCount(room.state)).toBe(196);
    const encoder = new Encoder(room.state);
    const displayView = new StateView();
    displayView.add(room.state.game, 1);
    const decoderState = new SpaceshipDefenderState();
    const decoder = new Decoder(decoderState);

    const fullSnapshot = encodeAllForView(encoder, displayView);
    decoder.decode(fullSnapshot);
    encoder.discardChanges();
    const firstEnemyId = room.state.game.display.enemyShips.keys().next().value;
    const secondEnemyId = [...room.state.game.display.enemyShips.keys()][1];
    if (firstEnemyId === undefined || secondEnemyId === undefined) {
      throw new Error("Expected two cap-fixture enemies.");
    }
    const decodedMap = decoderState.game.display.enemyShips;
    const decodedFirst = decodedMap.get(firstEnemyId);
    const decodedSecond = decodedMap.get(secondEnemyId);
    if (decodedFirst === undefined || decodedSecond === undefined) {
      throw new Error("Expected decoded keyed enemies.");
    }
    const unchangedSecondX = decodedSecond.x;

    room.state.displayLatencyMs = 37;
    const latencyOnlyPatch = encodeChangesForView(encoder, displayView);
    decoder.decode(latencyOnlyPatch);
    encoder.discardChanges();

    expect(latencyOnlyPatch.byteLength).toBeLessThan(fullSnapshot.byteLength / 20);
    expect(decoderState.game.display.enemyShips).toBe(decodedMap);
    expect(decodedMap.get(firstEnemyId)).toBe(decodedFirst);
    expect(decodedMap.get(secondEnemyId)).toBe(decodedSecond);

    const authoritativeFirst = room.state.game.display.enemyShips.get(firstEnemyId);
    if (authoritativeFirst === undefined) throw new Error("Expected authoritative keyed enemy.");
    authoritativeFirst.x += 1;
    room.state.game.tick += 1;
    const oneEntityPatch = encodeChangesForView(encoder, displayView);
    decoder.decode(oneEntityPatch);
    encoder.discardChanges();

    expect(oneEntityPatch.byteLength).toBeLessThan(fullSnapshot.byteLength / 10);
    expect(decodedMap.get(firstEnemyId)).toBe(decodedFirst);
    expect(decodedFirst.x).toBe(authoritativeFirst.x);
    expect(decodedMap.get(secondEnemyId)).toBe(decodedSecond);
    expect(decodedSecond.x).toBe(unchangedSecondX);
  });

  it("accepts 20-Hz role controls and a latency pong while 196 entities are simulated", () => {
    const { room, controllers } = startGame();
    const runtime = internals(room);
    const fixture = createWorstCaseCombatFixture();
    runtime.gameState = fixture;
    const pilot = controllerAt(controllers, 0);
    const gunner = controllerAt(controllers, 1);
    const shield = controllerAt(controllers, 2);
    const outstanding = runtime.outstandingLatencyProbes.get(pilot.client.sessionId);
    if (outstanding === undefined) throw new Error("Expected the pilot latency probe.");

    for (let sequence = 1; sequence <= 20; sequence += 1) {
      room.handlePilotInput(pilot.client, {
        ...envelope(room, pilot),
        sequence,
        vector: { x: 1, y: 0 }
      });
      room.handleGunnerInput(gunner.client, {
        ...envelope(room, gunner),
        sequence,
        aim: { x: 0, y: -1 },
        firing: false
      });
      room.handleShieldInput(shield.client, {
        ...envelope(room, shield),
        sequence,
        aim: { x: -1, y: 0 },
        active: false
      });
      if (sequence === 10) {
        room.handleLatencyPong(
          pilot.client,
          {
            protocolVersion: PROTOCOL_VERSION,
            roomId: room.roomId,
            probeId: outstanding.probeId
          },
          outstanding.sentAt + 41
        );
      }
      room.advanceGameStep();
    }

    expect(room.state.game.tick).toBe(fixture.clock.tick + 20);
    expect(room.state.players.get(pilot.client.sessionId)?.latencyMs).toBe(41);
    expect(runtime.sequenceWatermarks.get(pilot.client.sessionId)?.get("pilot:input")).toBe(20);
    expect(runtime.sequenceWatermarks.get(gunner.client.sessionId)?.get("gunner:input")).toBe(20);
    expect(runtime.sequenceWatermarks.get(shield.client.sessionId)?.get("shield:input")).toBe(20);
    expect(dynamicEntityCount(runtime.gameState)).toBeLessThanOrEqual(196);
  });
});

function createClient(sessionId: string): TestClient {
  const send = vi.fn();
  return { client: { sessionId, send } as unknown as Client, send };
}

function startGame(): { readonly room: SpaceshipDefenderRoom; readonly controllers: TestClient[] } {
  const room = new SpaceshipDefenderRoom();
  room.roomId = "PERF196";
  room.onCreate({ role: "display", protocolVersion: PROTOCOL_VERSION });
  const display = createClient("display");
  room.onJoin(display.client, { role: "display", protocolVersion: PROTOCOL_VERSION });
  const controllers = Array.from({ length: PLAYER_CAPACITY }, (_, index) => {
    const controller = createClient(`perf-player-${String(index + 1)}`);
    room.onJoin(controller.client, {
      role: "controller",
      protocolVersion: PROTOCOL_VERSION,
      playerName: `Perf ${String(index + 1)}`
    });
    return controller;
  });
  for (const controller of controllers) {
    room.handleReady(controller.client, envelope(room, controller));
  }
  return { room, controllers };
}

function envelope(room: SpaceshipDefenderRoom, client: TestClient) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    roomId: room.roomId,
    playerId: client.client.sessionId,
    runNumber: room.state.runNumber
  };
}

function controllerAt(controllers: readonly TestClient[], index: number): TestClient {
  const controller = controllers[index];
  if (controller === undefined) throw new Error(`Missing controller ${String(index)}.`);
  return controller;
}

function internals(room: SpaceshipDefenderRoom): RoomInternals {
  return room as unknown as RoomInternals;
}

function schemaEntityCount(state: SpaceshipDefenderState): number {
  const display = state.game.display;
  return (
    display.enemyShips.size +
    display.asteroids.size +
    display.hostileProjectiles.size +
    display.homingMissiles.size +
    display.friendlyProjectiles.size
  );
}

function encodeAllForView(encoder: Encoder<SpaceshipDefenderState>, view: StateView): Uint8Array {
  const iterator = { offset: 0 };
  encoder.encodeAll(iterator);
  return encoder.encodeAllView(view, iterator.offset, iterator);
}

function encodeChangesForView(
  encoder: Encoder<SpaceshipDefenderState>,
  view: StateView
): Uint8Array {
  const iterator = { offset: 0 };
  encoder.encode(iterator);
  return encoder.encodeView(view, iterator.offset, iterator);
}
