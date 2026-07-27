import {
  publicRoomViewSchema,
  type PublicPlayerView,
  type PublicRoomView
} from "@town-defenders/protocol";

interface PlayerCollection {
  values(): IterableIterator<PublicPlayerView>;
}

export interface NetworkRoomState {
  roomId?: string;
  phase?: PublicRoomView["phase"];
  displayConnected?: boolean;
  players?: PlayerCollection;
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
      signalCount: player.signalCount
    }))
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
