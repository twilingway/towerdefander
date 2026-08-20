import {
  CREW_ROLES,
  controllerRoomViewSchema,
  type ControllerRoomView,
  type CrewRole,
  type PublicPlayerView
} from "@town-defenders/protocol";

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

interface NetworkGameState {
  tick: number;
  elapsedMs: number;
  worldWidth: number;
  worldHeight: number;
  castle: {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    radius: number;
  };
  turretAngle: number;
  shield: { angle: number; active: boolean; energy: number; capacity: number };
}

export interface NetworkRoomState {
  roomId?: string;
  phase?: ControllerRoomView["phase"];
  displayConnected?: boolean;
  displayLatencyMs?: number;
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
  const game = state.game;

  return controllerRoomViewSchema.parse({
    roomId: state.roomId,
    phase: state.phase,
    displayConnected: state.displayConnected,
    displayLatencyMs: toPublicLatency(state.displayLatencyMs),
    players,
    game:
      state.hasGame === true && game !== undefined
        ? {
            tick: game.tick,
            elapsedMs: game.elapsedMs,
            worldWidth: game.worldWidth,
            worldHeight: game.worldHeight,
            castle: { ...game.castle },
            turretAngle: game.turretAngle,
            shield: { ...game.shield }
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
