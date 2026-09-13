import { readServerConfig } from "../config.js";
import { ServerRecords } from "./records.js";

let sharedRecords: ServerRecords | undefined;

/**
 * Rooms are built by the matchmaker, so they reach the records through this
 * accessor the way they reach the balance store. Nothing is written until
 * `load()` has run, which the server does once at startup.
 */
export function getServerRecords(): ServerRecords {
  sharedRecords ??= new ServerRecords({ filePath: readServerConfig().statsRecordsPath });
  return sharedRecords;
}

export { isLoopbackAddress, isStatsRequestAuthorized } from "./access.js";
export {
  ROOM_RECORDS_FILE_VERSION,
  ROOM_RECORDS_PAGE_DAYS,
  ServerRecords,
  parseRoomRecordsDocument,
  type RoomRecordsDocument,
  type ServerRecordsOptions
} from "./records.js";
export { ROOM_STATS_HTML } from "./html.js";
export {
  createRoomsHtmlHandler,
  createRoomsJsonHandler,
  registerRoomStatsRoutes,
  type RoomStatsRouteOptions,
  type StatsRouteRegistrar
} from "./routes.js";
export { createRoomStatsSnapshot } from "./snapshot.js";
export {
  ROOM_STATS_STATUSES,
  type QueryRoomStatsListings,
  type RoomStatsListing,
  type RoomStatsMetadata,
  type RoomStatsRow,
  type RoomStatsSnapshot,
  type RoomStatsStatus
} from "./types.js";
