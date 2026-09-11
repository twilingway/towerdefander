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
  // What the barrel is and how far it throws. Fixed for the run unless a module
  // moves it, so the string costs one patch rather than one a tick.
  @type("string") kind = "kinetic";
  @type("float32") reach = 0;
  @type("float32") speed = 0;
}

/**
 * The turret carries an aiming envelope the nose gun does not: what the barrel
 * is, how far it reaches, and how far off the bore it will still take a lock.
 * A class of its own rather than three more fields on the shared one - the
 * pilot flies the bore, so the nose has no envelope to read and should not be
 * paying for one on every client.
 */
export class CannonState extends MachineGunState {
  @type("float32") acquireHalfAngle = 0;
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
  /* The rest of the drive, mirrored so a client can predict with it. */
  @type("float32") hullAngularMaxSpeed = Math.PI;
  @type("float32") hullAngularAcceleration = 50;
  @type("float32") turretAngularMaxSpeed = 1.36;
  @type("float32") turretAngularAcceleration = 2.72;
  @type("float32") turretAngularBraking = 4.08;
  @type("boolean") turretMountedOnHull = false;
  /*
   * Stick geometry. Shares of the ring radius, so `float32` covers them with
   * room to spare, and the flag is the one boolean here — a share and a switch,
   * never a string, on a field the panel reads once a run.
   */
  @type("float32") driveDeadzoneShare = 0;
  @type("float32") aimDeadzoneShare = 0;
  @type("float32") driveZoneShare = 0.42;
  @type("float32") aimProjectionShare = 0.58;
  @type("float32") headingDeadbandRadians = 0.05236;
  @type("float32") headingFilterSeconds = 0.06;
  @type("float32") turretLeadRadians = 0.45;
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

export class ShipStatEffectState extends Schema {
  /** Which ship number the module moves; a catalogue field name, not an enum. */
  @type("string") target = "";
  @type("string") op = "add";
  @type("float32") value = 0;
}

export class UpgradeCardState extends Schema {
  @type("string") upgradeId: UpgradeId = "";
  @type("string") role: CrewRole = "pilot";
  /** The module's name; the numbers live in the summary beside it. */
  @type("string") label = "";
  /**
   * What the module does. The effects travel rather than a written caption, so
   * the number a crew reads is the number that gets applied, and so the demo
   * bot can weigh a card whose id it has never seen. Four per card at most,
   * changing once per wave.
   */
  @type([ShipStatEffectState]) effects = new ArraySchema<ShipStatEffectState>();
  @type("uint8") price = 5;
}

export class UpgradeOfferState extends Schema {
  @type("string") offerId = "";
  @type("uint32") waveNumber = 1;
  /** Which tier of the tree is on offer; 0 once the tree is spent. */
  @type("uint8") tier = 0;
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

/**
 * One rectangle of the arena's sheet. Narrow on purpose: the whole sheet is
 * sixteen of these and it moves a few times a match, so it costs nothing next
 * to the entities that move every tick.
 */
export class ArenaZoneView extends Schema {
  @type("uint8") zoneId = 0;
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") width = 0;
  @type("float32") height = 0;
  /** "safe" | "warning" | "closed"; a string because it changes twice a zone. */
  @type("string") state = "safe";
  @type("uint16") secondsRemaining = 0;
}

/**
 * One hull in a match: the crew ship's own shape, sixteen times over.
 *
 * Float32 throughout, like every other combat quantity - the arena is 8800
 * units across at most and a unit is well under a pixel on any screen this
 * runs on.
 */
export class ArenaShipView extends Schema {
  @type("string") shipId = "";
  @type("boolean") isSelf = false;
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") velocityX = 0;
  @type("float32") velocityY = 0;
  @type("float32") radius = 0;
  @type("float32") heading = 0;
  @type("float32") turretAngle = 0;
  @type("float32") hp = 0;
  @type("float32") maxHp = 0;
  @type("float32") shieldAngle = 0;
  @type("boolean") shieldActive = false;
  @type("float32") shieldRadius = 0;
  @type("float32") shieldArcHalfAngle = 0;
  @type("float32") shieldEnergy = 0;
  @type("float32") shieldCapacity = 0;
  @type("uint16") shotsFired = 0;
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
  /**
   * Shots fired, narrowed to the wire from the simulation's own unbounded
   * count. The display compares it with the last value it drew, so it answers
   * "did this enemy fire" and never "how many"; wrapping is therefore fine, and
   * two bytes on forty hulls beats naming a shooter on every shell.
   */
  @type("uint16") shotsFired = 0;
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
  @type("boolean") isBoss = false;
  /**
   * What this archetype plays on each of its events; an empty string is an
   * unset slot, which leaves the display's own rule. Strings are affordable
   * here because the catalogue is published once per run, not per tick.
   */
  @type("string") effectDeath = "";
  @type("string") effectHit = "";
  @type("string") effectShot = "";
}

/**
 * The tag the world branch is gated behind. One number, named once: the schema
 * declares it, the room grants it per client, and the tests ask about it, and a
 * bare `1` in three files is the same fact written down three times.
 */
export const DISPLAY_VIEW_TAG = 1;

/**
 * Exactly the numbers `advanceShipPose` reads, as the run currently has them.
 *
 * Published from the run's own stats rather than from the preset, because that
 * is what the step uses: a module that raises the top speed has to raise the
 * number the client replays with, or the two drift apart the moment it is
 * bought. Ten floats, and they only travel when a purchase moves one.
 */
export class ShipDriveState extends Schema {
  /**
   * Bumped whenever any number below moves, and carried back on the input frame.
   *
   * Straight from the lab, which keeps its tuning as a compile-time constant and
   * says why that is only safe there: "the moment it becomes a slider it has to
   * move into room state instead, or the client will replay old inputs against
   * new numbers and drift". Ours is a slider - modules move it mid-run and the
   * balance console moves it between runs - so the numbers travel, and their
   * identity travels with the input that was given under them.
   */
  @type("uint16") revision = 0;
  @type("float32") speedPerSecond = 0;
  @type("float32") accelerationPerSecondSquared = 0;
  @type("float32") brakingPerSecondSquared = 0;
  @type("float32") reverseSpeedFactor = 0;
  @type("float32") headingMaxAngularSpeed = 0;
  @type("float32") headingAngularAcceleration = 0;
  @type("float32") headingAngularBraking = 0;
  @type("float32") turretMaxAngularSpeed = 0;
  @type("float32") turretAngularAcceleration = 0;
  @type("float32") turretAngularBraking = 0;
  /** The hull's own size; the arena clamp is where the step reads it. */
  @type("float32") hullRadius = 0;
}

/**
 * What the drive carries between frames, and therefore what a replay has to
 * start from.
 *
 * A client that begins with the position and the bearings but not the angular
 * velocities is not resuming the ship, it is starting a different one - and the
 * difference accumulates rather than showing up at once. The bearings being
 * closed on are nullable, so each gets a flag beside it rather than a sentinel
 * angle that some real heading could collide with.
 */
export class ShipPoseState extends Schema {
  /*
   * The position, velocity and bearings are already on the shared branch, and
   * they are here again on purpose.
   *
   * A reconciler mirrors one schema instance, and the pose a replay starts from
   * has to be that one instance - split across three objects it cannot be
   * bound at all. Twenty bytes a tick to the one client that predicts, against
   * a snapshot that runs to nineteen kilobytes, buys the whole mechanism.
   */
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") velocityX = 0;
  @type("float32") velocityY = 0;
  @type("float32") heading = 0;
  @type("float32") turretAngle = 0;
  @type("float32") headingAngularVelocity = 0;
  @type("boolean") hasHeadingTarget = false;
  @type("float32") headingTargetAngle = 0;
  @type("float32") turretAngularVelocity = 0;
  @type("boolean") hasTurretTarget = false;
  @type("float32") turretTargetAngle = 0;
}

export class SpaceshipDisplayState extends Schema {
  @type("float32") cameraViewWidth = 2200;
  /**
   * How long the last simulation step took the host, in milliseconds.
   *
   * Four bytes a patch to answer the only question a load test actually asks -
   * whether the tick still fits its budget - and to answer it on the device in
   * the player's hands rather than in the host's console. Float because the
   * whole signal is in the fractions: a step costs tenths of a millisecond, and
   * a whole number here would be an indicator of "zero or disaster".
   */
  @type("float32") serverStepMs = 0;
  /** The last solo input frame the room applied; the cockpit replays past it. */
  @type("uint32") appliedInputSeq = 0;
  /** The run's live drive numbers and the pose the client replays from. */
  @type(ShipDriveState) drive = new ShipDriveState();
  @type(ShipPoseState) pose = new ShipPoseState();
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
  /** Empty means the display keeps its own baked effect for the shield. */
  @type("string") shieldBandEffect = "";
  @type("string") shieldImpactEffect = "";
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
  @type(["string"]) purchasedModules = new ArraySchema<string>();
  /**
   * Why the shield is or is not protecting. Display-gated: the operator panel
   * keeps its own wording, and the controller view is strict about its keys.
   * A string is affordable here because it changes a few times per run.
   */
  @type("string") shieldPhase: ShieldPhase = "down";
  @type({ map: EnemyVisualState }) enemyCatalogue = new MapSchema<EnemyVisualState>();
  @type([ArenaZoneView]) arenaZones = new ArraySchema<ArenaZoneView>();
  @type({ map: ArenaShipView }) arenaShips = new MapSchema<ArenaShipView>();
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
  @type(CannonState) cannon = new CannonState();
  @type(MachineGunState) machineGun = new MachineGunState();
  @type(EncounterState) encounter = new EncounterState();
  @type("uint32") credits = 0;
  @type(TeamUpgradeState) teamUpgrade = new TeamUpgradeState();
  @type(HelmState) helm = new HelmState();
  @view(DISPLAY_VIEW_TAG)
  @type(SpaceshipDisplayState)
  display = new SpaceshipDisplayState();
}

export class SpaceshipDefenderState extends Schema {
  @type("string") roomId = "";
  @type("string") phase: RoomPhase = "lobby";
  @type("uint32") runNumber = 0;
  @type("uint8") crewSize = 3;
  /**
   * The hull the run is played on. It changes once, at creation, so a string is
   * the right shape here: an id the clients look up in their own catalogue.
   */
  @type("string") shipArchetypeId = "";
  /**
   * The announced maintenance window. The remaining seconds are published
   * rather than a deadline: a device with a wrong clock would otherwise show
   * its owner a countdown nobody else sees. `uint16` holds eighteen hours.
   */
  @type("boolean") maintenanceActive = false;
  @type("uint16") maintenanceSecondsRemaining = 0;
  @type("boolean") displayConnected = false;
  @type("int32") displayLatencyMs = -1;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("boolean") hasGame = false;
  @type(SpaceshipGameState) game = new SpaceshipGameState();
}
