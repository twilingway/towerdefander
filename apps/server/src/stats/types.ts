export const ROOM_STATS_STATUSES = [
  "lobby",
  "combat",
  "intermission",
  "result",
  "display_grace",
  "closing"
] as const;

export type RoomStatsStatus = (typeof ROOM_STATS_STATUSES)[number];

/**
 * Which game a room is running.
 *
 * The dashboard counted one of them and called the number "players online",
 * because only the campaign room published anything: a match of sixteen hulls
 * with a person in one of them was, to this page, not happening at all.
 */
export const ROOM_STATS_MODES = ["campaign", "arena"] as const;
export type RoomStatsMode = (typeof ROOM_STATS_MODES)[number];

export interface RoomStatsMetadata {
  statsId: string;
  mode: RoomStatsMode;
  status: RoomStatsStatus;
  /**
   * Sockets this room holds, which is the only honest count of people.
   *
   * Seats are not: a campaign crew is three seats and up to four connections
   * with the screen, while an arena player is one connection holding both a
   * seat and the screen. Adding seats to displays double-counts one of those
   * and misses the other.
   */
  connections: number;
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
  mode: RoomStatsMode;
  status: RoomStatsStatus;
  connectedPlayers: number;
  reservedPlayers: number;
  capacity: number;
  ageSeconds: number;
  expiresInSeconds: number | null;
}

/** What one game's rooms add up to; the page shows a column of these per mode. */
export interface RoomStatsTotals {
  rooms: number;
  /** People, counted as sockets. See `connections` above. */
  people: number;
  connectedPlayers: number;
  reservedPlayers: number;
  connectedDisplays: number;
  byStatus: Record<RoomStatsStatus, number>;
}

export interface RoomStatsSnapshot {
  generatedAt: string;
  totals: RoomStatsTotals;
  byMode: Record<RoomStatsMode, RoomStatsTotals>;
  rooms: RoomStatsRow[];
}

export type QueryRoomStatsListings = () => Promise<readonly RoomStatsListing[]>;
