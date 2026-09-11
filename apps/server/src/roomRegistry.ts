import { defineRoom } from "colyseus";
import { ARENA_ROOM_TYPE, ROOM_TYPE } from "@spaceship-defender/protocol";

import { SpaceshipArenaRoom } from "./rooms/SpaceshipArenaRoom.js";
import { SpaceshipDefenderRoom } from "./rooms/SpaceshipDefenderRoom.js";

export const ROOM_DEFINITIONS = {
  [ROOM_TYPE]: defineRoom(SpaceshipDefenderRoom),
  [ARENA_ROOM_TYPE]: defineRoom(SpaceshipArenaRoom)
};
