import type {
  AsteroidOrigin,
  CrewRole,
  DefeatReason,
  EncounterPhase,
  EnemyKind,
  LootKind,
  ProjectileSource,
  ShieldPhase,
  TerminalOutcome,
  UpgradeId
} from "@spaceship-defender/protocol";

/**
 * What a projection writes into, described by shape rather than by class.
 *
 * The server's target is a Colyseus schema and a device's is a tree of ordinary
 * objects, and neither should be the one the projection knows about: the schema
 * is a wire representation of one path, and a second projection written for the
 * other path is the divergence this package exists to prevent.
 *
 * Only what `projectGameState` actually writes is declared. Everything else the
 * room publishes -- the enemy catalogue, the hull's visuals and sounds -- is
 * written by its own code and stays out of this contract.
 */

/** A map keyed by entity id: what `MapSchema` and `Map` both already are. */
export interface KeyedCollection<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): unknown;
  delete(key: string): boolean;
  keys(): IterableIterator<string>;
}

/** An ordered list: what `ArraySchema` and `Array` both already are. */
export interface ListCollection<T> {
  readonly length: number;
  at(index: number): T | undefined;
  push(...items: T[]): number;
  pop(): T | undefined;
  splice(start: number, deleteCount: number): T[];
}

export interface EnemyTarget {
  entityId: string;
  spawnSequence: number;
  kind: EnemyKind;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  heading: number;
  hp: number;
  maxHp: number;
  shotsFired: number;
}

export interface AsteroidTarget {
  entityId: string;
  origin: AsteroidOrigin;
  spawnSequence: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  hp: number;
  maxHp: number;
}

export interface LootDropTarget {
  entityId: string;
  kind: LootKind;
  spawnSequence: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  amount: number;
}

export interface LaserBeamTarget {
  entityId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Both sides ride one collection, so this names the side as well. */
  source: ProjectileSource;
}

export interface ProjectileTarget {
  entityId: string;
  spawnSequence: number;
  kind: "friendly" | "hostile";
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  source: string;
  visualShape: string;
  visualScale: number;
}

export interface HomingMissileTarget {
  entityId: string;
  spawnSequence: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  heading: number;
  visualShape: string;
  visualScale: number;
}

export interface ShipStatEffectTarget {
  target: string;
  op: string;
  value: number;
}

export interface UpgradeCardTarget {
  upgradeId: UpgradeId;
  role: CrewRole;
  label: string;
  effects: ListCollection<ShipStatEffectTarget>;
  price: number;
}

export interface UpgradeVoteTarget {
  role: CrewRole;
  upgradeId: UpgradeId;
  revision: number;
}

export interface TeamUpgradeTarget {
  hasOffer: boolean;
  offer: {
    offerId: string;
    waveNumber: number;
    tier: number;
    cards: ListCollection<UpgradeCardTarget>;
  };
  votes: KeyedCollection<UpgradeVoteTarget> & { clear(): void };
  hasSelection: boolean;
  selection: {
    offerId: string;
    upgradeId: UpgradeId;
    role: CrewRole;
    waveNumber: number;
    price: number;
  };
}

export interface ShipDriveTarget {
  revision: number;
  speedPerSecond: number;
  accelerationPerSecondSquared: number;
  brakingPerSecondSquared: number;
  reverseSpeedFactor: number;
  headingMaxAngularSpeed: number;
  headingAngularAcceleration: number;
  headingAngularBraking: number;
  turretMaxAngularSpeed: number;
  turretAngularAcceleration: number;
  turretAngularBraking: number;
  hullRadius: number;
}

export interface ShipPoseTarget {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  heading: number;
  turretAngle: number;
  headingAngularVelocity: number;
  hasHeadingTarget: boolean;
  headingTargetAngle: number;
  turretAngularVelocity: number;
  hasTurretTarget: boolean;
  turretTargetAngle: number;
}

export interface DisplayTarget {
  cameraViewWidth: number;
  backgroundImage: string;
  backgroundParallaxStrength: number;
  shieldPhase: ShieldPhase;
  purchasedModules: ListCollection<string>;
  drive: ShipDriveTarget;
  pose: ShipPoseTarget;
  enemyShips: KeyedCollection<EnemyTarget>;
  asteroids: KeyedCollection<AsteroidTarget>;
  lootDrops: KeyedCollection<LootDropTarget>;
  laserBeams: KeyedCollection<LaserBeamTarget>;
  friendlyProjectiles: KeyedCollection<ProjectileTarget>;
  hostileProjectiles: KeyedCollection<ProjectileTarget>;
  homingMissiles: KeyedCollection<HomingMissileTarget>;
}

export interface ProjectionTarget {
  tick: number;
  elapsedMs: number;
  worldWidth: number;
  worldHeight: number;
  arenaRadius: number;
  rimBandWidth: number;
  turretAngle: number;
  credits: number;
  spaceship: {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    radius: number;
    hp: number;
    maxHp: number;
    heading: number;
  };
  shield: {
    angle: number;
    active: boolean;
    rearmRequired: boolean;
    energy: number;
    capacity: number;
    arcHalfAngle: number;
  };
  cannon: {
    heat: number;
    capacity: number;
    overheated: boolean;
    kind: string;
    reach: number;
    speed: number;
    acquireHalfAngle: number;
  };
  machineGun: {
    heat: number;
    capacity: number;
    overheated: boolean;
    kind: string;
    reach: number;
    speed: number;
  };
  encounter: {
    phase: EncounterPhase;
    hasOutcome: boolean;
    outcome: TerminalOutcome;
    hasDefeatReason: boolean;
    defeatReason: DefeatReason;
    waveNumber: number;
    encounterTick: number;
    phaseTicksRemaining: number;
    waveSecondsRemaining: number;
    lootWindowSecondsRemaining: number;
    score: number;
  };
  teamUpgrade: TeamUpgradeTarget;
  display: DisplayTarget;
}

/**
 * How a target makes a new element of a collection.
 *
 * The schema needs its own classes -- a plain object put into a `MapSchema`
 * would never be encoded -- so the projection cannot build them itself.
 */
export interface ProjectionFactories {
  enemy(): EnemyTarget;
  asteroid(): AsteroidTarget;
  lootDrop(): LootDropTarget;
  laserBeam(): LaserBeamTarget;
  projectile(): ProjectileTarget;
  homingMissile(): HomingMissileTarget;
  upgradeCard(): UpgradeCardTarget;
  upgradeVote(): UpgradeVoteTarget;
  statEffect(): ShipStatEffectTarget;
}
