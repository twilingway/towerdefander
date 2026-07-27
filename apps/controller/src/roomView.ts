import {
  publicRoomViewSchema,
  type DefenseResult,
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
}

interface NetworkEnemyState {
  enemyId: string;
  sectorId: number;
  health: number;
  progress: number;
}

interface NetworkGameState {
  tick: number;
  elapsedMs: number;
  treasury: number;
  pathLength: number;
  repairCost: number;
  result: DefenseResult;
  sectors: ValueCollection<NetworkSectorState>;
  enemies: ValueCollection<NetworkEnemyState>;
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
            sectors: [...state.game.sectors.values()].map((sector) => ({
              sectorId: sector.sectorId,
              assignedPlayerId: sector.assignedPlayerId.length > 0 ? sector.assignedPlayerId : null,
              gateHealth: sector.gateHealth,
              gateMaxHealth: sector.gateMaxHealth,
              defenseLevel: sector.defenseLevel,
              defenseDamage: sector.defenseDamage,
              nextUpgradeCost: sector.nextUpgradeCost >= 0 ? sector.nextUpgradeCost : null
            })),
            enemies: [...state.game.enemies.values()].map((enemy) => ({
              enemyId: enemy.enemyId,
              sectorId: enemy.sectorId,
              health: enemy.health,
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
