import { MapSchema, Schema, type } from "@colyseus/schema";
import type { RoomPhase } from "@town-defenders/protocol";

export class PlayerState extends Schema {
  @type("string") playerId = "";
  @type("string") playerName = "";
  @type("boolean") ready = false;
  @type("boolean") connected = true;
  @type("uint32") signalCount = 0;
}

export class TownDefendersState extends Schema {
  @type("string") roomId = "";
  @type("string") phase: RoomPhase = "lobby";
  @type("boolean") displayConnected = false;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
