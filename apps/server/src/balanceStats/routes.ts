import { randomUUID } from "node:crypto";

import type { Request, RequestHandler, Response } from "express";

import {
  MAX_BATCH_CELLS,
  MAX_BATCH_RUNS,
  batchRequestSchema,
  countBatchCells,
  countBatchRuns
} from "@spaceship-defender/protocol";

import { isStatsRequestAuthorized } from "../stats/access.js";
import { readJsonBody } from "../balance/routes.js";
import { BatchAlreadyRunningError, BatchHarnessMissingError, type BatchRunner } from "./runner.js";
import type { BatchStore } from "./store.js";

export interface BalanceStatsRouteOptions {
  /** The console's password, not the room dashboard's: same gate as balance. */
  password: string | undefined;
  store: BatchStore;
  runner: BatchRunner;
}

export interface BalanceStatsRouteRegistrar {
  get(path: string, handler: RequestHandler): unknown;
  post(path: string, ...handlers: RequestHandler[]): unknown;
  delete(path: string, handler: RequestHandler): unknown;
}

function applyNoStoreHeaders(response: Response): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function authorize(request: Request, response: Response, password: string | undefined): boolean {
  if (isStatsRequestAuthorized(request, password)) return true;
  applyNoStoreHeaders(response);
  response.setHeader("WWW-Authenticate", 'Basic realm="SpaceShip Defender balance console"');
  response.status(401).type("text/plain").send("Unauthorized");
  return false;
}

function batchIdFrom(request: Request): string {
  const raw = (request.params as Record<string, string | undefined>).batchId ?? "";
  // Ids come from `randomUUID().slice(0, 8)`, so anything else is not one and
  // must never reach a path join.
  return /^[a-z0-9-]{1,64}$/i.test(raw) ? raw : "";
}

export function createBatchListHandler(options: BalanceStatsRouteOptions): RequestHandler {
  return async (request: Request, response: Response): Promise<void> => {
    if (!authorize(request, response, options.password)) return;
    applyNoStoreHeaders(response);
    response.json(await options.store.list());
  };
}

export function createBatchReadHandler(options: BalanceStatsRouteOptions): RequestHandler {
  return async (request: Request, response: Response): Promise<void> => {
    if (!authorize(request, response, options.password)) return;
    applyNoStoreHeaders(response);
    const batchId = batchIdFrom(request);
    const report = batchId === "" ? undefined : await options.store.read(batchId);
    if (report === undefined) {
      response.status(404).json({ error: "No such batch." });
      return;
    }
    response.json(report);
  };
}

export function createBatchDetailHandler(options: BalanceStatsRouteOptions): RequestHandler {
  return async (request: Request, response: Response): Promise<void> => {
    if (!authorize(request, response, options.password)) return;
    applyNoStoreHeaders(response);
    const batchId = batchIdFrom(request);
    const detail = batchId === "" ? undefined : await options.store.readDetail(batchId);
    if (detail === undefined) {
      response.status(404).json({ error: "No run detail for this batch." });
      return;
    }
    response.json(detail);
  };
}

export function createBatchRunningHandler(options: BalanceStatsRouteOptions): RequestHandler {
  return (request: Request, response: Response): void => {
    if (!authorize(request, response, options.password)) return;
    applyNoStoreHeaders(response);
    response.json({ running: options.runner.running() ?? null });
  };
}

export function createBatchStartHandler(options: BalanceStatsRouteOptions): RequestHandler {
  return async (request: Request, response: Response): Promise<void> => {
    if (!authorize(request, response, options.password)) return;
    applyNoStoreHeaders(response);
    const parsed = batchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid batch" });
      return;
    }
    // Both ceilings, because they bind independently: many cheap cells can
    // stay under the run ceiling and still exceed what one report may hold.
    const cells = countBatchCells(parsed.data);
    if (cells > MAX_BATCH_CELLS) {
      response.status(400).json({
        error: `Batch asks for ${String(cells)} cells; the ceiling is ${String(MAX_BATCH_CELLS)}.`
      });
      return;
    }
    const runs = countBatchRuns(parsed.data);
    if (runs > MAX_BATCH_RUNS) {
      response.status(400).json({
        error: `Batch asks for ${String(runs)} runs; the ceiling is ${String(MAX_BATCH_RUNS)}.`
      });
      return;
    }
    try {
      const progress = await options.runner.start(randomUUID().slice(0, 8), parsed.data);
      response.status(202).json({ running: progress });
    } catch (error) {
      if (error instanceof BatchAlreadyRunningError) {
        response.status(409).json({ error: error.message, batchId: error.batchId });
        return;
      }
      if (error instanceof BatchHarnessMissingError) {
        response.status(503).json({ error: error.message });
        return;
      }
      throw error;
    }
  };
}

export function createBatchStopHandler(options: BalanceStatsRouteOptions): RequestHandler {
  return (request: Request, response: Response): void => {
    if (!authorize(request, response, options.password)) return;
    applyNoStoreHeaders(response);
    options.runner.stop();
    response.json({ running: options.runner.running() ?? null });
  };
}

export function registerBalanceStatsRoutes(
  app: BalanceStatsRouteRegistrar,
  options: BalanceStatsRouteOptions
): void {
  // Everything under `/admin` so the console's dev proxy and the balance
  // password both cover it without another rule.
  app.get("/admin/stats/batches", createBatchListHandler(options));
  app.get("/admin/stats/batches/running", createBatchRunningHandler(options));
  app.get("/admin/stats/batches/:batchId", createBatchReadHandler(options));
  app.get("/admin/stats/batches/:batchId/runs", createBatchDetailHandler(options));
  app.post("/admin/stats/batches", readJsonBody(), createBatchStartHandler(options));
  app.delete("/admin/stats/batches/running", createBatchStopHandler(options));
}
