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
