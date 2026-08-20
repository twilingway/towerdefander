import { ArraySchema, MapSchema, Schema, type, view } from "@colyseus/schema";
import type { CrewRole, RoomPhase } from "@town-defenders/protocol";

export class PlayerState extends Schema {
  @type("string") playerId = "";
  @type("string") playerName = "";
  @type("string") role: CrewRole = "pilot";
  @type("boolean") ready = false;
  @type("boolean") connected = true;
}

export class CastleState extends Schema {
  @type("float64") x = 0;
  @type("float64") y = 0;
  @type("float64") velocityX = 0;
  @type("float64") velocityY = 0;
  @type("float64") radius = 0;
}

export class ShieldState extends Schema {
  @type("float64") angle = 0;
  @type("boolean") active = false;
  @type("float64") energy = 0;
  @type("float64") capacity = 0;
}

export class ObstacleState extends Schema {
  @type("string") obstacleId = "";
  @type("string") kind: "rectangle" | "circle" = "rectangle";
  @type("float64") x = 0;
  @type("float64") y = 0;
  @type("float64") width = 0;
  @type("float64") height = 0;
  @type("float64") radius = 0;
  @type("float64") rotation = 0;
}

export class ProjectileState extends Schema {
  @type("string") projectileId = "";
  @type("float64") x = 0;
  @type("float64") y = 0;
  @type("float64") velocityX = 0;
  @type("float64") velocityY = 0;
  @type("float64") radius = 0;
}

export class FlyingCastleDisplayState extends Schema {
  @type([ObstacleState]) obstacles = new ArraySchema<ObstacleState>();
  @type([ProjectileState]) projectiles = new ArraySchema<ProjectileState>();
}

export class FlyingCastleGameState extends Schema {
  @type("uint32") tick = 0;
  @type("uint32") elapsedMs = 0;
  @type("uint16") worldWidth = 2400;
  @type("uint16") worldHeight = 1600;
  @type(CastleState) castle = new CastleState();
  @type("float64") turretAngle = 0;
  @type(ShieldState) shield = new ShieldState();
  @view(1)
  @type(FlyingCastleDisplayState)
  display = new FlyingCastleDisplayState();
}

export class TownDefendersState extends Schema {
  @type("string") roomId = "";
  @type("string") phase: RoomPhase = "lobby";
  @type("boolean") displayConnected = false;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("boolean") hasGame = false;
  @type(FlyingCastleGameState) game = new FlyingCastleGameState();
}
