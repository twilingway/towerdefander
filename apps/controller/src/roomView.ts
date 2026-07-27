import {
  publicRoomViewSchema,
  type DefenseResult,
  type DefenseStage,
  type EnemyType,
  type PublicPlayerView,
  type PublicRoomView
} from "@town-defenders/protocol";

interface NetworkPlayerState {
  playerId: string;
  playerName: string;
  ready: boolean;
  connected: boolean;
  sectorId?: number | null;
}

interface ValueCollection<T> {
  values(): IterableIterator<T>;
}

interface NetworkSectorState {
  sectorId: number;
  assignedPlayerId: string;
  gateHealth: number;
  gateMaxHealth: number;
  defenseLevel: number;
  defenseDamage: number;
  nextUpgradeCost: number;
  enemyCount: number;
  airstrikeTargetAvailable: boolean;
}

interface NetworkEnemyState {
  enemyId: string;
  sectorId: number;
  enemyType: EnemyType;
  health: number;
  maxHealth: number;
  progress: number;
}

interface NetworkGameState {
  tick: number;
  elapsedMs: number;
  treasury: number;
  pathLength: number;
  repairCost: number;
  result: DefenseResult;
  waveNumber: number;
  totalWaves: number;
  stage: DefenseStage;
  intermissionRemainingSeconds: number;
  airstrikeCharge: number;
  airstrikeChargeRequired: number;
  airstrikeDamage: number;
  lastAirstrikeSequence: number;
  lastAirstrikeActionId: string;
  lastAirstrikePlayerId: string;
  lastAirstrikeTargetSectorId: number;
  lastAirstrikeAppliedTick: number;
  sectors: ValueCollection<NetworkSectorState>;
  enemies?: ValueCollection<NetworkEnemyState>;
}

export interface NetworkRoomState {
  roomId?: string;
  phase?: PublicRoomView["phase"];
  displayConnected?: boolean;
  players?: ValueCollection<NetworkPlayerState>;
  hasGame?: boolean;
  game?: NetworkGameState;
}

export function toPublicRoomView(state: NetworkRoomState | undefined): PublicRoomView | undefined {
  if (
    state === undefined ||
    typeof state.roomId !== "string" ||
    state.phase === undefined ||
    typeof state.displayConnected !== "boolean" ||
    state.players === undefined
  ) {
    return undefined;
  }

  return publicRoomViewSchema.parse({
    roomId: state.roomId,
    phase: state.phase,
    displayConnected: state.displayConnected,
    players: [...state.players.values()].map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      ready: player.ready,
      connected: player.connected,
      sectorId: player.sectorId === 0 || player.sectorId === 1 ? player.sectorId : null
    })),
    game:
      state.hasGame === true && state.game !== undefined
        ? {
            tick: state.game.tick,
            elapsedMs: state.game.elapsedMs,
            treasury: state.game.treasury,
            pathLength: state.game.pathLength,
            repairCost: state.game.repairCost,
            result: state.game.result,
            waveNumber: state.game.waveNumber,
            totalWaves: state.game.totalWaves,
            stage: state.game.stage,
            intermissionRemainingSeconds: state.game.intermissionRemainingSeconds,
            airstrikeCharge: state.game.airstrikeCharge,
            airstrikeChargeRequired: state.game.airstrikeChargeRequired,
            airstrikeDamage: state.game.airstrikeDamage,
            lastAirstrikeEffect:
              state.game.lastAirstrikeSequence > 0 &&
              (state.game.lastAirstrikeTargetSectorId === 0 ||
                state.game.lastAirstrikeTargetSectorId === 1)
                ? {
                    sequence: state.game.lastAirstrikeSequence,
                    actionId: state.game.lastAirstrikeActionId,
                    playerId: state.game.lastAirstrikePlayerId,
                    targetSectorId: state.game.lastAirstrikeTargetSectorId,
                    appliedTick: state.game.lastAirstrikeAppliedTick
                  }
                : null,
            sectors: [...state.game.sectors.values()].map((sector) => ({
              sectorId: sector.sectorId,
              assignedPlayerId: sector.assignedPlayerId.length > 0 ? sector.assignedPlayerId : null,
              gateHealth: sector.gateHealth,
              gateMaxHealth: sector.gateMaxHealth,
              defenseLevel: sector.defenseLevel,
              defenseDamage: sector.defenseDamage,
              nextUpgradeCost: sector.nextUpgradeCost >= 0 ? sector.nextUpgradeCost : null,
              enemyCount: sector.enemyCount,
              airstrikeTargetAvailable: sector.airstrikeTargetAvailable
            })),
            enemies: [...(state.game.enemies?.values() ?? [])].map((enemy) => ({
              enemyId: enemy.enemyId,
              sectorId: enemy.sectorId,
              enemyType: enemy.enemyType,
              health: enemy.health,
              maxHealth: enemy.maxHealth,
              progress: enemy.progress
            }))
          }
        : null
  });
}

export function getRoomFromLocation(search: string): string {
  return new URLSearchParams(search).get("room")?.trim() ?? "";
}

export function findCurrentPlayer(
  view: PublicRoomView | undefined,
  playerId: string
): PublicPlayerView | undefined {
  return view?.players.find((player) => player.playerId === playerId);
}
