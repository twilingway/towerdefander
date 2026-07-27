import {
  displayRoomViewSchema,
  type DefenseResult,
  type DefenseStage,
  type DisplayRoomView,
  type EnemyType
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

interface NetworkEnemyState {
  enemyId: string;
  sectorId: number;
  enemyType: EnemyType;
  health: number;
  maxHealth: number;
  progress: number;
}

interface NetworkAirstrikeEffectState {
  sequence: number;
  actionId: string;
  playerId: string;
  targetSectorId: number;
  appliedTick: number;
}

interface NetworkDisplayGameState {
  enemies: ValueCollection<NetworkEnemyState>;
  hasLastAirstrikeEffect: boolean;
  lastAirstrikeEffect: NetworkAirstrikeEffectState;
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
  display?: NetworkDisplayGameState;
}

export interface NetworkRoomState {
  roomId?: string;
  phase?: DisplayRoomView["phase"];
  displayConnected?: boolean;
  playerCapacity?: number;
  players?: ValueCollection<NetworkPlayerState>;
  hasGame?: boolean;
  game?: NetworkGameState;
}

export function toDisplayRoomView(
  state: NetworkRoomState | undefined
): DisplayRoomView | undefined {
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

  return displayRoomViewSchema.parse({
    roomId: state.roomId,
    phase: state.phase,
    displayConnected: state.displayConnected,
    playerCapacity: state.playerCapacity,
    players,
    game:
      state.hasGame === true && state.game?.display !== undefined
        ? {
            ...toSharedGameView(state.game),
            lastAirstrikeEffect: state.game.display.hasLastAirstrikeEffect
              ? {
                  sequence: state.game.display.lastAirstrikeEffect.sequence,
                  actionId: state.game.display.lastAirstrikeEffect.actionId,
                  playerId: state.game.display.lastAirstrikeEffect.playerId,
                  targetSectorId: state.game.display.lastAirstrikeEffect.targetSectorId,
                  appliedTick: state.game.display.lastAirstrikeEffect.appliedTick
                }
              : null,
            enemies: [...state.game.display.enemies.values()].map((enemy) => ({
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

export const toPublicRoomView = toDisplayRoomView;

function toSharedGameView(game: NetworkGameState) {
  return {
    tick: game.tick,
    elapsedMs: game.elapsedMs,
    treasury: game.treasury,
    pathLength: game.pathLength,
    repairCost: game.repairCost,
    result: game.result,
    waveNumber: game.waveNumber,
    totalWaves: game.totalWaves,
    stage: game.stage,
    intermissionRemainingSeconds: game.intermissionRemainingSeconds,
    airstrikeCharge: game.airstrikeCharge,
    airstrikeChargeRequired: game.airstrikeChargeRequired,
    airstrikeDamage: game.airstrikeDamage,
    sectors: [...game.sectors.values()].map((sector) => ({
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
  };
}

export function createControllerJoinUrl(controllerUrl: string, roomId: string): string {
  const url = new URL(controllerUrl);
  url.searchParams.set("room", roomId);
  return url.toString();
}
