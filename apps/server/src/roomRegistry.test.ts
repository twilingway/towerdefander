import { ARENA_ROOM_TYPE, ROOM_TYPE } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import { ROOM_DEFINITIONS } from "./roomRegistry.js";

describe("SpaceShip Defender room registration", () => {
  it("registers the campaign and the arena, and leaves the legacy route unavailable", () => {
    // Two modes, two room types: they run different simulations, so a room that
    // could be either would have to answer every message for both.
    expect(Object.keys(ROOM_DEFINITIONS)).toEqual([ROOM_TYPE, ARENA_ROOM_TYPE]);
    expect(ROOM_DEFINITIONS).not.toHaveProperty("town_defenders");
  });
});
