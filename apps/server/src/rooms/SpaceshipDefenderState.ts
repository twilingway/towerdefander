import { ArraySchema, MapSchema, Schema, type, view } from "@colyseus/schema";
import type {
  CrewRole,
  DefeatReason,
  EncounterPhase,
  EnemyKind,
  RoomPhase,
  TerminalOutcome,
  UpgradeId
} from "@spaceship-defender/protocol";

export class PlayerState extends Schema {
  @type("string") playerId = "";
  @type("string") playerName = "";
  @type("string") role: CrewRole = "pilot";
  @type("boolean") ready = false;
  @type("boolean") connected = true;
  @type("int32") latencyMs = -1;
}

export class SpaceshipState extends Schema {
  @type("float64") x = 0;
  @type("float64") y = 0;
  @type("float64") velocityX = 0;
  @type("float64") velocityY = 0;
  @type("float64") radius = 0;
  @type("float64") hp = 0;
  @type("float64") maxHp = 0;
  @type("float64") heading = 0;
}

export class MachineGunState extends Schema {
  @type("float64") heat = 0;
  @type("float64") capacity = 0;
  @type("boolean") overheated = false;
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
  @type("boolean") hasOutcome = false;
  @type("string") outcome: TerminalOutcome = "defeat";
  @type("boolean") hasDefeatReason = false;
  @type("string") defeatReason: DefeatReason = "spaceship_destroyed";
  @type("uint32") waveNumber = 1;
  @type("uint32") encounterTick = 0;
  @type("uint16") phaseTicksRemaining = 0;
  @type("uint32") waveSecondsRemaining = 0;
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
  @type("string") role: CrewRole = "pilot";
  @type("string") label = "";
  @type("float64") value = 0;
  @type("uint8") price = 5;
}

export class UpgradeOfferState extends Schema {
  @type("string") offerId = "";
  @type("uint32") waveNumber = 1;
  @type([UpgradeCardState]) cards = new ArraySchema<UpgradeCardState>();
}

export class UpgradeSelectionState extends Schema {
  @type("string") offerId = "";
  @type("string") upgradeId: UpgradeId = "pilot_speed";
  @type("string") role: CrewRole = "pilot";
  @type("uint32") waveNumber = 1;
  @type("uint8") price = 5;
}

export class UpgradeVoteState extends Schema {
  @type("string") role: CrewRole = "pilot";
  @type("string") upgradeId: UpgradeId = "pilot_speed";
  @type("uint32") revision = 1;
}

export class TeamUpgradeState extends Schema {
  @type("boolean") hasOffer = false;
  @type(UpgradeOfferState) offer = new UpgradeOfferState();
  @type({ map: UpgradeVoteState }) votes = new MapSchema<UpgradeVoteState>();
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
  @type("string") source = "";
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

/** Per-run enemy catalogue: the display draws silhouettes from this, not from code. */
export class EnemyVisualState extends Schema {
  @type("string") kind = "";
  @type("string") label = "";
  @type("string") shape = "arrowhead";
  @type("string") color = "#e65f4b";
  @type("string") outline = "#ffd1b0";
  @type("boolean") showHealthBar = false;
}

export class SpaceshipDisplayState extends Schema {
  @type({ map: EnemyVisualState }) enemyCatalogue = new MapSchema<EnemyVisualState>();
  @type([ObstacleState]) obstacles = new ArraySchema<ObstacleState>();
  @type({ map: EnemyState }) enemyShips = new MapSchema<EnemyState>();
  @type({ map: AsteroidState }) asteroids = new MapSchema<AsteroidState>();
  @type({ map: ProjectileState }) friendlyProjectiles = new MapSchema<ProjectileState>();
  @type({ map: ProjectileState }) hostileProjectiles = new MapSchema<ProjectileState>();
  @type({ map: HomingMissileState }) homingMissiles = new MapSchema<HomingMissileState>();
}

export class SpaceshipGameState extends Schema {
  @type("uint32") tick = 0;
  @type("uint32") elapsedMs = 0;
  @type("uint16") worldWidth = 4400;
  @type("uint16") worldHeight = 4400;
  @type("uint16") arenaRadius = 2200;
  @type(SpaceshipState) spaceship = new SpaceshipState();
  @type("float64") turretAngle = 0;
  @type(ShieldState) shield = new ShieldState();
  @type(MachineGunState) machineGun = new MachineGunState();
  @type(EncounterState) encounter = new EncounterState();
  @type(RoleModifiersState) roleModifiers = new RoleModifiersState();
  @type("uint32") credits = 0;
  @type(TeamUpgradeState) teamUpgrade = new TeamUpgradeState();
  @view(1)
  @type(SpaceshipDisplayState)
  display = new SpaceshipDisplayState();
}

export class SpaceshipDefenderState extends Schema {
  @type("string") roomId = "";
  @type("string") phase: RoomPhase = "lobby";
  @type("uint32") runNumber = 0;
  @type("boolean") displayConnected = false;
  @type("int32") displayLatencyMs = -1;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("boolean") hasGame = false;
  @type(SpaceshipGameState) game = new SpaceshipGameState();
}
