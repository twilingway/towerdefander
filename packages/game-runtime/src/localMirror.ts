import type {
  CrewRole,
  DefeatReason,
  EncounterPhase,
  HelmScheme,
  ShieldPhase,
  TerminalOutcome,
  UpgradeId
} from "@spaceship-defender/protocol";

import type {
  AsteroidTarget,
  EnemyTarget,
  HomingMissileTarget,
  LaserBeamTarget,
  LootDropTarget,
  ProjectileTarget,
  ProjectionFactories,
  ShipStatEffectTarget,
  UpgradeCardTarget,
  UpgradeVoteTarget
} from "./projectionTarget.ts";

/**
 * The room's state as ordinary objects, for a host that has no wire.
 *
 * A device publishes nothing: it draws what it just stepped. So the schema -
 * which exists to be encoded and patched - would be pure cost there, and its
 * decorators would drag a tsconfig change through an app full of Phaser
 * subclasses. What the device needs is something the projection can write into
 * and the view adapter can read out of, and both of those are already described
 * by shape: `Map` answers `get`/`set`/`delete`/`keys` for the first and
 * `values()` for the second, and an array answers both as well.
 *
 * So this is not a second description of the world. It is the same projection's
 * other target, and the fields below are exactly the ones the room fills in by
 * its own hand: the helm, the catalogue and the hull's looks, which
 * `projectGameState` never touches.
 */
export interface LocalMirror {
  roomId: string;
  phase: "lobby" | "active";
  runNumber: number;
  crewSize: number;
  shipArchetypeId: string;
  maintenanceActive: boolean;
  maintenanceSecondsRemaining: number;
  assetsPending: boolean;
  assetsWaitSecondsRemaining: number;
  displayConnected: boolean;
  displayLatencyMs: number;
  players: Map<string, LocalPlayer>;
  hasGame: boolean;
  game: LocalGame;
}

export interface LocalPlayer {
  playerId: string;
  playerName: string;
  role: CrewRole;
  ready: boolean;
  connected: boolean;
  latencyMs: number;
}

export interface LocalGame {
  tick: number;
  elapsedMs: number;
  worldWidth: number;
  worldHeight: number;
  arenaRadius: number;
  rimBandWidth: number;
  turretAngle: number;
  credits: number;
  helm: LocalHelm;
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
  teamUpgrade: {
    hasOffer: boolean;
    offer: {
      offerId: string;
      waveNumber: number;
      tier: number;
      cards: UpgradeCardTarget[];
    };
    votes: Map<string, UpgradeVoteTarget>;
    hasSelection: boolean;
    selection: {
      offerId: string;
      upgradeId: UpgradeId;
      role: CrewRole;
      waveNumber: number;
      price: number;
    };
  };
  display: LocalDisplay;
}

export interface LocalHelm {
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
}

export interface LocalEnemyVisual {
  kind: string;
  label: string;
  shape: string;
  modelScale: number;
  showHealthBar: boolean;
  isBoss: boolean;
  effectDeath: string;
  effectHit: string;
  effectShot: string;
  soundDeath: string;
  soundHit: string;
  soundShot: string;
}

export interface LocalObstacle {
  obstacleId: string;
  kind: "rectangle" | "circle";
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  rotation: number;
}

export interface LocalDisplay {
  cameraViewWidth: number;
  serverStepMs: number;
  appliedInputSeq: number;
  scanReadySeconds: number;
  scanRevealSecondsRemaining: number;
  backgroundImage: string;
  backgroundParallaxStrength: number;
  shieldPhase: ShieldPhase;
  purchasedModules: string[];
  drive: {
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
  pose: {
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
  /** The hull's own look and sound, written once a run starts. */
  asteroidVisualShape: string;
  asteroidVisualScale: number;
  spaceshipVisualShape: string;
  spaceshipVisualScale: number;
  shieldBandEffect: string;
  shieldImpactEffect: string;
  shipDeathEffect: string;
  shipMuzzleEffect: string;
  shipCannonSound: string;
  shipMgSound: string;
  shipHitSound: string;
  shipDeathSound: string;
  turretVisualShape: string;
  turretVisualScale: number;
  turretMountX: number;
  turretMountY: number;
  turretPivotX: number;
  turretPivotY: number;
  machineGunVisualShape: string;
  machineGunVisualScale: number;
  machineGunMountX: number;
  machineGunMountY: number;
  machineGunPivotX: number;
  machineGunPivotY: number;
  shieldRadius: number;
  enemyCatalogue: Map<string, LocalEnemyVisual>;
  obstacles: LocalObstacle[];
  /** The campaign publishes none of these; the arena is not played locally yet. */
  arenaZones: never[];
  arenaShips: never[];
  arenaLoot: never[];
  enemyShips: Map<string, EnemyTarget>;
  asteroids: Map<string, AsteroidTarget>;
  lootDrops: Map<string, LootDropTarget>;
  laserBeams: Map<string, LaserBeamTarget>;
  friendlyProjectiles: Map<string, ProjectileTarget>;
  hostileProjectiles: Map<string, ProjectileTarget>;
  homingMissiles: Map<string, HomingMissileTarget>;
}

/** Plain objects, so the projection's factories cost nothing here. */
export const PLAIN_PROJECTION_FACTORIES: ProjectionFactories = {
  enemy: () => ({
    entityId: "",
    spawnSequence: 0,
    kind: "gunship",
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    radius: 0,
    heading: 0,
    hp: 0,
    maxHp: 0,
    shotsFired: 0
  }),
  asteroid: () => ({
    entityId: "",
    origin: "ambient",
    spawnSequence: 0,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    radius: 0,
    hp: 0,
    maxHp: 0
  }),
  lootDrop: () => ({
    entityId: "",
    kind: "repair",
    spawnSequence: 0,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    radius: 0,
    amount: 0
  }),
  laserBeam: () => ({ entityId: "", fromX: 0, fromY: 0, toX: 0, toY: 0, source: "" }),
  projectile: () => ({
    entityId: "",
    spawnSequence: 0,
    kind: "friendly" as const,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    radius: 0,
    source: "",
    visualShape: "",
    visualScale: 1
  }),
  homingMissile: () => ({
    entityId: "",
    spawnSequence: 0,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    radius: 0,
    heading: 0,
    visualShape: "",
    visualScale: 1
  }),
  upgradeCard: (): UpgradeCardTarget => ({
    upgradeId: "",
    role: "pilot",
    label: "",
    effects: [] as ShipStatEffectTarget[],
    price: 5
  }),
  upgradeVote: () => ({ role: "pilot", upgradeId: "", revision: 1 }),
  statEffect: () => ({ target: "", op: "add", value: 0 })
};

export function createLocalMirror(): LocalMirror {
  return {
    roomId: "LOCAL",
    phase: "lobby",
    runNumber: 0,
    crewSize: 1,
    shipArchetypeId: "guardian",
    maintenanceActive: false,
    maintenanceSecondsRemaining: 0,
    assetsPending: false,
    assetsWaitSecondsRemaining: 0,
    displayConnected: true,
    // A device has no round trip to measure, and -1 is what the adapter reads
    // as "unknown" rather than as a suspiciously perfect zero.
    displayLatencyMs: -1,
    players: new Map(),
    hasGame: false,
    game: {
      tick: 0,
      elapsedMs: 0,
      worldWidth: 0,
      worldHeight: 0,
      arenaRadius: 0,
      rimBandWidth: 0,
      turretAngle: 0,
      credits: 0,
      helm: {
        scheme: "tank",
        headingLeadRadians: 0.45,
        stopDampening: 1,
        rotateInPlaceThrottle: 0.02,
        hullAngularBrakingPerSecondSquared: 50,
        hullAngularMaxSpeed: Math.PI,
        hullAngularAcceleration: 50,
        turretAngularMaxSpeed: 1.36,
        turretAngularAcceleration: 2.72,
        turretAngularBraking: 4.08,
        turretMountedOnHull: false,
        driveDeadzoneShare: 0,
        aimDeadzoneShare: 0,
        driveZoneShare: 0.42,
        aimProjectionShare: 0.58,
        headingDeadbandRadians: 0.05236,
        headingFilterSeconds: 0.06,
        turretLeadRadians: 0.45
      },
      spaceship: { x: 0, y: 0, velocityX: 0, velocityY: 0, radius: 0, hp: 0, maxHp: 0, heading: 0 },
      shield: {
        angle: 0,
        arcHalfAngle: Math.PI / 4,
        active: false,
        rearmRequired: false,
        energy: 0,
        capacity: 0
      },
      cannon: {
        heat: 0,
        capacity: 0,
        overheated: false,
        kind: "kinetic",
        reach: 0,
        speed: 0,
        acquireHalfAngle: 0
      },
      machineGun: { heat: 0, capacity: 0, overheated: false, kind: "kinetic", reach: 0, speed: 0 },
      encounter: {
        phase: "combat",
        hasOutcome: false,
        outcome: "defeat",
        hasDefeatReason: false,
        defeatReason: "spaceship_destroyed",
        waveNumber: 1,
        encounterTick: 0,
        phaseTicksRemaining: 0,
        waveSecondsRemaining: 0,
        lootWindowSecondsRemaining: 0,
        score: 0
      },
      teamUpgrade: {
        hasOffer: false,
        offer: { offerId: "", waveNumber: 1, tier: 0, cards: [] },
        votes: new Map(),
        hasSelection: false,
        selection: {
          offerId: "",
          upgradeId: "",
          role: "pilot",
          waveNumber: 1,
          price: 5
        }
      },
      display: {
        cameraViewWidth: 0,
        // Repurposed rather than faked: on a device this is the local step, and
        // it is the most useful number the panel can show there.
        serverStepMs: 0,
        appliedInputSeq: 0,
        scanReadySeconds: 0,
        scanRevealSecondsRemaining: 0,
        backgroundImage: "deep-nebula",
        backgroundParallaxStrength: 1,
        shieldPhase: "down",
        purchasedModules: [],
        drive: {
          revision: 0,
          speedPerSecond: 0,
          accelerationPerSecondSquared: 0,
          brakingPerSecondSquared: 0,
          reverseSpeedFactor: 0,
          headingMaxAngularSpeed: 0,
          headingAngularAcceleration: 0,
          headingAngularBraking: 0,
          turretMaxAngularSpeed: 0,
          turretAngularAcceleration: 0,
          turretAngularBraking: 0,
          hullRadius: 0
        },
        pose: {
          x: 0,
          y: 0,
          velocityX: 0,
          velocityY: 0,
          heading: 0,
          turretAngle: 0,
          headingAngularVelocity: 0,
          hasHeadingTarget: false,
          headingTargetAngle: 0,
          turretAngularVelocity: 0,
          hasTurretTarget: false,
          turretTargetAngle: 0
        },
        asteroidVisualShape: "",
        asteroidVisualScale: 1,
        spaceshipVisualShape: "",
        spaceshipVisualScale: 1,
        shieldBandEffect: "",
        shieldImpactEffect: "",
        shipDeathEffect: "",
        shipMuzzleEffect: "",
        shipCannonSound: "",
        shipMgSound: "",
        shipHitSound: "",
        shipDeathSound: "",
        turretVisualShape: "",
        turretVisualScale: 1,
        turretMountX: 0,
        turretMountY: 0,
        turretPivotX: 0,
        turretPivotY: 0,
        machineGunVisualShape: "",
        machineGunVisualScale: 1,
        machineGunMountX: 0,
        machineGunMountY: 0,
        machineGunPivotX: 0,
        machineGunPivotY: 0,
        shieldRadius: 0,
        enemyCatalogue: new Map(),
        obstacles: [],
        arenaZones: [],
        arenaShips: [],
        arenaLoot: [],
        enemyShips: new Map(),
        asteroids: new Map(),
        lootDrops: new Map(),
        laserBeams: new Map(),
        friendlyProjectiles: new Map(),
        hostileProjectiles: new Map(),
        homingMissiles: new Map()
      }
    }
  };
}
