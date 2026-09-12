import { publicEncounterViewSchema } from "@spaceship-defender/protocol";
import {
  advanceArenaMatch,
  type ArenaMatchConfig,
  type ArenaMatchState
} from "@spaceship-defender/game-core";
import { afterEach, describe, expect, it } from "vitest";

import { SpaceshipArenaRoom } from "./SpaceshipArenaRoom.js";

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
});
