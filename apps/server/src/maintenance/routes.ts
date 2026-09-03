import type { Request, RequestHandler, Response } from "express";

import { maintenanceCommandSchema } from "@spaceship-defender/protocol";

import { readJsonBody } from "../balance/routes.js";
import { isStatsRequestAuthorized } from "../stats/access.js";
import type { MaintenanceWindow } from "./window.js";

export interface MaintenanceRouteOptions {
  /**
   * Not the balance password. That one is handed to whoever tunes numbers;
   * this one ends other people's runs, so it is its own secret and, when unset,
   * loopback only -- the same rule the rest of the administrative surface uses.
   */
  token: string | undefined;
  window: MaintenanceWindow;
}

export interface MaintenanceRouteRegistrar {
  get(path: string, handler: RequestHandler): unknown;
  put(path: string, ...handlers: RequestHandler[]): unknown;
}

function applyNoStoreHeaders(response: Response): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function authorize(request: Request, response: Response, token: string | undefined): boolean {
  if (isStatsRequestAuthorized(request, token)) return true;
  applyNoStoreHeaders(response);
  response.setHeader("WWW-Authenticate", 'Basic realm="SpaceShip Defender maintenance"');
  response.status(401).type("text/plain").send("Unauthorized");
  return false;
}

export function createMaintenanceStateHandler(options: MaintenanceRouteOptions): RequestHandler {
  return (request: Request, response: Response): void => {
    if (!authorize(request, response, options.token)) return;
    applyNoStoreHeaders(response);
    response.json(options.window.snapshot(Date.now()));
  };
}

export function createMaintenanceCommandHandler(options: MaintenanceRouteOptions): RequestHandler {
  return (request: Request, response: Response): void => {
    if (!authorize(request, response, options.token)) return;
    applyNoStoreHeaders(response);
    const parsed = maintenanceCommandSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid maintenance command" });
      return;
    }
    if (parsed.data.active) {
      options.window.announce(parsed.data.windowSeconds ?? 0, Date.now());
    } else {
      options.window.cancel();
    }
    response.json(options.window.snapshot(Date.now()));
  };
}

export function registerMaintenanceRoutes(
  app: MaintenanceRouteRegistrar,
  options: MaintenanceRouteOptions
): void {
  app.get("/admin/maintenance", createMaintenanceStateHandler(options));
  app.put("/admin/maintenance", readJsonBody(), createMaintenanceCommandHandler(options));
}
