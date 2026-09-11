import type {
  AsteroidOrigin,
  CrewRole,
  DefeatReason,
  EnemyKind,
  EncounterPhase,
  HelmScheme,
  LootKind,
  ProjectileKind,
  DisplayRoomView,
  PublicSpaceshipView,
  ShieldPhase,
  TerminalOutcome,
  UpgradeId
} from "@spaceship-defender/protocol";

/**
 * What the room publishes, as `@colyseus/schema` hands it over: keyed
 * collections rather than arrays, and every field optional because a patch
 * carries only what changed.
 */
export interface ValueCollection<T> {
  values(): IterableIterator<T>;
}

export interface NetworkPlayerState {
  playerId: string;
  playerName: string;
  role: CrewRole;
  ready: boolean;
  connected: boolean;
  latencyMs: number;
}

/** One whole hull in a match; empty in the campaign. */
export interface NetworkArenaShipState {
  shipId: string;
  isSelf: boolean;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  heading: number;
  turretAngle: number;
  hp: number;
  maxHp: number;
  shieldAngle: number;
  shieldActive: boolean;
  shieldRadius: number;
  shieldArcHalfAngle: number;
  shieldEnergy: number;
  shieldCapacity: number;
  shotsFired: number;
}

/** One rectangle of the arena's sheet; empty in the campaign. */
export interface NetworkArenaZoneState {
  zoneId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  state: string;
  secondsRemaining: number;
}

export interface NetworkObstacleState {
  obstacleId: string;
  kind: "rectangle" | "circle";
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export interface NetworkCombatEntityState {
  entityId: string;
  spawnSequence: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
}

export interface NetworkEnemyState extends NetworkCombatEntityState {
  kind: EnemyKind;
  heading: number;
  hp: number;
  maxHp: number;
  shotsFired: number;
}

export interface NetworkAsteroidState extends NetworkCombatEntityState {
  hp: number;
  maxHp: number;
  origin: AsteroidOrigin;
}

export interface NetworkLaserBeamState {
  entityId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  source: "cannon" | "machineGun";
}

export interface NetworkLootDropState extends NetworkCombatEntityState {
  kind: LootKind;
  amount: number;
}

export interface NetworkProjectileState extends NetworkCombatEntityState {
  kind: ProjectileKind;
  source?: string;
  visualShape?: string;
  visualScale?: number;
}

export interface NetworkHomingMissileState extends NetworkCombatEntityState {
  heading: number;
  visualShape?: string;
  visualScale?: number;
}

export interface NetworkShipStatEffectState {
  target: string;
  op: string;
  value: number;
}

export interface NetworkUpgradeCardState {
  upgradeId: UpgradeId;
  role: CrewRole;
  label: string;
  effects: ValueCollection<NetworkShipStatEffectState>;
  price: number;
}

export interface NetworkUpgradeVoteState {
  role: CrewRole;
  upgradeId: UpgradeId;
  revision: number;
}

export interface NetworkTeamUpgradeState {
  hasOffer?: boolean;
  offer: {
    offerId: string;
    waveNumber: number;
    tier: number;
    cards: ValueCollection<NetworkUpgradeCardState>;
  };
  votes: ValueCollection<NetworkUpgradeVoteState>;
  hasSelection?: boolean;
  selection: {
    offerId: string;
    waveNumber: number;
    upgradeId: UpgradeId;
    role: CrewRole;
    price: number;
  };
}

export interface NetworkGameState {
  tick: number;
  elapsedMs: number;
  worldWidth: number;
  worldHeight: number;
  arenaRadius: number;
  helm: {
    scheme: HelmScheme;
    headingLeadRadians: number;
    stopDampening: number;
    rotateInPlaceThrottle: number;
    hullAngularBrakingPerSecondSquared: number;
    hullAngularMaxSpeed: number;
    hullAngularAcceleration: number;
    turretAngularMaxSpeed: number;
    turretAngularAcceleration: number;
    turretAngularBraking: number;
    turretMountedOnHull: boolean;
    driveDeadzoneShare: number;
    aimDeadzoneShare: number;
    driveZoneShare: number;
    aimProjectionShare: number;
    headingDeadbandRadians: number;
    headingFilterSeconds: number;
    turretLeadRadians: number;
  };
  rimBandWidth: number;
  spaceship: PublicSpaceshipView;
  turretAngle: number;
  shield: {
    angle: number;
    arcHalfAngle: number;
    active: boolean;
    rearmRequired: boolean;
    energy: number;
    capacity: number;
  };
  cannon: {
    heat: number;
    capacity: number;
    overheated: boolean;
    /** The aiming envelope: what the barrel is, how far, and its lock cone. */
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
    hasOutcome?: boolean;
    outcome: TerminalOutcome | null;
    hasDefeatReason?: boolean;
    defeatReason: DefeatReason | null;
    waveNumber: number;
    encounterTick: number;
    phaseTicksRemaining: number;
    waveSecondsRemaining: number;
    lootWindowSecondsRemaining: number;
    score: number;
  };
  credits: number;
  teamUpgrade?: NetworkTeamUpgradeState;
  display?: {
    cameraViewWidth: number;
    serverStepMs?: number;
    appliedInputSeq?: number;
    drive?: {
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
    };
    pose?: {
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
    };
    backgroundParallaxStrength?: number;
    backgroundDriftSpeed?: number;
    backgroundNebulaAlpha?: number;
    backgroundNebulaPreset?: string;
    asteroidVisualShape?: string;
    asteroidVisualScale?: number;
    spaceshipVisualShape?: string;
    shieldBandEffect?: string;
    shieldImpactEffect?: string;
    spaceshipVisualScale?: number;
    turretVisualShape?: string;
    turretVisualScale?: number;
    turretMountX?: number;
    turretMountY?: number;
    turretPivotX?: number;
    turretPivotY?: number;
    shieldRadius?: number;
    shieldPhase?: ShieldPhase;
    enemyCatalogue: ValueCollection<NetworkEnemyVisualState>;
    arenaZones: ValueCollection<NetworkArenaZoneState>;
    arenaShips: ValueCollection<NetworkArenaShipState>;
    obstacles: ValueCollection<NetworkObstacleState>;
    enemyShips: ValueCollection<NetworkEnemyState>;
    asteroids: ValueCollection<NetworkAsteroidState>;
    purchasedModules: readonly string[];
    lootDrops: ValueCollection<NetworkLootDropState>;
    laserBeams: ValueCollection<NetworkLaserBeamState>;
    friendlyProjectiles: ValueCollection<NetworkProjectileState>;
    hostileProjectiles: ValueCollection<NetworkProjectileState>;
    homingMissiles: ValueCollection<NetworkHomingMissileState>;
  };
}

export interface NetworkEnemyVisualState {
  kind: string;
  label: string;
  shape: string;
  modelScale: number;
  showHealthBar: boolean;
  isBoss: boolean;
  /** Empty is an unset slot, which leaves the display's own rule. */
  effectDeath: string;
  effectHit: string;
  effectShot: string;
}

export interface NetworkRoomState {
  roomId?: string;
  phase?: DisplayRoomView["phase"];
  runNumber?: number;
  crewSize?: number;
  shipArchetypeId?: string;
  maintenanceActive?: boolean;
  maintenanceSecondsRemaining?: number;
  displayConnected?: boolean;
  displayLatencyMs?: number;
  players?: ValueCollection<NetworkPlayerState>;
  hasGame?: boolean;
  game?: NetworkGameState;
}

/**
 * What a display sees before the room has published a drive: nothing to replay
 * with. Zeroes rather than the preset's numbers, because a plausible-looking
 * guess would let prediction run on figures the ship does not have.
 */
