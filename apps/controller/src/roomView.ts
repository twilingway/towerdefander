import {
  CREW_ROLES,
  controllerRoomViewSchema,
  type ControllerRoomView,
  type CrewRole,
  type DefeatReason,
  type EncounterPhase,
  type PublicPlayerView,
  type PublicSpaceshipView,
  type TerminalOutcome,
  type UpgradeId,
  type UpgradeSelectionSource,
  type UpgradeStatus
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
  label: string;
  value: number;
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
    energy: number;
    capacity: number;
  };
  machineGun: {
    heat: number;
    capacity: number;
    overheated: boolean;
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
  upgrade?: ValueCollection<{
    status: UpgradeStatus;
    offer: {
      offerId: string;
      role: CrewRole;
      waveNumber: number;
      cards: ValueCollection<NetworkUpgradeCardState>;
    };
    hasSelection: boolean;
    selection: {
      offerId: string;
      upgradeId: UpgradeId;
      role: CrewRole;
      source: UpgradeSelectionSource;
    };
  }>;
}

export interface NetworkRoomState {
  roomId?: string;
  phase?: ControllerRoomView["phase"];
  runNumber?: number;
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
  const upgrade = game?.upgrade === undefined ? undefined : [...game.upgrade.values()][0];

  return controllerRoomViewSchema.parse({
    roomId: state.roomId,
    phase: state.phase,
    runNumber: state.runNumber,
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
            upgrade:
              upgrade === undefined
                ? null
                : {
                    status: upgrade.status,
                    offer: {
                      offerId: upgrade.offer.offerId,
                      role: upgrade.offer.role,
                      waveNumber: upgrade.offer.waveNumber,
                      cards: [...upgrade.offer.cards.values()]
                    },
                    selection: upgrade.hasSelection ? { ...upgrade.selection } : null
                  }
          }
        : null
  });
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
