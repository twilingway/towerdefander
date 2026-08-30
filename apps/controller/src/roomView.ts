import {
  CREW_ROLES,
  controllerRoomViewSchema,
  type ControllerRoomView,
  type CrewRole,
  type DefeatReason,
  type EncounterPhase,
  type HelmScheme,
  type PublicPlayerView,
  type PublicSpaceshipView,
  type PublicUpgradeVote,
  type TerminalOutcome,
  type UpgradeId
} from "@spaceship-defender/protocol";

interface ValueCollection<T> {
  values(): IterableIterator<T>;
}

interface NetworkPlayerState {
  playerId: string;
  playerName: string;
  role: CrewRole;
  ready: boolean;
  connected: boolean;
  latencyMs: number;
}

interface NetworkUpgradeCardState {
  upgradeId: UpgradeId;
  role: CrewRole;
  label: string;
  value: number;
  price: number;
}

interface NetworkUpgradeVoteState {
  role: CrewRole;
  upgradeId: UpgradeId;
  revision: number;
}

interface NetworkTeamUpgradeState {
  hasOffer?: boolean;
  offer: {
    offerId: string;
    waveNumber: number;
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

interface NetworkGameState {
  tick: number;
  elapsedMs: number;
  worldWidth: number;
  worldHeight: number;
  arenaRadius: number;
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
  };
  machineGun: {
    heat: number;
    capacity: number;
    overheated: boolean;
  };
  helm?: {
    scheme: HelmScheme;
    headingLeadRadians: number;
    stopDampening: number;
    rotateInPlaceThrottle: number;
    hullAngularBrakingPerSecondSquared: number;
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
    score: number;
  };
  roleModifiers: {
    pilot: { speedMultiplier: number; accelerationMultiplier: number; maxHpBonus: number };
    gunner: {
      damageMultiplier: number;
      cooldownMultiplier: number;
      projectileSpeedMultiplier: number;
    };
    shield: { capacityBonus: number; rechargeMultiplier: number; arcWidthBonus: number };
  };
  credits: number;
  teamUpgrade?: NetworkTeamUpgradeState;
}

export interface NetworkRoomState {
  roomId?: string;
  phase?: ControllerRoomView["phase"];
  runNumber?: number;
  crewSize?: number;
  displayConnected?: boolean;
  displayLatencyMs?: number;
  players?: ValueCollection<NetworkPlayerState>;
  hasGame?: boolean;
  game?: NetworkGameState;
}

export function toControllerRoomView(
  state: NetworkRoomState | undefined,
  playerId: string
): ControllerRoomView | undefined {
  if (
    state === undefined ||
    typeof state.roomId !== "string" ||
    state.phase === undefined ||
    typeof state.runNumber !== "number" ||
    typeof state.crewSize !== "number" ||
    typeof state.displayConnected !== "boolean" ||
    state.players === undefined
  ) {
    return undefined;
  }

  const players = [...state.players.values()]
    .map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      role: player.role,
      ready: player.ready,
      connected: player.connected,
      latencyMs: toPublicLatency(player.latencyMs)
    }))
    .sort((left, right) => CREW_ROLES.indexOf(left.role) - CREW_ROLES.indexOf(right.role));
  const assignedRole = players.find((player) => player.playerId === playerId)?.role;
  if (assignedRole === undefined) return undefined;
  const game = state.game;

  return controllerRoomViewSchema.parse({
    roomId: state.roomId,
    phase: state.phase,
    runNumber: state.runNumber,
    crewSize: state.crewSize,
    displayConnected: state.displayConnected,
    displayLatencyMs: toPublicLatency(state.displayLatencyMs),
    players,
    assignedRole,
    game:
      state.hasGame === true && game !== undefined
        ? {
            tick: game.tick,
            elapsedMs: game.elapsedMs,
            worldWidth: game.worldWidth,
            worldHeight: game.worldHeight,
            arenaRadius: game.arenaRadius,
            spaceship: { ...game.spaceship },
            turretAngle: game.turretAngle,
            shield: { ...game.shield },
            cannon: { ...game.cannon },
            machineGun: { ...game.machineGun },
            encounter: {
              phase: game.encounter.phase,
              outcome:
                game.encounter.hasOutcome === true || game.encounter.outcome === null
                  ? game.encounter.outcome
                  : null,
              defeatReason:
                game.encounter.hasDefeatReason === true || game.encounter.defeatReason === null
                  ? game.encounter.defeatReason
                  : null,
              waveNumber: game.encounter.waveNumber,
              encounterTick: game.encounter.encounterTick,
              phaseTicksRemaining: game.encounter.phaseTicksRemaining,
              waveSecondsRemaining: game.encounter.waveSecondsRemaining,
              score: game.encounter.score
            },
            roleModifiers: {
              pilot: { ...game.roleModifiers.pilot },
              gunner: { ...game.roleModifiers.gunner },
              shield: { ...game.roleModifiers.shield }
            },
            credits: game.credits,
            teamUpgrade: toTeamUpgradeView(game.teamUpgrade),
            helm: game.helm
          }
        : null
  });
}

function toTeamUpgradeView(teamUpgrade: NetworkTeamUpgradeState | undefined) {
  const votes: Record<CrewRole, PublicUpgradeVote | null> = {
    pilot: null,
    gunner: null,
    shield: null
  };
  if (teamUpgrade !== undefined) {
    for (const vote of teamUpgrade.votes.values()) {
      votes[vote.role] = {
        role: vote.role,
        upgradeId: vote.upgradeId,
        revision: vote.revision
      };
    }
  }
  return {
    offer:
      teamUpgrade?.hasOffer === true
        ? {
            offerId: teamUpgrade.offer.offerId,
            waveNumber: teamUpgrade.offer.waveNumber,
            cards: [...teamUpgrade.offer.cards.values()].map((card) => ({ ...card }))
          }
        : null,
    votes,
    selection: teamUpgrade?.hasSelection === true ? { ...teamUpgrade.selection } : null
  };
}

function toPublicLatency(latencyMs: number | undefined): number | null {
  return latencyMs === undefined || latencyMs < 0 ? null : latencyMs;
}

export function getRoomFromLocation(search: string): string {
  return new URLSearchParams(search).get("room")?.trim() ?? "";
}

export function findCurrentPlayer(
  view: ControllerRoomView | undefined,
  playerId: string
): PublicPlayerView | undefined {
  return view?.players.find((player) => player.playerId === playerId);
}
