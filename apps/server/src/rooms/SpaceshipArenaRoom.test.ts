import {
  ASSET_WAIT_SECONDS,
  PROTOCOL_VERSION,
  clientMessage,
  publicEncounterViewSchema,
  serverMessage
} from "@spaceship-defender/protocol";
import type { Client } from "colyseus";
import {
  advanceArenaMatch,
  type ArenaMatchConfig,
  type ArenaMatchState
} from "@spaceship-defender/game-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpaceshipArenaRoom } from "./SpaceshipArenaRoom.js";
import { getBalanceStore } from "../balance/index.js";
import { getServerRecords } from "../stats/index.js";

/**
 * What the matchmaker does between constructing a room and calling `onCreate`:
 * without it the room has no state accessor and is not the room the server
 * runs. The campaign's own tests do the same thing for the same reason.
 */
function initRoom<T extends object>(room: T): T {
  const internals = room as unknown as { __init: () => void; _listing: Record<string, unknown> };
  internals.__init();
  internals._listing = {};
  return room;
}

/** The private surface this file reaches into, named rather than cast inline. */
interface ArenaInternals {
  publishStats: () => Promise<void>;
  match: ArenaMatchState | undefined;
  playerSessionId: string | undefined;
  config: ArenaMatchConfig;
  started: boolean;
  publish: () => void;
}

const openRooms: SpaceshipArenaRoom[] = [];

afterEach(() => {
  for (const room of openRooms.splice(0)) {
    room.clock.clear();
  }
});

function arenaRoom(): { room: SpaceshipArenaRoom; internals: ArenaInternals } {
  const room = initRoom(new SpaceshipArenaRoom());
  openRooms.push(room);
  room.onCreate();
  return { room, internals: room as unknown as ArenaInternals };
}

/** Runs the match to its own clock limit, which is how a match ends on time. */
function playToTheEnd(internals: ArenaInternals): void {
  const config: ArenaMatchConfig = { ...internals.config, matchTickLimit: 2 };
  internals.config = config;
  let match = internals.match;
  if (match === undefined) throw new Error("the room built no match");
  for (let tick = 0; tick < 4; tick += 1) match = advanceArenaMatch(match, new Map(), config);
  internals.match = match;
  internals.started = true;
}

/** Puts a pilot in the player's seat, which is what the room gates on. */
function seat(internals: ArenaInternals): string {
  internals.playerSessionId = "pilot-1";
  internals.started = true;
  const match = internals.match;
  if (match === undefined) throw new Error("the room built no match");
  const player = match.ships[0];
  if (player === undefined) throw new Error("the match has no player slot");
  return player.id;
}

/** Wrecks one hull without touching the rest of the match. */
function wreck(internals: ArenaInternals, slot: number): void {
  const match = internals.match;
  if (match === undefined) throw new Error("the room built no match");
  internals.match = {
    ...match,
    ships: match.ships.map((ship, index) =>
      index === slot ? { ...ship, hp: 0, alive: false } : ship
    )
  };
}

/** Everything the contract is told about the encounter, read back off the state. */
function encounterOf(room: SpaceshipArenaRoom): Record<string, unknown> {
  const encounter = room.state.game.encounter;
  return {
    phase: encounter.phase,
    outcome: encounter.hasOutcome ? encounter.outcome : null,
    defeatReason: encounter.hasDefeatReason ? encounter.defeatReason : null,
    waveNumber: encounter.waveNumber,
    encounterTick: encounter.encounterTick,
    phaseTicksRemaining: encounter.phaseTicksRemaining,
    waveSecondsRemaining: encounter.waveSecondsRemaining,
    lootWindowSecondsRemaining: encounter.lootWindowSecondsRemaining,
    score: encounter.score
  };
}

describe("every way a match can end", () => {
  /*
   * Three endings, and all three published a view the display refuses - which
   * is a frozen picture and no message at all. They are checked here one by
   * one rather than argued about, because the only difference between them is
   * two fields and the contract cares about both.
   */
  it("survives the player being shot down while the others fight on", () => {
    const { room, internals } = arenaRoom();
    seat(internals);
    wreck(internals, 0);
    internals.publish();

    const encounter = encounterOf(room);
    expect(encounter.phase).toBe("result");
    expect(encounter.outcome).toBe("defeat");
    expect(encounter.defeatReason).toBe("spaceship_destroyed");
    expect(encounter.waveSecondsRemaining).toBe(0);
    expect(publicEncounterViewSchema.safeParse(encounter).error?.issues ?? []).toEqual([]);
  });

  it("survives the player being the last one in the sky", () => {
    const { room, internals } = arenaRoom();
    const playerId = seat(internals);
    const match = internals.match;
    if (match === undefined) throw new Error("the room built no match");
    internals.match = {
      ...match,
      phase: "result",
      winnerShipId: playerId,
      ships: match.ships.map((ship, index) =>
        index === 0 ? ship : { ...ship, hp: 0, alive: false }
      )
    };
    internals.publish();

    const encounter = encounterOf(room);
    expect(encounter.phase).toBe("result");
    expect(encounter.outcome).toBe("victory");
    // A victory with a defeat reason on it is refused as loudly as a defeat
    // without one; the contract checks the pair, not either half.
    expect(encounter.defeatReason).toBeNull();
    expect(encounter.waveSecondsRemaining).toBe(0);
    expect(publicEncounterViewSchema.safeParse(encounter).error?.issues ?? []).toEqual([]);
  });

  it("survives the clock running out with the player still flying", () => {
    const { room, internals } = arenaRoom();
    seat(internals);
    playToTheEnd(internals);
    internals.publish();

    const encounter = encounterOf(room);
    expect(encounter.phase).toBe("result");
    expect(encounter.outcome).toBe("defeat");
    expect(encounter.defeatReason).toBe("wave_timeout");
    expect(encounter.waveSecondsRemaining).toBe(0);
    expect(publicEncounterViewSchema.safeParse(encounter).error?.issues ?? []).toEqual([]);
  });
});

describe("the arena's published encounter", () => {
  it("drops the match clock when the match is over", () => {
    /*
     * The contract has one rule about this field and it is absolute: only
     * combat may publish a wave countdown. A match kept publishing its own
     * after the fight was decided, so the view stopped parsing the moment
     * somebody won - and a display that cannot parse holds its last good
     * snapshot, which is a frozen picture at the exact instant of winning.
     */
    const { room, internals } = arenaRoom();
    playToTheEnd(internals);
    internals.publish();

    const encounter = room.state.game.encounter;
    expect(encounter.phase).toBe("result");
    expect(encounter.waveSecondsRemaining).toBe(0);
  });

  it("publishes an encounter the display contract accepts, won or still being fought", () => {
    const { room, internals } = arenaRoom();
    const read = () => ({
      phase: room.state.game.encounter.phase,
      outcome: room.state.game.encounter.hasOutcome ? room.state.game.encounter.outcome : null,
      defeatReason: room.state.game.encounter.hasDefeatReason
        ? room.state.game.encounter.defeatReason
        : null,
      waveNumber: room.state.game.encounter.waveNumber,
      encounterTick: room.state.game.encounter.encounterTick,
      phaseTicksRemaining: room.state.game.encounter.phaseTicksRemaining,
      waveSecondsRemaining: room.state.game.encounter.waveSecondsRemaining,
      lootWindowSecondsRemaining: room.state.game.encounter.lootWindowSecondsRemaining,
      score: room.state.game.encounter.score
    });

    internals.started = true;
    internals.publish();
    expect(publicEncounterViewSchema.safeParse(read()).success).toBe(true);

    playToTheEnd(internals);
    internals.publish();
    const ended = publicEncounterViewSchema.safeParse(read());
    expect(ended.error?.issues ?? []).toEqual([]);
  });

  /**
   * An emptied match is kept for half a minute, then let go.
   *
   * Kept, because a phone that loses the network for a few seconds has to come
   * back to its own fight rather than to a lobby. Let go, because an empty room
   * still steps sixteen hulls sixty times a second - about four and a half
   * megabytes and a share of a core each, and four of them were found sitting
   * on a stand with nobody in any of them.
   */
  it("holds an emptied match for half a minute before closing it", () => {
    const { room, internals } = arenaRoom();
    const hold = vi.spyOn(room.clock, "setTimeout");
    const close = vi.spyOn(room, "disconnect").mockResolvedValue(undefined);

    internals.started = true;
    room.onLeave();

    expect(close).not.toHaveBeenCalled();
    expect(hold.mock.calls.at(-1)?.[1]).toBe(30_000);
  });

  /** A queue nobody is in is over at once: there is no fight to come back to. */
  it("closes a waiting room the moment the last person leaves", () => {
    const { room } = arenaRoom();
    const close = vi.spyOn(room, "disconnect").mockResolvedValue(undefined);

    room.onLeave();

    expect(close).toHaveBeenCalledTimes(1);
  });

  /**
   * A match appears on the room dashboard at all.
   *
   * It published nothing until now, so the page counted campaign rooms and
   * called the number "players online" - a person flying a match was, to that
   * page, not on the server.
   */
  it("reports itself to the dashboard as an arena room", async () => {
    const { room, internals } = arenaRoom();
    const setMetadata = vi.spyOn(room, "setMetadata").mockResolvedValue(undefined);

    await internals.publishStats();
    expect(setMetadata).toHaveBeenCalledTimes(1);
    expect(setMetadata.mock.calls.at(-1)?.[0]).toMatchObject({
      mode: "arena",
      status: "lobby",
      capacity: internals.config.shipCount
    });

    // And a started match is a fight rather than a queue.
    internals.started = true;
    await internals.publishStats();
    expect(setMetadata.mock.calls.at(-1)?.[0]).toMatchObject({ mode: "arena", status: "combat" });
  });

  /**
   * The match's frame and the match's sector range are the arena's own.
   *
   * Both used to be read off the campaign's ship, which made the bot's slice a
   * different frame from the one the screen draws and gave the sector a reason
   * to come up that meant something else in this mode. The room builds its hull
   * from the arena section, and this is what says so.
   */
  it("builds the hull on the arena's own numbers, not the campaign's", () => {
    const tuning = getBalanceStore().getActiveTuning() as unknown as {
      cameraViewWidth: number;
      shieldAutopilotRaiseRange: number;
      arena: { cameraViewWidth: number; shieldAutopilotRaiseRange: number };
    };
    const before = {
      cameraViewWidth: tuning.cameraViewWidth,
      raiseRange: tuning.shieldAutopilotRaiseRange,
      arenaCameraViewWidth: tuning.arena.cameraViewWidth,
      arenaRaiseRange: tuning.arena.shieldAutopilotRaiseRange
    };
    tuning.cameraViewWidth = 1_600;
    tuning.shieldAutopilotRaiseRange = 111;
    tuning.arena.cameraViewWidth = 3_000;
    tuning.arena.shieldAutopilotRaiseRange = 777;
    try {
      const { internals } = arenaRoom();
      expect(internals.config.ship.cameraViewWidth).toBe(3_000);
      expect(internals.config.ship.shieldAutopilotRaiseRange).toBe(777);
    } finally {
      tuning.cameraViewWidth = before.cameraViewWidth;
      tuning.shieldAutopilotRaiseRange = before.raiseRange;
      tuning.arena.cameraViewWidth = before.arenaCameraViewWidth;
      tuning.arena.shieldAutopilotRaiseRange = before.arenaRaiseRange;
    }
  });
});

describe("the arena's display latency", () => {
  it("probes the cockpit and publishes its round trip", () => {
    const { room } = arenaRoom();
    room.roomId = "ARENA1";
    const send = vi.fn();
    const client = { sessionId: "pilot-1", send, view: undefined } as unknown as Client;
    room.onJoin(client, { role: "solo", playerName: "Пилот" });
    expect(room.state.displayLatencyMs).toBe(-1);

    const probe = send.mock.calls.find((call) => call[0] === serverMessage.latencyProbe);
    const probeId = (probe?.[1] as { probeId: string } | undefined)?.probeId;
    expect(probeId).toBeDefined();
    const handlers = (
      room as unknown as {
        inputHandlers: Record<string, ((client: Client, payload: unknown) => void) | undefined>;
      }
    ).inputHandlers;
    handlers[clientMessage.latencyPong]?.(client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: "ARENA1",
      probeId
    });

    expect(room.state.displayLatencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("the arena in the server records", () => {
  it("counts itself on its heartbeat and leaves the count when disposed", async () => {
    const { room, internals } = arenaRoom();
    vi.spyOn(room, "setMetadata").mockResolvedValue(undefined);
    const observe = vi.spyOn(getServerRecords(), "observe");
    const forget = vi.spyOn(getServerRecords(), "forget");
    try {
      await internals.publishStats();
      const reported = observe.mock.calls.at(-1)?.[0];
      expect(reported).toMatchObject({ mode: "arena", connections: 0 });

      room.onDispose();
      expect(forget).toHaveBeenCalledWith(reported?.statsId);
    } finally {
      observe.mockRestore();
      forget.mockRestore();
    }
  });
});

describe("the arena queue and a loading player", () => {
  interface Queue {
    countDown: () => void;
    waitSecondsRemaining: number;
    inputHandlers: Record<string, ((client: Client, payload: unknown) => void) | undefined>;
  }

  function queueWithLoadingPlayer(): { client: Client; queue: Queue } {
    const { room } = arenaRoom();
    room.roomId = "ARENA1";
    const client = { sessionId: "pilot-1", send: vi.fn(), view: undefined } as unknown as Client;
    room.onJoin(client, { role: "solo", playerName: "Ada", loadsAssets: true });
    return { client, queue: room as unknown as Queue };
  }

  it("holds its count while the player's screen loads, but not past the asset wait", () => {
    const { queue } = queueWithLoadingPlayer();
    const before = queue.waitSecondsRemaining;

    for (let second = 0; second < ASSET_WAIT_SECONDS; second += 1) queue.countDown();
    expect(queue.waitSecondsRemaining).toBe(before);

    queue.countDown();
    expect(queue.waitSecondsRemaining).toBe(before - 1);
  });

  it("starts its count as soon as the player's assets are in", () => {
    const { client, queue } = queueWithLoadingPlayer();
    queue.inputHandlers[clientMessage.assetsReady]?.(client, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: "ARENA1"
    });
    const before = queue.waitSecondsRemaining;

    queue.countDown();
    expect(queue.waitSecondsRemaining).toBe(before - 1);
  });
});
