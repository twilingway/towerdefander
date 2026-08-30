import { defineServer, matchMaker } from "colyseus";
import type { Request, Response } from "express";
import { ROOM_TYPE } from "@spaceship-defender/protocol";

import { getBalanceStore, registerBalanceRoutes } from "./balance/index.js";
import { getBatchRunner, getBatchStore, registerBalanceStatsRoutes } from "./balanceStats/index.js";
import { readServerConfig } from "./config.js";
import { ROOM_DEFINITIONS } from "./roomRegistry.js";
import { registerRoomStatsRoutes } from "./stats/index.js";

const { host, port, gracefullyShutdown, statsPassword, balancePassword } = readServerConfig();

const balanceStore = getBalanceStore();
await balanceStore.load();

const gameServer = defineServer({
  gracefullyShutdown,
  rooms: ROOM_DEFINITIONS,
  express: (app) => {
    app.get("/health", (_request: Request, response: Response) => {
      response.json({ status: "ok" });
    });
    registerRoomStatsRoutes(app, {
      password: statsPassword,
      queryRooms: () => matchMaker.query({ name: ROOM_TYPE })
    });
    registerBalanceRoutes(app, { password: balancePassword, store: balanceStore });
    registerBalanceStatsRoutes(app, {
      password: balancePassword,
      store: getBatchStore(),
      runner: getBatchRunner()
    });
  }
});

await gameServer.listen(port, host);

console.log(`SpaceShip Defender server listening on http://${host}:${String(port)}`);
