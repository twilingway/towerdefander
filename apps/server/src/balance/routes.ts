import type { Request, RequestHandler, Response } from "express";

import { balancePresetsFileSchema } from "@spaceship-defender/protocol";

import { isStatsRequestAuthorized } from "../stats/access.js";
import { assertTuningIsPlayable, createDefaultPresetsFile, type BalanceStore } from "./store.js";

export interface BalanceRouteOptions {
  password: string | undefined;
  store: BalanceStore;
}

export interface BalanceRouteRegistrar {
  get(path: string, handler: RequestHandler): unknown;
  put(path: string, handler: RequestHandler): unknown;
  post(path: string, handler: RequestHandler): unknown;
}

function applyNoStoreHeaders(response: Response): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function rejectUnauthorized(response: Response): void {
  applyNoStoreHeaders(response);
  response.setHeader("WWW-Authenticate", 'Basic realm="SpaceShip Defender balance console"');
  response.status(401).type("text/plain").send("Unauthorized");
}

function describeFailure(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return "Balance document is not valid.";
}

function authorize(request: Request, response: Response, password: string | undefined): boolean {
  if (isStatsRequestAuthorized(request, password)) return true;
  rejectUnauthorized(response);
  return false;
}

export function createBalanceStateHandler(options: BalanceRouteOptions): RequestHandler {
  return (request: Request, response: Response): void => {
    if (!authorize(request, response, options.password)) return;
    applyNoStoreHeaders(response);
    response.json(options.store.getState());
  };
}

export function createBalanceDefaultsHandler(options: BalanceRouteOptions): RequestHandler {
  return (request: Request, response: Response): void => {
    if (!authorize(request, response, options.password)) return;
    applyNoStoreHeaders(response);
    response.json(createDefaultPresetsFile());
  };
}

export function createBalanceValidateHandler(options: BalanceRouteOptions): RequestHandler {
  return (request: Request, response: Response): void => {
    if (!authorize(request, response, options.password)) return;
    applyNoStoreHeaders(response);
    const parsed = balancePresetsFileSchema.safeParse(request.body);
    if (!parsed.success) {
      response.json({
        valid: false,
        message: parsed.error.issues[0]?.message ?? "Invalid document"
      });
      return;
    }
    try {
      for (const preset of parsed.data.presets) assertTuningIsPlayable(preset.tuning);
    } catch (error) {
      response.json({ valid: false, message: describeFailure(error) });
      return;
    }
    response.json({ valid: true, message: null });
  };
}

export function createBalanceSaveHandler(options: BalanceRouteOptions): RequestHandler {
  return async (request: Request, response: Response): Promise<void> => {
    if (!authorize(request, response, options.password)) return;
    applyNoStoreHeaders(response);
    const parsed = balancePresetsFileSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid balance document" });
      return;
    }
    try {
      await options.store.save(parsed.data);
    } catch (error) {
      response.status(400).json({ error: describeFailure(error) });
      return;
    }
    response.json(options.store.getState());
  };
}

export function registerBalanceRoutes(
  app: BalanceRouteRegistrar,
  options: BalanceRouteOptions
): void {
  app.get("/admin/balance", createBalanceStateHandler(options));
  app.get("/admin/balance/defaults", createBalanceDefaultsHandler(options));
  app.post("/admin/balance/validate", createBalanceValidateHandler(options));
  app.put("/admin/balance", createBalanceSaveHandler(options));
}
