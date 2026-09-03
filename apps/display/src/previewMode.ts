import type { PreviewPhase } from "@spaceship-defender/client-shared";
import type { ModuleTreeEntry } from "./components/ModuleTreeWindow/index.js";
import type {
  DisplayGameSnapshot,
  DisplayRoomView,
  EntityVisual,
  PublicEnemyCatalogueEntry,
  TurretVisual
} from "@spaceship-defender/protocol";

/**
 * Dev-only layout preview: the display renders a fixture instead of creating a
 * room, so HUD, overlays and one Phaser frame can be inspected without a server.
 * Fixtures mirror `toDisplayRoomView` output and are parsed by the protocol
 * schema in tests.
 */

/** Frame the fixtures start at; the preview slider overrides it per render. */
export const PREVIEW_CAMERA_VIEW_WIDTH = 2200;

const PREVIEW_PLAYERS = [
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
 * The default hull tree: seats, labels and the effects each module applies.
 *
 * A fixture, not a source: the tree itself lives in `game-core` and in the
 * preset, and the display has no way to read either without a server. When the
 * catalogue starts carrying the tree and its effects, this goes and the window
 * reads that instead.
 */
export const PREVIEW_MODULE_TIERS: readonly (readonly ModuleTreeEntry[])[] = [
  [
    {
      id: "hullPlating1",
      role: "pilot",
      label: "Броневые пластины",
      effects: [{ target: "spaceshipMaxHp", op: "add", value: 40 }]
    }
  ],
  [
    {
      id: "thrusters1",
      role: "pilot",
      label: "Маршевые двигатели",
      effects: [
        { target: "spaceshipSpeedPerSecond", op: "percent", value: 0.08 },
        { target: "spaceshipAccelerationPerSecondSquared", op: "percent", value: 0.1 }
      ]
    },
    {
      id: "autoloader1",
      role: "gunner",
      label: "Автомат заряжания",
      effects: [{ target: "fireCooldownTicks", op: "multiply", value: 0.9 }]
    }
  ],
  [
    {
      id: "ammoFeed1",
      role: "gunner",
      label: "Усиленный боекомплект",
      effects: [{ target: "friendlyProjectileDamage", op: "percent", value: 0.12 }]
    },
    {
      id: "capacitor1",
      role: "shield",
      label: "Конденсатор",
      effects: [{ target: "shieldCapacity", op: "add", value: 25 }]
    }
  ],
  [
    {
      id: "gyroscopes1",
      role: "pilot",
      label: "Гироскопы",
      effects: [
        { target: "headingMaxAngularSpeedPerSecond", op: "percent", value: 0.15 },
        { target: "headingAngularAccelerationPerSecondSquared", op: "percent", value: 0.15 }
      ]
    },
    {
      id: "emitterCoils1",
      role: "shield",
      label: "Катушки эмиттера",
      effects: [{ target: "shieldRechargePerSecond", op: "percent", value: 0.18 }]
    }
  ],
  [
    {
      id: "noseCooling1",
      role: "pilot",
      label: "Обдув носового ствола",
      effects: [{ target: "mgCoolingPerSecond", op: "percent", value: 0.25 }]
    },
    {
      id: "barrelCooling1",
      role: "gunner",
      label: "Охлаждение пушки",
      effects: [{ target: "cannonCoolingPerSecond", op: "percent", value: 0.25 }]
    }
  ],
  [
    {
      id: "hullPlating2",
      role: "pilot",
      label: "Композитный корпус",
      effects: [{ target: "spaceshipMaxHp", op: "add", value: 60 }]
    },
    {
      id: "heavyRounds",
      role: "gunner",
      label: "Тяжёлые снаряды",
      effects: [
        { target: "friendlyProjectileDamage", op: "percent", value: 0.18 },
        { target: "projectileSpeedPerSecond", op: "percent", value: -0.05 }
      ]
    },
    {
      id: "wideArc",
      role: "shield",
      label: "Широкий сектор",
      effects: [{ target: "shieldArcRadians", op: "add", value: (20 * Math.PI) / 180 }]
    }
  ],
  [
    {
      id: "afterburner",
      role: "pilot",
      label: "Форсаж",
      effects: [
        { target: "spaceshipSpeedPerSecond", op: "percent", value: 0.14 },
        { target: "spaceshipAccelerationPerSecondSquared", op: "percent", value: 0.18 }
      ]
    },
    {
      id: "turretDrive",
      role: "gunner",
      label: "Привод башни",
      effects: [
        { target: "turretMaxAngularSpeedPerSecond", op: "percent", value: 0.25 },
        { target: "turretAngularAccelerationPerSecondSquared", op: "percent", value: 0.25 }
      ]
    },
    {
      id: "capacitor2",
      role: "shield",
      label: "Батарея повышенной ёмкости",
      effects: [{ target: "shieldCapacity", op: "add", value: 40 }]
    }
  ],
  [
    {
      id: "beltFeed",
      role: "pilot",
      label: "Ленточная подача",
      effects: [{ target: "mgFireCooldownTicks", op: "multiply", value: 0.85 }]
    },
    {
      id: "highVelocity",
      role: "gunner",
      label: "Высокая начальная скорость",
      effects: [
        { target: "projectileSpeedPerSecond", op: "percent", value: 0.2 },
        { target: "projectileRadius", op: "percent", value: 0.1 }
      ]
    },
    {
      id: "fastEngage",
      role: "shield",
      label: "Быстрый подъём",
      effects: [
        { target: "shieldEngageTicks", op: "multiply", value: 0.6 },
        { target: "shieldCooldownTicks", op: "multiply", value: 0.7 }
      ]
    }
  ],
  [
    {
      id: "hullPlating3",
      role: "pilot",
      label: "Реактивная броня",
      effects: [{ target: "spaceshipMaxHp", op: "add", value: 90 }]
    },
    {
      id: "noseCalibre",
      role: "pilot",
      label: "Крупный калибр носа",
      effects: [{ target: "mgDamage", op: "percent", value: 0.3 }]
    },
    {
      id: "cannonCalibre",
      role: "gunner",
      label: "Крупный калибр",
      effects: [{ target: "friendlyProjectileDamage", op: "percent", value: 0.25 }]
    },
    {
      id: "drainControl",
      role: "shield",
      label: "Контроль расхода",
      effects: [{ target: "shieldDrainPerSecond", op: "multiply", value: 0.75 }]
    }
  ],
  [
    {
      id: "reactorOverdrive",
      role: "pilot",
      label: "Разгон реактора",
      effects: [
        { target: "spaceshipSpeedPerSecond", op: "percent", value: 0.18 },
        { target: "spaceshipAccelerationPerSecondSquared", op: "percent", value: 0.2 }
      ]
    },
    {
      id: "rapidFire",
      role: "gunner",
      label: "Скорострельность",
      effects: [{ target: "fireCooldownTicks", op: "multiply", value: 0.75 }]
    },
    {
      id: "heatSink",
      role: "gunner",
      label: "Радиатор",
      effects: [
        { target: "cannonHeatCapacity", op: "percent", value: 0.4 },
        { target: "cannonHeatPerShot", op: "multiply", value: 0.85 }
      ]
    },
    {
      id: "fullDome",
      role: "shield",
      label: "Полный купол",
      effects: [
        { target: "shieldArcRadians", op: "add", value: (40 * Math.PI) / 180 },
        { target: "shieldRechargePerSecond", op: "percent", value: 0.2 }
      ]
    }
  ]
];

export const PREVIEW_ENDLESS_TIER: readonly ModuleTreeEntry[] = [
  {
    id: "endlessHull",
    role: "pilot",
    label: "Ремонтные накладки",
    effects: [{ target: "spaceshipMaxHp", op: "add", value: 30 }]
  },
  {
    id: "endlessDamage",
    role: "gunner",
    label: "Калибровка орудия",
    effects: [{ target: "friendlyProjectileDamage", op: "percent", value: 0.08 }]
  },
  {
    id: "endlessShield",
    role: "shield",
    label: "Подстройка эмиттера",
    effects: [{ target: "shieldCapacity", op: "add", value: 15 }]
  }
];

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
const PREVIEW_PURCHASES = [
  "hullPlating1",
  "thrusters1",
  "capacitor1",
  "gyroscopes1",
  "barrelCooling1",
  "wideArc"
];

const PREVIEW_WORLD = {
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
  turretVisual: PREVIEW_TURRET_VISUAL,
  shieldRadius: 104,
  obstacles: []
};

const EMPTY_WORLD_ENTITIES = {
  enemyShips: [],
  asteroids: [],
  lootDrops: [],
  laserBeams: [],
  friendlyProjectiles: [],
  hostileProjectiles: [],
  homingMissiles: []
};

const EMPTY_TEAM_UPGRADE = {
  offer: null,
  votes: { pilot: null, gunner: null, shield: null },
  selection: null
} as const;

export function createPreviewRoomView(
  phase: PreviewPhase,
  cameraViewWidth: number = PREVIEW_CAMERA_VIEW_WIDTH
): DisplayRoomView {
  return {
    roomId: "PREVIEW",
    phase: phase === "lobby" ? "lobby" : "active",
    runNumber: phase === "lobby" ? 0 : 1,
    crewSize: 3,
    shipArchetypeId: "guardian",
    displayConnected: true,
    displayLatencyMs: 18,
    players: [...PREVIEW_PLAYERS],
    game: phase === "lobby" ? null : createPreviewGame(phase, cameraViewWidth)
  };
}

function createPreviewGame(
  phase: Exclude<PreviewPhase, "lobby">,
  cameraViewWidth: number
): DisplayGameSnapshot {
  if (phase === "combat") {
    return {
      ...PREVIEW_WORLD,
      shieldPhase: "down",
      cameraViewWidth,
      shield: {
        angle: Math.PI / 2,
        arcHalfAngle: 0.8,
        rearmRequired: false,
        active: true,
        energy: 64,
        capacity: 120
      },
      cannon: {
        heat: 62,
        capacity: 100,
        overheated: false,
        kind: "kinetic",
        reach: 1500,
        speed: 1000,
        acquireHalfAngle: 0
      },
      machineGun: {
        heat: 46,
        capacity: 100,
        overheated: false,
        kind: "kinetic",
        reach: 620,
        speed: 900
      },
      encounter: {
        phase: "combat",
        outcome: null,
        defeatReason: null,
        waveNumber: 7,
        encounterTick: 240,
        phaseTicksRemaining: 0,
        waveSecondsRemaining: 47,
        lootWindowSecondsRemaining: 0,
        score: 320
      },
      credits: 6,
      teamUpgrade: EMPTY_TEAM_UPGRADE,
      enemyShips: [
        {
          entityId: "preview-enemy-1",
          spawnSequence: 1,
          x: 2820,
          y: 1780,
          velocityX: -60,
          velocityY: 24,
          radius: 46,
          kind: "gunship",
          heading: Math.PI,
          hp: 70,
          maxHp: 90
        },
        {
          entityId: "preview-enemy-2",
          spawnSequence: 2,
          x: 1580,
          y: 2540,
          velocityX: 48,
          velocityY: -30,
          radius: 54,
          kind: "missileCarrier",
          heading: 0,
          hp: 120,
          maxHp: 140
        },
        {
          entityId: "preview-boss",
          spawnSequence: 10,
          x: 2180,
          y: 1420,
          velocityX: -14,
          velocityY: 22,
          radius: 96,
          kind: "boss",
          heading: Math.PI / 2,
          hp: 1420,
          maxHp: 2000
        }
      ],
      lootDrops: [],
      laserBeams: [],
      asteroids: [
        {
          entityId: "preview-asteroid-1",
          origin: "wave",
          spawnSequence: 3,
          x: 2480,
          y: 2860,
          velocityX: -18,
          velocityY: -40,
          radius: 72,
          hp: 60,
          maxHp: 60
        },
        {
          entityId: "preview-asteroid-2",
          origin: "ambient",
          spawnSequence: 9,
          x: 1720,
          y: 1880,
          velocityX: 30,
          velocityY: 24,
          radius: 48,
          hp: 60,
          maxHp: 60
        }
      ],
      friendlyProjectiles: [
        {
          entityId: "preview-friendly-1",
          spawnSequence: 4,
          x: 2440,
          y: 2020,
          velocityX: 420,
          velocityY: -240,
          radius: 10,
          kind: "friendly",
          source: "cannon",
          visual: null
        },
        {
          entityId: "preview-friendly-2",
          spawnSequence: 5,
          x: 2330,
          y: 2110,
          velocityX: 380,
          velocityY: -210,
          radius: 6,
          kind: "friendly",
          source: "machineGun",
          visual: null
        }
      ],
      hostileProjectiles: [
        {
          entityId: "preview-hostile-1",
          spawnSequence: 6,
          x: 2660,
          y: 1960,
          velocityX: -300,
          velocityY: 180,
          radius: 9,
          kind: "hostile",
          visual: null
        }
      ],
      homingMissiles: [
        {
          entityId: "preview-missile-1",
          spawnSequence: 7,
          x: 1820,
          y: 2420,
          velocityX: 200,
          velocityY: -150,
          radius: 14,
          heading: -Math.PI / 5,
          visual: null
        }
      ]
    };
  }
  if (phase === "intermission") {
    return {
      ...PREVIEW_WORLD,
      ...EMPTY_WORLD_ENTITIES,
      shieldPhase: "down",
      cameraViewWidth,
      shield: {
        angle: 0,
        arcHalfAngle: 0.8,
        rearmRequired: false,
        active: false,
        energy: 120,
        capacity: 120
      },
      cannon: {
        heat: 0,
        capacity: 100,
        overheated: false,
        kind: "kinetic",
        reach: 1500,
        speed: 1000,
        acquireHalfAngle: 0
      },
      machineGun: {
        heat: 0,
        capacity: 100,
        overheated: false,
        kind: "kinetic",
        reach: 620,
        speed: 900
      },
      encounter: {
        phase: "intermission",
        outcome: null,
        defeatReason: null,
        waveNumber: 7,
        encounterTick: 260,
        phaseTicksRemaining: 180,
        waveSecondsRemaining: 0,
        lootWindowSecondsRemaining: 0,
        score: 320
      },
      credits: 6,
      teamUpgrade: {
        offer: {
          offerId: "preview-offer-w7",
          waveNumber: 7,
          tier: 7,
          cards: [
            {
              upgradeId: "afterburner",
              role: "pilot",
              label: "Форсаж",
              effects: [{ target: "spaceshipSpeedPerSecond", op: "percent", value: 0.14 }],
              price: 5
            },
            {
              upgradeId: "turretDrive",
              role: "gunner",
              label: "Привод башни",
              effects: [{ target: "turretMaxAngularSpeedPerSecond", op: "percent", value: 0.25 }],
              price: 5
            },
            {
              upgradeId: "capacitor2",
              role: "shield",
              label: "Батарея повышенной ёмкости",
              effects: [{ target: "shieldCapacity", op: "add", value: 40 }],
              price: 5
            }
          ]
        },
        votes: {
          pilot: { role: "pilot", upgradeId: "turretDrive", revision: 2 },
          gunner: { role: "gunner", upgradeId: "turretDrive", revision: 1 },
          shield: null
        },
        selection: null
      }
    };
  }
  return {
    ...PREVIEW_WORLD,
    ...EMPTY_WORLD_ENTITIES,
    shieldPhase: "down",
    // The ballot below closed on the turret drive, so the result frame owns it.
    purchasedModules: [...PREVIEW_PURCHASES, "turretDrive"],
    cameraViewWidth,
    spaceship: { ...PREVIEW_WORLD.spaceship, hp: 0, velocityX: 0, velocityY: 0 },
    shield: {
      angle: 0,
      arcHalfAngle: 0.8,
      rearmRequired: false,
      active: false,
      energy: 0,
      capacity: 120
    },
    cannon: {
      heat: 100,
      capacity: 100,
      overheated: true,
      kind: "kinetic",
      reach: 1500,
      speed: 1000,
      acquireHalfAngle: 0
    },
    machineGun: {
      heat: 100,
      capacity: 100,
      overheated: true,
      kind: "kinetic",
      reach: 620,
      speed: 900
    },
    encounter: {
      phase: "result",
      outcome: "defeat",
      defeatReason: "spaceship_destroyed",
      waveNumber: 8,
      encounterTick: 520,
      phaseTicksRemaining: 0,
      waveSecondsRemaining: 0,
      lootWindowSecondsRemaining: 0,
      score: 610
    },
    credits: 11,
    teamUpgrade: EMPTY_TEAM_UPGRADE
  };
}
