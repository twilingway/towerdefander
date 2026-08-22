import {
  ROOM_STATS_STATUSES,
  type RoomStatsListing,
  type RoomStatsMetadata,
  type RoomStatsSnapshot,
  type RoomStatsStatus
} from "./types.js";

const roomStatsStatusSet = new Set<string>(ROOM_STATS_STATUSES);

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
        status: metadata.status,
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
  const byStatus = createEmptyStatusCounts();
  let connectedPlayers = 0;
  let reservedPlayers = 0;
  let connectedDisplays = 0;

  for (const room of roomData) {
    byStatus[room.status] += 1;
    connectedPlayers += room.connectedPlayers;
    reservedPlayers += room.reservedPlayers;
    connectedDisplays += room.displayConnected ? 1 : 0;
  }
  const rooms = roomData.map((room) => ({
    status: room.status,
    connectedPlayers: room.connectedPlayers,
    reservedPlayers: room.reservedPlayers,
    capacity: room.capacity,
    ageSeconds: room.ageSeconds,
    expiresInSeconds: room.expiresInSeconds
  }));

  return {
    generatedAt: new Date(nowMs).toISOString(),
    totals: {
      rooms: rooms.length,
      connectedPlayers,
      reservedPlayers,
      connectedDisplays,
      byStatus
    },
    rooms
  };
}
