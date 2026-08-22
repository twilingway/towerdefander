import { ArraySchema, MapSchema, Schema, type, view } from "@colyseus/schema";
import type {
  CrewRole,
  EncounterPhase,
  EnemyKind,
  RoomPhase,
  UpgradeId
} from "@town-defenders/protocol";

export class PlayerState extends Schema {
  @type("string") playerId = "";
  @type("string") playerName = "";
  @type("string") role: CrewRole = "pilot";
  @type("boolean") ready = false;
  @type("boolean") connected = true;
  @type("int32") latencyMs = -1;
}

export class CastleState extends Schema {
  @type("float64") x = 0;
  @type("float64") y = 0;
  @type("float64") velocityX = 0;
  @type("float64") velocityY = 0;
  @type("float64") radius = 0;
  @type("float64") hp = 0;
  @type("float64") maxHp = 0;
}

export class ShieldState extends Schema {
  @type("float64") angle = 0;
  @type("boolean") active = false;
  @type("float64") energy = 0;
  @type("float64") capacity = 0;
  @type("float64") arcHalfAngle = Math.PI / 4;
}

export class EncounterState extends Schema {
  @type("string") phase: EncounterPhase = "combat";
  @type("uint32") waveNumber = 1;
  @type("uint32") encounterTick = 0;
  @type("uint16") phaseTicksRemaining = 0;
  @type("uint32") score = 0;
}

export class PilotModifiersState extends Schema {
  @type("float64") speedMultiplier = 1;
  @type("float64") accelerationMultiplier = 1;
  @type("float64") maxHpBonus = 0;
}

export class GunnerModifiersState extends Schema {
  @type("float64") damageMultiplier = 1;
  @type("float64") cooldownMultiplier = 1;
  @type("float64") projectileSpeedMultiplier = 1;
}

export class ShieldModifiersState extends Schema {
  @type("float64") capacityBonus = 0;
  @type("float64") rechargeMultiplier = 1;
  @type("float64") arcWidthBonus = 0;
}

export class RoleModifiersState extends Schema {
  @type(PilotModifiersState) pilot = new PilotModifiersState();
  @type(GunnerModifiersState) gunner = new GunnerModifiersState();
  @type(ShieldModifiersState) shield = new ShieldModifiersState();
}

export class UpgradeCardState extends Schema {
  @type("string") upgradeId: UpgradeId = "pilot_speed";
  @type("string") label = "";
  @type("float64") value = 0;
}

export class UpgradeOfferState extends Schema {
  @type("string") offerId = "";
  @type("string") role: CrewRole = "pilot";
  @type("uint32") waveNumber = 1;
  @type([UpgradeCardState]) cards = new ArraySchema<UpgradeCardState>();
}

export class UpgradeSelectionState extends Schema {
  @type("string") offerId = "";
  @type("string") upgradeId: UpgradeId = "pilot_speed";
  @type("string") role: CrewRole = "pilot";
  @type("string") source: "player" | "fallback" = "player";
}

export class ControllerUpgradeState extends Schema {
  @type("string") status: "available" | "selected" = "available";
  @type(UpgradeOfferState) offer = new UpgradeOfferState();
  @type(UpgradeSelectionState) selection = new UpgradeSelectionState();
  @type("boolean") hasSelection = false;
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

export class EnemyState extends Schema {
  @type("string") entityId = "";
  @type("uint32") spawnSequence = 0;
  @type("string") kind: EnemyKind = "gunship";
  @type("float64") x = 0;
  @type("float64") y = 0;
  @type("float64") velocityX = 0;
  @type("float64") velocityY = 0;
  @type("float64") radius = 0;
  @type("float64") heading = 0;
  @type("float64") hp = 0;
  @type("float64") maxHp = 0;
}

export class AsteroidState extends Schema {
  @type("string") entityId = "";
  @type("uint32") spawnSequence = 0;
  @type("float64") x = 0;
  @type("float64") y = 0;
  @type("float64") velocityX = 0;
  @type("float64") velocityY = 0;
  @type("float64") radius = 0;
  @type("float64") hp = 0;
  @type("float64") maxHp = 0;
}

export class ProjectileState extends Schema {
  @type("string") entityId = "";
  @type("uint32") spawnSequence = 0;
  @type("string") kind: "friendly" | "hostile" = "friendly";
  @type("float64") x = 0;
  @type("float64") y = 0;
  @type("float64") velocityX = 0;
  @type("float64") velocityY = 0;
  @type("float64") radius = 0;
}

export class HomingMissileState extends Schema {
  @type("string") entityId = "";
  @type("uint32") spawnSequence = 0;
  @type("float64") x = 0;
  @type("float64") y = 0;
  @type("float64") velocityX = 0;
  @type("float64") velocityY = 0;
  @type("float64") radius = 0;
  @type("float64") heading = 0;
}

export class FlyingCastleDisplayState extends Schema {
  @type([ObstacleState]) obstacles = new ArraySchema<ObstacleState>();
  @type({ map: EnemyState }) enemyShips = new MapSchema<EnemyState>();
  @type({ map: AsteroidState }) asteroids = new MapSchema<AsteroidState>();
  @type({ map: ProjectileState }) friendlyProjectiles = new MapSchema<ProjectileState>();
  @type({ map: ProjectileState }) hostileProjectiles = new MapSchema<ProjectileState>();
  @type({ map: HomingMissileState }) homingMissiles = new MapSchema<HomingMissileState>();
}

export class FlyingCastleGameState extends Schema {
  @type("uint32") tick = 0;
  @type("uint32") elapsedMs = 0;
  @type("uint16") worldWidth = 4800;
  @type("uint16") worldHeight = 3200;
  @type(CastleState) castle = new CastleState();
  @type("float64") turretAngle = 0;
  @type(ShieldState) shield = new ShieldState();
  @type(EncounterState) encounter = new EncounterState();
  @type(RoleModifiersState) roleModifiers = new RoleModifiersState();
  @view(2)
  @type({ map: ControllerUpgradeState })
  upgrade = new MapSchema<ControllerUpgradeState>();
  @view(1)
  @type(FlyingCastleDisplayState)
  display = new FlyingCastleDisplayState();
}

export class TownDefendersState extends Schema {
  @type("string") roomId = "";
  @type("string") phase: RoomPhase = "lobby";
  @type("boolean") displayConnected = false;
  @type("int32") displayLatencyMs = -1;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("boolean") hasGame = false;
  @type(FlyingCastleGameState) game = new FlyingCastleGameState();
}
