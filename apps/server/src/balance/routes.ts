import type { Request, RequestHandler, Response } from "express";

import { balancePresetsFileSchema, type PublicShipCatalogue } from "@spaceship-defender/protocol";

import { isStatsRequestAuthorized } from "../stats/access.js";
import { assertTuningIsPlayable, createDefaultPresetsFile, type BalanceStore } from "./store.js";

export interface BalanceRouteOptions {
  password: string | undefined;
  store: BalanceStore;
}

export interface BalanceRouteRegistrar {
  get(path: string, handler: RequestHandler): unknown;
  put(path: string, ...handlers: RequestHandler[]): unknown;
  post(path: string, ...handlers: RequestHandler[]): unknown;
}

const MAX_BODY_BYTES = 1_048_576;

/**
 * Minimal JSON body reader. Express ships with Colyseus but is not a declared
 * dependency of this app, so the bundle must not import it at runtime.
 */
export function readJsonBody(): RequestHandler {
  return (request: Request, response: Response, next: (error?: unknown) => void): void => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (status: number, message: string): void => {
      if (settled) return;
      settled = true;
      request.destroy();
      applyNoStoreHeaders(response);
      response.status(status).json({ error: message });
    };

    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(413, "Balance document is too large.");
        return;
      }
      chunks.push(chunk);
    });
    request.on("error", () => {
      fail(400, "Balance document could not be read.");
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      if (chunks.length === 0) {
        (request as unknown as { body: unknown }).body = undefined;
        next();
        return;
      }
      try {
        (request as unknown as { body: unknown }).body = JSON.parse(
          Buffer.concat(chunks).toString("utf8")
        );
      } catch {
        applyNoStoreHeaders(response);
        response.status(400).json({ error: "Balance document is not valid JSON." });
        return;
      }
      next();
    });
  };
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

/**
 * The one balance surface that answers without a password: the hulls a display
 * offers before anyone joins a room. It carries names and looks, never stats
 * and never the tree, so nothing about the balance leaks through it.
 *
 * It also carries a permissive origin header, unlike every other route here. A
 * display is a separate origin from the game server in every deployment this
 * repository has, the payload is public by construction, and the alternative --
 * a proxy in front of each display build -- moves a deployment detail into
 * three Vite configs.
 */
export function createShipCatalogueHandler(options: BalanceRouteOptions): RequestHandler {
  return (_request: Request, response: Response): void => {
    const tuning = options.store.getActiveTuning();
    const catalogue: PublicShipCatalogue = {
      ships: Object.entries(tuning.shipArchetypes).map(([id, hull]) => ({
        id,
        label: hull.label,
        description: hull.description,
        visual: hull.visual,
        unlockedAtWave: hull.unlockedAtWave
      })),
      defaultShipId: tuning.defaultShipArchetypeId
    };
    applyNoStoreHeaders(response);
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.json(catalogue);
  };
}

export function registerBalanceRoutes(
  app: BalanceRouteRegistrar,
  options: BalanceRouteOptions
): void {
  app.get("/ships", createShipCatalogueHandler(options));
  app.get("/admin/balance", createBalanceStateHandler(options));
  app.get("/admin/balance/defaults", createBalanceDefaultsHandler(options));
  app.post("/admin/balance/validate", readJsonBody(), createBalanceValidateHandler(options));
  app.put("/admin/balance", readJsonBody(), createBalanceSaveHandler(options));
}
