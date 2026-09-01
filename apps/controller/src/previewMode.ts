import type { PreviewPhase } from "@spaceship-defender/client-shared";
import { CREW_ROLES } from "@spaceship-defender/protocol";
import type {
  ControllerGameSnapshot,
  ControllerRoomView,
  CrewRole,
  CrewSize,
  PublicPlayerView
} from "@spaceship-defender/protocol";

/**
 * Dev-only layout preview: the controller renders a fixture instead of joining a
 * room, so every screen can be opened without a server. Fixtures mirror what
 * `toControllerRoomView` produces and are parsed by the protocol schema in tests.
 */

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
  turretAngle: Math.PI / 3
} as const;

const PREVIEW_HELM = {
  scheme: "tank",
  headingLeadRadians: 0.5,
  stopDampening: 1,
  rotateInPlaceThrottle: 0.02,
  hullAngularBrakingPerSecondSquared: 50
} as const;

const EMPTY_TEAM_UPGRADE = {
  offer: null,
  votes: { pilot: null, gunner: null, shield: null },
  selection: null
} as const;

export function createPreviewRoomView(
  role: CrewRole,
  phase: PreviewPhase,
  crewSize: CrewSize = 3
): ControllerRoomView {
  // A smaller crew fills seats in CREW_ROLES order, the way the room assigns
  // them; a role without a seat falls back to the pilot, who always has one.
  const seats = CREW_ROLES.slice(0, crewSize);
  const seat = seats.includes(role) ? role : "pilot";
  const players = PREVIEW_PLAYERS.filter(({ role: candidate }) => seats.includes(candidate)).map(
    (player) => (phase === "result" && player.role === seat ? { ...player, ready: false } : player)
  );
  return {
    roomId: "PREVIEW",
    phase: phase === "lobby" ? "lobby" : "active",
    runNumber: phase === "lobby" ? 0 : 1,
    crewSize,
    shipArchetypeId: "guardian",
    displayConnected: true,
    displayLatencyMs: 18,
    players,
    assignedRole: seat,
    game: phase === "lobby" ? null : createPreviewGame(phase, seats)
  };
}

function createPreviewGame(
  phase: Exclude<PreviewPhase, "lobby">,
  seats: readonly CrewRole[]
): ControllerGameSnapshot {
  if (phase === "combat") {
    return {
      ...PREVIEW_WORLD,
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
        acquireHalfAngle: 0
      },
      machineGun: { heat: 46, capacity: 100, overheated: false },
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
      helm: PREVIEW_HELM,
      teamUpgrade: EMPTY_TEAM_UPGRADE
    };
  }
  if (phase === "intermission") {
    return {
      ...PREVIEW_WORLD,
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
        acquireHalfAngle: 0
      },
      machineGun: { heat: 0, capacity: 100, overheated: false },
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
      helm: PREVIEW_HELM,
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
          // A seat the crew size does not have cannot have voted.
          pilot: { role: "pilot", upgradeId: "turretDrive", revision: 2 },
          gunner: seats.includes("gunner")
            ? { role: "gunner", upgradeId: "turretDrive", revision: 1 }
            : null,
          shield: null
        },
        selection: null
      }
    };
  }
  return {
    ...PREVIEW_WORLD,
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
      acquireHalfAngle: 0
    },
    machineGun: { heat: 100, capacity: 100, overheated: true },
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
    helm: PREVIEW_HELM,
    teamUpgrade: EMPTY_TEAM_UPGRADE
  };
}
