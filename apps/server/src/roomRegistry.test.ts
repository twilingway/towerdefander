import { ROOM_TYPE } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import { ROOM_DEFINITIONS } from "./roomRegistry.js";

describe("SpaceShip Defender room registration", () => {
  it("registers only the v11 room type and leaves the legacy route unavailable", () => {
    expect(Object.keys(ROOM_DEFINITIONS)).toEqual([ROOM_TYPE]);
    expect(ROOM_DEFINITIONS).not.toHaveProperty("town_defenders");
  });
});
