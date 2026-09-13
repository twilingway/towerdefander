import {
  ROOM_STATS_MODES,
  ROOM_STATS_STATUSES,
  type RoomStatsListing,
  type RoomStatsMetadata,
  type RoomStatsMode,
  type RoomStatsSnapshot,
  type RoomStatsStatus,
  type RoomStatsTotals
} from "./types.js";

const roomStatsStatusSet = new Set<string>(ROOM_STATS_STATUSES);
const roomStatsModeSet = new Set<string>(ROOM_STATS_MODES);

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseRoomStatsMetadata(value: unknown): RoomStatsMetadata | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const metadata = value as Record<string, unknown>;
  if (
    typeof metadata.statsId !== "string" ||
    metadata.statsId.length === 0 ||
    typeof metadata.status !== "string" ||
    !roomStatsStatusSet.has(metadata.status) ||
    !isNonNegativeSafeInteger(metadata.connectedPlayers) ||
    !isNonNegativeSafeInteger(metadata.reservedPlayers) ||
    !isNonNegativeSafeInteger(metadata.capacity) ||
    metadata.connectedPlayers + metadata.reservedPlayers > metadata.capacity ||
    typeof metadata.displayConnected !== "boolean" ||
    !isFiniteTimestamp(metadata.createdAtMs) ||
    !isFiniteTimestamp(metadata.statusChangedAtMs) ||
    (metadata.expiresAtMs !== null && !isFiniteTimestamp(metadata.expiresAtMs))
  ) {
    return undefined;
  }

  return {
    statsId: metadata.statsId,
    /*
     * A room that names no game is a campaign room, because for a long time
     * that was the only kind that published anything at all. Nothing persists
     * this metadata across a restart, so the fallback only ever covers a room
     * running against an older build.
     */
    mode: roomStatsModeSet.has(metadata.mode as string)
      ? (metadata.mode as RoomStatsMode)
      : "campaign",
    // Likewise: an older room reports the seats it filled, which is the closest
    // true statement about people it had to offer.
    connections: isNonNegativeSafeInteger(metadata.connections)
      ? metadata.connections
      : metadata.connectedPlayers,
    status: metadata.status as RoomStatsStatus,
    connectedPlayers: metadata.connectedPlayers,
    reservedPlayers: metadata.reservedPlayers,
    capacity: metadata.capacity,
    displayConnected: metadata.displayConnected,
    createdAtMs: metadata.createdAtMs,
    statusChangedAtMs: metadata.statusChangedAtMs,
    expiresAtMs: metadata.expiresAtMs
  };
}

function createEmptyStatusCounts(): Record<RoomStatsStatus, number> {
  return {
    lobby: 0,
    combat: 0,
    intermission: 0,
    result: 0,
    display_grace: 0,
    closing: 0
  };
}

function createEmptyTotals(): RoomStatsTotals {
  return {
    rooms: 0,
    people: 0,
    connectedPlayers: 0,
    reservedPlayers: 0,
    connectedDisplays: 0,
    byStatus: createEmptyStatusCounts()
  };
}

/** One room folded into a column of totals; every column adds up the same way. */
function addRoom(
  totals: RoomStatsTotals,
  room: {
    status: RoomStatsStatus;
    connections: number;
    connectedPlayers: number;
    reservedPlayers: number;
    displayConnected: boolean;
  }
): void {
  totals.rooms += 1;
  totals.people += room.connections;
  totals.connectedPlayers += room.connectedPlayers;
  totals.reservedPlayers += room.reservedPlayers;
  totals.connectedDisplays += room.displayConnected ? 1 : 0;
  totals.byStatus[room.status] += 1;
}

export function createRoomStatsSnapshot(
  listings: readonly RoomStatsListing[],
  nowMs = Date.now()
): RoomStatsSnapshot {
  const roomData = listings.flatMap((listing) => {
    const metadata = parseRoomStatsMetadata(listing.metadata);
    if (metadata === undefined) {
      return [];
    }

    return [
      {
        mode: metadata.mode,
        status: metadata.status,
        connections: metadata.connections,
        connectedPlayers: metadata.connectedPlayers,
        reservedPlayers: metadata.reservedPlayers,
        capacity: metadata.capacity,
        displayConnected: metadata.displayConnected,
        ageSeconds: Math.max(0, Math.floor((nowMs - metadata.createdAtMs) / 1_000)),
        expiresInSeconds:
          metadata.expiresAtMs === null
            ? null
            : Math.max(0, Math.ceil((metadata.expiresAtMs - nowMs) / 1_000))
      }
    ];
  });

  const totals = createEmptyTotals();
  const byMode: Record<RoomStatsMode, RoomStatsTotals> = {
    campaign: createEmptyTotals(),
    arena: createEmptyTotals()
  };
  for (const room of roomData) {
    addRoom(totals, room);
    addRoom(byMode[room.mode], room);
  }
  const rooms = roomData.map((room) => ({
    mode: room.mode,
    status: room.status,
    connectedPlayers: room.connectedPlayers,
    reservedPlayers: room.reservedPlayers,
    capacity: room.capacity,
    ageSeconds: room.ageSeconds,
    expiresInSeconds: room.expiresInSeconds
  }));

  return { generatedAt: new Date(nowMs).toISOString(), totals, byMode, rooms };
}
