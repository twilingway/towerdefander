import { defineRoom } from "colyseus";
import { ROOM_TYPE } from "@spaceship-defender/protocol";

import { SpaceshipDefenderRoom } from "./rooms/SpaceshipDefenderRoom.js";

export const ROOM_DEFINITIONS = {
  [ROOM_TYPE]: defineRoom(SpaceshipDefenderRoom)
};
