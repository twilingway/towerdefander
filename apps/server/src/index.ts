import { defineRoom, defineServer } from "colyseus";
import type { Request, Response } from "express";

import { readServerConfig } from "./config.js";
import { TownDefendersRoom } from "./rooms/TownDefendersRoom.js";

const { host, port } = readServerConfig();

const gameServer = defineServer({
  gracefullyShutdown: true,
  rooms: {
    town_defenders: defineRoom(TownDefendersRoom)
  },
  express: (app) => {
    app.get("/health", (_request: Request, response: Response) => {
      response.json({ status: "ok" });
    });
  }
});

await gameServer.listen(port, host);

console.log(`Town Defenders server listening on http://${host}:${String(port)}`);
