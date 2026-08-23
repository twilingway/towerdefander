import type { Request, RequestHandler, Response } from "express";

import { isStatsRequestAuthorized } from "./access.js";
import { ROOM_STATS_HTML } from "./html.js";
import { createRoomStatsSnapshot } from "./snapshot.js";
import type { QueryRoomStatsListings } from "./types.js";

export interface RoomStatsRouteOptions {
  password: string | undefined;
  queryRooms: QueryRoomStatsListings;
  now?: () => number;
}

export interface StatsRouteRegistrar {
  get(path: string, handler: RequestHandler): unknown;
}

function applyNoStoreHeaders(response: Response): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function rejectUnauthorized(response: Response): void {
  applyNoStoreHeaders(response);
  response.setHeader("WWW-Authenticate", 'Basic realm="SpaceShip Defender room statistics"');
  response.status(401).type("text/plain").send("Unauthorized");
}

export function createRoomsJsonHandler(options: RoomStatsRouteOptions): RequestHandler {
  return async (request: Request, response: Response): Promise<void> => {
    if (!isStatsRequestAuthorized(request, options.password)) {
      rejectUnauthorized(response);
      return;
    }

    applyNoStoreHeaders(response);
    try {
      const listings = await options.queryRooms();
      response.json(createRoomStatsSnapshot(listings, options.now?.() ?? Date.now()));
    } catch {
      response.status(503).type("text/plain").send("Statistics temporarily unavailable");
    }
  };
}

export function createRoomsHtmlHandler(options: RoomStatsRouteOptions): RequestHandler {
  return (request: Request, response: Response): void => {
    if (!isStatsRequestAuthorized(request, options.password)) {
      rejectUnauthorized(response);
      return;
    }

    applyNoStoreHeaders(response);
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
    );
    response.status(200).type("html").send(ROOM_STATS_HTML);
  };
}

export function registerRoomStatsRoutes(
  app: StatsRouteRegistrar,
  options: RoomStatsRouteOptions
): void {
  app.get("/stats/rooms.json", createRoomsJsonHandler(options));
  app.get("/stats/rooms", createRoomsHtmlHandler(options));
}
