export const ROOM_STATS_STATUSES = [
  "lobby",
  "combat",
  "intermission",
  "result",
  "display_grace",
  "closing"
] as const;

export type RoomStatsStatus = (typeof ROOM_STATS_STATUSES)[number];

export interface RoomStatsMetadata {
  statsId: string;
  status: RoomStatsStatus;
  connectedPlayers: number;
  reservedPlayers: number;
  capacity: number;
  displayConnected: boolean;
  createdAtMs: number;
  statusChangedAtMs: number;
  expiresAtMs: number | null;
}

export interface RoomStatsListing {
  metadata?: unknown;
}

export interface RoomStatsRow {
  status: RoomStatsStatus;
  connectedPlayers: number;
  reservedPlayers: number;
  capacity: number;
  ageSeconds: number;
  expiresInSeconds: number | null;
}

export interface RoomStatsSnapshot {
  generatedAt: string;
  totals: {
    rooms: number;
    connectedPlayers: number;
    reservedPlayers: number;
    connectedDisplays: number;
    byStatus: Record<RoomStatsStatus, number>;
  };
  rooms: RoomStatsRow[];
}

export type QueryRoomStatsListings = () => Promise<readonly RoomStatsListing[]>;
