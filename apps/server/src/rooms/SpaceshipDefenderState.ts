import { ARENA_CUSHION_BAND } from "@spaceship-defender/game-core";
import { ArraySchema, MapSchema, Schema, type, view } from "@colyseus/schema";
import type {
  AsteroidOrigin,
  LootKind,
  CrewRole,
  DefeatReason,
  EncounterPhase,
  EnemyKind,
  HelmScheme,
  RoomPhase,
  ShieldPhase,
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
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") velocityX = 0;
  @type("float32") velocityY = 0;
  @type("float32") radius = 0;
  @type("float32") hp = 0;
  @type("float32") maxHp = 0;
  @type("float32") heading = 0;
}

/** Heat meter shape; both weapons run hot the same way. */
export class MachineGunState extends Schema {
  @type("float32") heat = 0;
  @type("float32") capacity = 0;
  @type("boolean") overheated = false;
}

/** Keyboard helm feel from the active preset; the controller drives with it. */
export class HelmState extends Schema {
  // Fixed for the run, like the silhouettes: sent once, never per tick.
  @type("string") scheme: HelmScheme = "tank";
  @type("float32") headingLeadRadians = 0.5;
  @type("float32") stopDampening = 1;
  @type("float32") rotateInPlaceThrottle = 0.02;
  /** Mirrors the run's hull braking so the helm predicts against the real one. */
  @type("float32") hullAngularBrakingPerSecondSquared = 50;
}

export class ShieldState extends Schema {
  @type("float32") angle = 0;
  @type("boolean") active = false;
  /** Shared, not display-gated: the operator's button is dead while it is set. */
  @type("boolean") rearmRequired = false;
  @type("float32") energy = 0;
  @type("float32") capacity = 0;
  @type("float32") arcHalfAngle = Math.PI / 4;
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
  @type("uint8") lootWindowSecondsRemaining = 0;
  @type("uint32") score = 0;
}

export class UpgradeCardState extends Schema {
  @type("string") upgradeId: UpgradeId = "pilot_speed";
  @type("string") role: CrewRole = "pilot";
  @type("string") label = "";
  @type("float32") value = 0;
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
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") width = 0;
  @type("float32") height = 0;
  @type("float32") radius = 0;
  @type("float32") rotation = 0;
}

export class EnemyState extends Schema {
  @type("string") entityId = "";
  @type("uint32") spawnSequence = 0;
  @type("string") kind: EnemyKind = "gunship";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") velocityX = 0;
  @type("float32") velocityY = 0;
  @type("float32") radius = 0;
  @type("float32") heading = 0;
  @type("float32") hp = 0;
  @type("float32") maxHp = 0;
}

export class AsteroidState extends Schema {
  @type("string") entityId = "";
  @type("string") origin: AsteroidOrigin = "ambient";
  @type("uint32") spawnSequence = 0;
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") velocityX = 0;
  @type("float32") velocityY = 0;
  @type("float32") radius = 0;
  @type("float32") hp = 0;
  @type("float32") maxHp = 0;
}

/**
 * Salvage the pilot flies to. Display-only like every other arena entity: the
 * controllers never see the world.
 */
export class LootDropState extends Schema {
  @type("string") entityId = "";
  @type("string") kind: LootKind = "repair";
  @type("uint32") spawnSequence = 0;
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") velocityX = 0;
  @type("float32") velocityY = 0;
  @type("float32") radius = 0;
  @type("float32") amount = 0;
}

/** A laser pulse: two points and who fired it, kept for a couple of ticks. */
export class LaserBeamState extends Schema {
  @type("string") entityId = "";
  @type("float32") fromX = 0;
  @type("float32") fromY = 0;
  @type("float32") toX = 0;
  @type("float32") toY = 0;
  @type("string") source = "";
}

export class ProjectileState extends Schema {
  @type("string") entityId = "";
  @type("uint32") spawnSequence = 0;
  @type("string") kind: "friendly" | "hostile" = "friendly";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") velocityX = 0;
  @type("float32") velocityY = 0;
  @type("float32") radius = 0;
  @type("string") source = "";
  /** Empty means the display draws its own default primitive. */
  @type("string") visualShape = "";
  @type("float32") visualScale = 1;
}

export class HomingMissileState extends Schema {
  @type("string") entityId = "";
  @type("uint32") spawnSequence = 0;
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") velocityX = 0;
  @type("float32") velocityY = 0;
  @type("float32") radius = 0;
  @type("float32") heading = 0;
  /** Empty means the display draws its own default primitive. */
  @type("string") visualShape = "";
  @type("float32") visualScale = 1;
}

/** Per-run enemy catalogue: the display draws silhouettes from this, not from code. */
export class EnemyVisualState extends Schema {
  @type("string") kind = "";
  @type("string") label = "";
  @type("string") shape = "ship-spear";
  @type("float32") modelScale = 1;
  @type("boolean") showHealthBar = false;
}

export class SpaceshipDisplayState extends Schema {
  @type("float32") cameraViewWidth = 2200;
  /** Parallax space background for this run; fixed at run start like the silhouettes. */
  @type("float32") backgroundParallaxStrength = 1;
  @type("float32") backgroundDriftSpeed = 1;
  @type("float32") backgroundNebulaAlpha = 0.72;
  @type("string") backgroundNebulaPreset = "blue";
  /** Empty means the display draws its own rock for the ambient hazard. */
  @type("string") asteroidVisualShape = "";
  @type("float32") asteroidVisualScale = 1;
  /** Empty means the display draws its own default hull silhouette. */
  @type("string") spaceshipVisualShape = "";
  @type("float32") spaceshipVisualScale = 1;
  @type("string") turretVisualShape = "";
  @type("float32") turretVisualScale = 1;
  @type("float32") turretMountX = 0;
  @type("float32") turretMountY = 0;
  @type("float32") turretPivotX = 0;
  @type("float32") turretPivotY = 0;
  /** Authoritative radius the shield intercepts at, so the drawn arc matches it. */
  @type("float32") shieldRadius = 104;
  /**
   * What the crew has bought, in purchase order. Display-only and changed once
   * a wave: the ship's own numbers are derived from it and never travel.
   */
  @type(["string"]) purchasedUpgrades = new ArraySchema<string>();
  /**
   * Why the shield is or is not protecting. Display-gated: the operator panel
   * keeps its own wording, and the controller view is strict about its keys.
   * A string is affordable here because it changes a few times per run.
   */
  @type("string") shieldPhase: ShieldPhase = "down";
  @type({ map: EnemyVisualState }) enemyCatalogue = new MapSchema<EnemyVisualState>();
  @type([ObstacleState]) obstacles = new ArraySchema<ObstacleState>();
  @type({ map: EnemyState }) enemyShips = new MapSchema<EnemyState>();
  @type({ map: AsteroidState }) asteroids = new MapSchema<AsteroidState>();
  @type({ map: LootDropState }) lootDrops = new MapSchema<LootDropState>();
  @type({ map: ProjectileState }) friendlyProjectiles = new MapSchema<ProjectileState>();
  @type({ map: LaserBeamState }) laserBeams = new MapSchema<LaserBeamState>();
  @type({ map: ProjectileState }) hostileProjectiles = new MapSchema<ProjectileState>();
  @type({ map: HomingMissileState }) homingMissiles = new MapSchema<HomingMissileState>();
}

export class SpaceshipGameState extends Schema {
  @type("uint32") tick = 0;
  @type("uint32") elapsedMs = 0;
  @type("uint16") worldWidth = 4400;
  @type("uint16") worldHeight = 4400;
  @type("uint16") arenaRadius = 2200;
  @type("uint16") rimBandWidth = ARENA_CUSHION_BAND;
  @type(SpaceshipState) spaceship = new SpaceshipState();
  @type("float32") turretAngle = 0;
  @type(ShieldState) shield = new ShieldState();
  @type(MachineGunState) cannon = new MachineGunState();
  @type(MachineGunState) machineGun = new MachineGunState();
  @type(EncounterState) encounter = new EncounterState();
  @type("uint32") credits = 0;
  @type(TeamUpgradeState) teamUpgrade = new TeamUpgradeState();
  @type(HelmState) helm = new HelmState();
  @view(1)
  @type(SpaceshipDisplayState)
  display = new SpaceshipDisplayState();
}

export class SpaceshipDefenderState extends Schema {
  @type("string") roomId = "";
  @type("string") phase: RoomPhase = "lobby";
  @type("uint32") runNumber = 0;
  @type("uint8") crewSize = 3;
  @type("boolean") displayConnected = false;
  @type("int32") displayLatencyMs = -1;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("boolean") hasGame = false;
  @type(SpaceshipGameState) game = new SpaceshipGameState();
}
