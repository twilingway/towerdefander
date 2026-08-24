import type { DisplayGameSnapshot, DisplayRoomView } from "@spaceship-defender/protocol";

/**
 * Dev-only layout preview: the display renders a fixture instead of creating a
 * room, so HUD, overlays and one Phaser frame can be inspected without a server.
 * Fixtures mirror `toDisplayRoomView` output and are parsed by the protocol
 * schema in tests.
 */

export type PreviewPhase = "lobby" | "combat" | "intermission" | "result";

export const PREVIEW_PHASES: readonly PreviewPhase[] = [
  "lobby",
  "combat",
  "intermission",
  "result"
];

export function isPreviewMode(search: string, development: boolean): boolean {
  return development && new URLSearchParams(search).get("preview") === "1";
}

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

const PREVIEW_WORLD = {
  tick: 240,
  elapsedMs: 12_000,
  worldWidth: 4400,
  worldHeight: 4400,
  arenaRadius: 2200,
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
  roleModifiers: {
    pilot: { speedMultiplier: 1.1, accelerationMultiplier: 1, maxHpBonus: 0 },
    gunner: { damageMultiplier: 1.15, cooldownMultiplier: 0.9, projectileSpeedMultiplier: 1 },
    shield: { capacityBonus: 20, rechargeMultiplier: 1, arcWidthBonus: 0 }
  },
  obstacles: []
};

const EMPTY_WORLD_ENTITIES = {
  enemyShips: [],
  asteroids: [],
  friendlyProjectiles: [],
  hostileProjectiles: [],
  homingMissiles: []
};

const EMPTY_TEAM_UPGRADE = {
  offer: null,
  votes: { pilot: null, gunner: null, shield: null },
  selection: null
} as const;

export function createPreviewRoomView(phase: PreviewPhase): DisplayRoomView {
  return {
    roomId: "PREVIEW",
    phase: phase === "lobby" ? "lobby" : "active",
    runNumber: phase === "lobby" ? 0 : 1,
    displayConnected: true,
    displayLatencyMs: 18,
    players: [...PREVIEW_PLAYERS],
    game: phase === "lobby" ? null : createPreviewGame(phase)
  };
}

function createPreviewGame(phase: Exclude<PreviewPhase, "lobby">): DisplayGameSnapshot {
  if (phase === "combat") {
    return {
      ...PREVIEW_WORLD,
      shield: { angle: Math.PI / 2, arcHalfAngle: 0.8, active: true, energy: 64, capacity: 120 },
      machineGun: { heat: 46, capacity: 100, overheated: false },
      encounter: {
        phase: "combat",
        outcome: null,
        defeatReason: null,
        waveNumber: 3,
        encounterTick: 240,
        phaseTicksRemaining: 0,
        waveSecondsRemaining: 47,
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
        }
      ],
      asteroids: [
        {
          entityId: "preview-asteroid-1",
          spawnSequence: 3,
          x: 2480,
          y: 2860,
          velocityX: -18,
          velocityY: -40,
          radius: 72,
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
          source: "cannon"
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
          source: "machineGun"
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
          kind: "hostile"
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
          heading: -Math.PI / 5
        }
      ]
    };
  }
  if (phase === "intermission") {
    return {
      ...PREVIEW_WORLD,
      ...EMPTY_WORLD_ENTITIES,
      shield: { angle: 0, arcHalfAngle: 0.8, active: false, energy: 120, capacity: 120 },
      machineGun: { heat: 0, capacity: 100, overheated: false },
      encounter: {
        phase: "intermission",
        outcome: null,
        defeatReason: null,
        waveNumber: 3,
        encounterTick: 260,
        phaseTicksRemaining: 180,
        waveSecondsRemaining: 0,
        score: 320
      },
      credits: 6,
      teamUpgrade: {
        offer: {
          offerId: "preview-offer-w3",
          waveNumber: 3,
          cards: [
            {
              upgradeId: "pilot_speed",
              role: "pilot",
              label: "Скорость +10%",
              value: 0.1,
              price: 5
            },
            {
              upgradeId: "gunner_damage",
              role: "gunner",
              label: "Урон +15%",
              value: 0.15,
              price: 5
            },
            {
              upgradeId: "shield_capacity",
              role: "shield",
              label: "Ёмкость +20",
              value: 20,
              price: 5
            }
          ]
        },
        votes: {
          pilot: { role: "pilot", upgradeId: "gunner_damage", revision: 2 },
          gunner: { role: "gunner", upgradeId: "gunner_damage", revision: 1 },
          shield: null
        },
        selection: null
      }
    };
  }
  return {
    ...PREVIEW_WORLD,
    ...EMPTY_WORLD_ENTITIES,
    spaceship: { ...PREVIEW_WORLD.spaceship, hp: 0, velocityX: 0, velocityY: 0 },
    shield: { angle: 0, arcHalfAngle: 0.8, active: false, energy: 0, capacity: 120 },
    machineGun: { heat: 100, capacity: 100, overheated: true },
    encounter: {
      phase: "result",
      outcome: "defeat",
      defeatReason: "spaceship_destroyed",
      waveNumber: 4,
      encounterTick: 520,
      phaseTicksRemaining: 0,
      waveSecondsRemaining: 0,
      score: 610
    },
    credits: 11,
    teamUpgrade: EMPTY_TEAM_UPGRADE
  };
}
