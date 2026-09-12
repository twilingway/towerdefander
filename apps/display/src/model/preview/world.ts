import type {
  DisplayRoomView,
  EntityVisual,
  PublicEnemyCatalogueEntry,
  TurretVisual
} from "@spaceship-defender/protocol";

/** Frame the fixtures start at; the preview slider overrides it per render. */
export const PREVIEW_CAMERA_VIEW_WIDTH = 2200;

export const PREVIEW_PLAYERS: DisplayRoomView["players"] = [
  {
    playerId: "preview-pilot",
    playerName: "Пилот",
    role: "pilot",
    ready: true,
    connected: true,
    latencyMs: 24
  },
  {
    playerId: "preview-gunner",
    playerName: "Наводчик",
    role: "gunner",
    ready: true,
    connected: true,
    latencyMs: 38
  },
  {
    playerId: "preview-shield",
    playerName: "Оператор щита",
    role: "shield",
    ready: false,
    connected: true,
    latencyMs: 57
  }
] as const satisfies DisplayRoomView["players"];

/**
 * No server answers a preview, so the look cannot come from the preset: these
 * mirror what `apps/server/data/balance.json` picks, and the frame shows the
 * chosen art instead of the fallback silhouettes.
 */
const PREVIEW_ENEMY_CATALOGUE: PublicEnemyCatalogueEntry[] = [
  {
    kind: "gunship",
    label: "Ганшип",
    shape: "ship-delta",
    modelScale: 1,
    showHealthBar: true,
    isBoss: false
  },
  {
    kind: "missileCarrier",
    label: "Ракетоносец",
    shape: "ship-broadwing",
    modelScale: 1,
    showHealthBar: true,
    isBoss: false
  },
  // One boss in the fixture, so the preview shows the bar under the clock.
  {
    kind: "boss",
    label: "Босс",
    shape: "boss-hammerhead",
    modelScale: 1.4,
    showHealthBar: true,
    isBoss: true
  }
];

const PREVIEW_SPACESHIP_VISUAL: EntityVisual = { shape: "ship-dart", modelScale: 1 };

const PREVIEW_TURRET_VISUAL: TurretVisual = {
  shape: "weapon-beam",
  modelScale: 0.6,
  mountX: 0.2,
  mountY: 0.55,
  pivotX: 0.2,
  pivotY: 0
};

/**
 * One module per tier, so the ribbon shows a crew six tiers deep and the offer
 * below it is the seventh tier of the default tree.
 */
export const PREVIEW_PURCHASES = [
  "hullPlating1",
  "thrusters1",
  "capacitor1",
  "gyroscopes1",
  "barrelCooling1",
  "wideArc"
];

export const PREVIEW_WORLD = {
  tick: 240,
  elapsedMs: 12_000,
  worldWidth: 4400,
  worldHeight: 4400,
  cameraViewWidth: PREVIEW_CAMERA_VIEW_WIDTH,
  background: {
    parallaxStrength: 1,
    driftSpeed: 1,
    nebulaAlpha: 0.72,
    nebulaPreset: "blue" as const
  },
  arenaRadius: 2200,
  helm: {
    scheme: "tank" as const,
    headingLeadRadians: 0.45,
    stopDampening: 1,
    rotateInPlaceThrottle: 0.02,
    hullAngularBrakingPerSecondSquared: 50,
    hullAngularMaxSpeed: 3.14159,
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
  rimBandWidth: 260,
  shieldPhase: "down",
  purchasedModules: [...PREVIEW_PURCHASES],
  spaceship: {
    x: 2200,
    y: 2200,
    velocityX: 42,
    velocityY: -18,
    radius: 52,
    hp: 740,
    maxHp: 1000,
    heading: Math.PI / 4
  },
  turretAngle: Math.PI / 3,
  enemyCatalogue: [...PREVIEW_ENEMY_CATALOGUE],
  // The preset keeps the ambient rock at the display default, so the preview does too.
  asteroidVisual: null,
  spaceshipVisual: PREVIEW_SPACESHIP_VISUAL,
  shieldBandEffect: "",
  shieldImpactEffect: "",
  shipDeathEffect: "",
  shipMuzzleEffect: "",
  turretVisual: PREVIEW_TURRET_VISUAL,
  shieldRadius: 104,
  // The campaign has no zone sheet; the arena fills this in.
  arenaZones: [],
  arenaShips: [],
  obstacles: []
};

export const EMPTY_WORLD_ENTITIES = {
  enemyShips: [],
  asteroids: [],
  lootDrops: [],
  laserBeams: [],
  friendlyProjectiles: [],
  hostileProjectiles: [],
  homingMissiles: []
};

export const EMPTY_TEAM_UPGRADE = {
  offer: null,
  votes: { pilot: null, gunner: null, shield: null },
  selection: null
} as const;
