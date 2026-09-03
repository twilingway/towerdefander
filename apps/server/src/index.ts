import { defineServer, matchMaker } from "colyseus";
import type { Request, Response } from "express";
import { PROTOCOL_VERSION, ROOM_TYPE } from "@spaceship-defender/protocol";

import { getBalanceStore, registerBalanceRoutes } from "./balance/index.js";
import { getBatchRunner, getBatchStore, registerBalanceStatsRoutes } from "./balanceStats/index.js";
import { readServerConfig } from "./config.js";
import { getMaintenanceWindow, registerMaintenanceRoutes } from "./maintenance/index.js";
import { ROOM_DEFINITIONS } from "./roomRegistry.js";
import { registerRoomStatsRoutes } from "./stats/index.js";

const { host, port, gracefullyShutdown, statsPassword, balancePassword, deployControlToken } =
  readServerConfig();

const balanceStore = getBalanceStore();
await balanceStore.load();

const gameServer = defineServer({
  gracefullyShutdown,
  rooms: ROOM_DEFINITIONS,
  express: (app) => {
    app.get("/health", (_request: Request, response: Response) => {
      /**
       * Says which build answered, not merely that something did. A release
       * replaces this container while the reverse proxy may still hold the
       * address of the one draining beside it, and for those few seconds a
       * plain "ok" comes back from the old server -- which then refuses the new
       * client's room with a protocol mismatch, and the release blames the
       * code. Answering with the version turns that window into something a
       * release can wait for.
       *
       * The maintenance window rides along because the create screen needs it
       * too: a display that has not opened a room yet has no room state to read
       * it from, and finding out by being refused is finding out too late.
       */
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.json({
        status: "ok",
        protocolVersion: PROTOCOL_VERSION,
        maintenance: getMaintenanceWindow().snapshot(Date.now())
      });
    });
    registerRoomStatsRoutes(app, {
      password: statsPassword,
      queryRooms: () => matchMaker.query({ name: ROOM_TYPE })
    });
    registerBalanceRoutes(app, { password: balancePassword, store: balanceStore });
    registerMaintenanceRoutes(app, {
      token: deployControlToken,
      window: getMaintenanceWindow()
    });
    registerBalanceStatsRoutes(app, {
      password: balancePassword,
      store: getBatchStore(),
      runner: getBatchRunner()
    });
  }
});

await gameServer.listen(port, host);

console.log(`SpaceShip Defender server listening on http://${host}:${String(port)}`);
