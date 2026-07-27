import {
  controllerRoomViewSchema,
  type ControllerRoomView,
  type DefenseResult,
  type DefenseStage,
  type PublicPlayerView
} from "@town-defenders/protocol";

interface ValueCollection<T> {
  values(): IterableIterator<T>;
}

interface NetworkPlayerState {
  playerId: string;
  playerName: string;
  ready: boolean;
  connected: boolean;
  sectorId: number;
  airstrikeTargetSectorIds: ValueCollection<number>;
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
  sectors: ValueCollection<NetworkSectorState>;
}

export interface NetworkRoomState {
  roomId?: string;
  phase?: ControllerRoomView["phase"];
  displayConnected?: boolean;
  playerCapacity?: number;
  players?: ValueCollection<NetworkPlayerState>;
  hasGame?: boolean;
  game?: NetworkGameState;
}

export function toControllerRoomView(
  state: NetworkRoomState | undefined
): ControllerRoomView | undefined {
  if (
    state === undefined ||
    typeof state.roomId !== "string" ||
    state.phase === undefined ||
    typeof state.displayConnected !== "boolean" ||
    typeof state.playerCapacity !== "number" ||
    state.players === undefined
  ) {
    return undefined;
  }

  const players = [...state.players.values()]
    .map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      ready: player.ready,
      connected: player.connected,
      sectorId: player.sectorId,
      airstrikeTargetSectorIds: [...player.airstrikeTargetSectorIds.values()]
    }))
    .sort((left, right) => left.sectorId - right.sectorId);

  return controllerRoomViewSchema.parse({
    roomId: state.roomId,
    phase: state.phase,
    displayConnected: state.displayConnected,
    playerCapacity: state.playerCapacity,
    players,
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
            }))
          }
        : null
  });
}

export const toPublicRoomView = toControllerRoomView;

export function getRoomFromLocation(search: string): string {
  return new URLSearchParams(search).get("room")?.trim() ?? "";
}

export function findCurrentPlayer(
  view: ControllerRoomView | undefined,
  playerId: string
): PublicPlayerView | undefined {
  return view?.players.find((player) => player.playerId === playerId);
}
