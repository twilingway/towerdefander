import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import type { DefenseResult, RoomPhase } from "@town-defenders/protocol";

export class PlayerState extends Schema {
  @type("string") playerId = "";
  @type("string") playerName = "";
  @type("boolean") ready = false;
  @type("boolean") connected = true;
  @type("int8") sectorId = -1;
}

export class DefenseSectorState extends Schema {
  @type("uint8") sectorId = 0;
  @type("string") assignedPlayerId = "";
  @type("uint32") gateHealth = 0;
  @type("uint32") gateMaxHealth = 0;
  @type("uint8") defenseLevel = 1;
  @type("uint32") defenseDamage = 0;
  @type("int32") nextUpgradeCost = -1;
}

export class DefenseEnemyState extends Schema {
  @type("string") enemyId = "";
  @type("uint8") sectorId = 0;
  @type("uint32") health = 0;
  @type("uint32") progress = 0;
}

export class DefenseGameState extends Schema {
  @type("uint32") tick = 0;
  @type("uint32") elapsedMs = 0;
  @type("uint32") treasury = 0;
  @type("uint32") pathLength = 0;
  @type("uint32") repairCost = 0;
  @type("string") result: DefenseResult = "in_progress";
  @type([DefenseSectorState]) sectors = new ArraySchema<DefenseSectorState>();
  @type([DefenseEnemyState]) enemies = new ArraySchema<DefenseEnemyState>();
}

export class TownDefendersState extends Schema {
  @type("string") roomId = "";
  @type("string") phase: RoomPhase = "lobby";
  @type("boolean") displayConnected = false;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("boolean") hasGame = false;
  @type(DefenseGameState) game = new DefenseGameState();
}
