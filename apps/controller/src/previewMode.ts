import type {
  ControllerGameSnapshot,
  ControllerRoomView,
  CrewRole,
  PublicPlayerView
} from "@spaceship-defender/protocol";

/**
 * Dev-only layout preview: the controller renders a fixture instead of joining a
 * room, so every screen can be opened without a server. Fixtures mirror what
 * `toControllerRoomView` produces and are parsed by the protocol schema in tests.
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

export function previewPlayerId(role: CrewRole): string {
  return `preview-${role}`;
}

const PREVIEW_PLAYERS: readonly PublicPlayerView[] = [
  {
    playerId: previewPlayerId("pilot"),
    playerName: "Пилот",
    role: "pilot",
    ready: true,
    connected: true,
    latencyMs: 24
  },
  {
    playerId: previewPlayerId("gunner"),
    playerName: "Наводчик",
    role: "gunner",
    ready: false,
    connected: true,
    latencyMs: 38
  },
  {
    playerId: previewPlayerId("shield"),
    playerName: "Оператор щита",
    role: "shield",
    ready: true,
    connected: true,
    latencyMs: 57
  }
];

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
  }
} as const;

const EMPTY_TEAM_UPGRADE = {
  offer: null,
  votes: { pilot: null, gunner: null, shield: null },
  selection: null
} as const;

export function createPreviewRoomView(role: CrewRole, phase: PreviewPhase): ControllerRoomView {
  const players = PREVIEW_PLAYERS.map((player) =>
    phase === "result" && player.role === role ? { ...player, ready: false } : player
  );
  return {
    roomId: "PREVIEW",
    phase: phase === "lobby" ? "lobby" : "active",
    runNumber: phase === "lobby" ? 0 : 1,
    displayConnected: true,
    displayLatencyMs: 18,
    players,
    assignedRole: role,
    game: phase === "lobby" ? null : createPreviewGame(phase)
  };
}

function createPreviewGame(phase: Exclude<PreviewPhase, "lobby">): ControllerGameSnapshot {
  if (phase === "combat") {
    return {
      ...PREVIEW_WORLD,
      shield: { angle: Math.PI / 2, arcHalfAngle: 0.8, active: true, energy: 64, capacity: 120 },
      cannon: { heat: 62, capacity: 100, overheated: false },
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
      teamUpgrade: EMPTY_TEAM_UPGRADE
    };
  }
  if (phase === "intermission") {
    return {
      ...PREVIEW_WORLD,
      shield: { angle: 0, arcHalfAngle: 0.8, active: false, energy: 120, capacity: 120 },
      cannon: { heat: 0, capacity: 100, overheated: false },
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
    spaceship: { ...PREVIEW_WORLD.spaceship, hp: 0, velocityX: 0, velocityY: 0 },
    shield: { angle: 0, arcHalfAngle: 0.8, active: false, energy: 0, capacity: 120 },
    cannon: { heat: 100, capacity: 100, overheated: true },
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
