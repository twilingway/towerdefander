import { defineRoom, defineServer, matchMaker } from "colyseus";
import type { Request, Response } from "express";

import { readServerConfig } from "./config.js";
import { TownDefendersRoom } from "./rooms/TownDefendersRoom.js";
import { registerRoomStatsRoutes } from "./stats/index.js";

const { host, port, gracefullyShutdown, statsPassword } = readServerConfig();

const gameServer = defineServer({
  gracefullyShutdown,
  rooms: {
    town_defenders: defineRoom(TownDefendersRoom)
  },
  express: (app) => {
    app.get("/health", (_request: Request, response: Response) => {
      response.json({ status: "ok" });
    });
    registerRoomStatsRoutes(app, {
      password: statsPassword,
      queryRooms: () => matchMaker.query({ name: "town_defenders" })
    });
  }
});

await gameServer.listen(port, host);

console.log(`Town Defenders server listening on http://${host}:${String(port)}`);
