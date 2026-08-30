import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Request, RequestHandler, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  BALANCE_STATS_FILE_VERSION,
  type BatchReport,
  type BatchRequest
} from "@spaceship-defender/protocol";

import {
  createBatchListHandler,
  createBatchReadHandler,
  createBatchStartHandler
} from "./routes.js";
import { BatchAlreadyRunningError, BatchRunner } from "./runner.js";
import { BatchStore } from "./store.js";

function request(
  remoteAddress: string | undefined,
  options: { authorization?: string; body?: unknown; params?: Record<string, string> } = {}
): Request {
  return {
    headers: { authorization: options.authorization },
    socket: { remoteAddress },
    params: options.params ?? {},
    body: options.body
  } as unknown as Request;
}

interface ResponseState {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

function response(): { response: Response; state: ResponseState } {
  const state: ResponseState = { status: 200, headers: {}, body: undefined };
  const fakeResponse = {
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = value;
      return this;
    },
    status(status: number) {
      state.status = status;
      return this;
    },
    type() {
      return this;
    },
    send(body: unknown) {
      state.body = body;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    }
  } as unknown as Response;
  return { response: fakeResponse, state };
}

async function invoke(handler: RequestHandler, input: Request, output: Response): Promise<void> {
  await handler(input, output, vi.fn());
}

async function temporaryDirectory(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "stats-batches-"));
}

const batchRequest: BatchRequest = {
  levels: ["veteran"],
  enemyOffsets: [0],
  crewSizes: [3],
  presetIds: ["default"],
  runsPerCell: 1,
  firstSeed: 1,
  maxWaves: 2,
  startWave: 1,
  intermissionSeconds: null
};

function reportFixture(overrides: Partial<BatchReport> = {}): BatchReport {
  return {
    version: BALANCE_STATS_FILE_VERSION,
    batchId: "aaaa1111",
    status: "complete",
    startedAtMs: 1_000,
    finishedAtMs: 2_000,
    request: batchRequest,
    presets: [{ id: "default", name: "Базовый" }],
    totalCells: 1,
    cells: [],
    ...overrides
  };
}

function runnerFor(store: BatchStore, harnessPath: string): BatchRunner {
  return new BatchRunner({
    store,
    presetPath: join(store.directory, "balance.json"),
    timeoutSeconds: 60,
    harnessPath,
    guardUrl: "file:///missing-guard.mjs"
  });
}

describe("batch store", () => {
  it("reports a batch left running by a dead process as stopped", async () => {
    const directory = await temporaryDirectory();
    const store = new BatchStore({ directory, keep: 10 });
    await store.write(reportFixture({ status: "running", finishedAtMs: null }));

    const listing = await store.list();

    expect(listing.batches).toHaveLength(1);
    expect(listing.batches[0]?.status).toBe("stopped");
  });

  it("drops a report written by another version of the format and counts it", async () => {
    const directory = await temporaryDirectory();
    const store = new BatchStore({ directory, keep: 10 });
    await store.write(reportFixture());
    await writeFile(
      join(directory, "batch-old9999.json"),
      JSON.stringify({ ...reportFixture({ batchId: "old9999" }), version: 999 }),
      "utf8"
    );

    const listing = await store.list();

    expect(listing.batches.map(({ batchId }) => batchId)).toEqual(["aaaa1111"]);
    expect(listing.droppedForVersion).toBe(1);
  });

  it("keeps only the newest reports when it rotates", async () => {
    const directory = await temporaryDirectory();
    const store = new BatchStore({ directory, keep: 2 });
    for (const [index, id] of ["old00001", "mid00002", "new00003"].entries()) {
      await store.write(reportFixture({ batchId: id, startedAtMs: 1_000 + index }));
    }

    const removed = await store.rotate();

    expect(removed).toBe(1);
    const names = await readdir(directory);
    expect(names).not.toContain("batch-old00001.json");
    expect(names).toContain("batch-new00003.json");
  });
});

describe("batch routes", () => {
  it("rejects a non-loopback client when no password is set", async () => {
    const store = new BatchStore({ directory: await temporaryDirectory(), keep: 10 });
    const output = response();

    await invoke(
      createBatchListHandler({
        password: undefined,
        store,
        runner: runnerFor(store, "missing")
      }),
      request("203.0.113.10"),
      output.response
    );

    expect(output.state.status).toBe(401);
    expect(output.state.headers["cache-control"]).toBe("no-store");
  });

  it("answers 404 for a batch id that is not on disk", async () => {
    const store = new BatchStore({ directory: await temporaryDirectory(), keep: 10 });
    const output = response();

    await invoke(
      createBatchReadHandler({ password: undefined, store, runner: runnerFor(store, "missing") }),
      request("127.0.0.1", { params: { batchId: "nothere" } }),
      output.response
    );

    expect(output.state.status).toBe(404);
  });

  it("refuses a path-shaped batch id instead of joining it", async () => {
    const store = new BatchStore({ directory: await temporaryDirectory(), keep: 10 });
    const output = response();

    await invoke(
      createBatchReadHandler({ password: undefined, store, runner: runnerFor(store, "missing") }),
      request("127.0.0.1", { params: { batchId: "../../etc/passwd" } }),
      output.response
    );

    expect(output.state.status).toBe(404);
  });

  it("refuses a batch larger than the ceiling before starting anything", async () => {
    const store = new BatchStore({ directory: await temporaryDirectory(), keep: 10 });
    const output = response();

    await invoke(
      createBatchStartHandler({ password: undefined, store, runner: runnerFor(store, "missing") }),
      request("127.0.0.1", {
        body: {
          ...batchRequest,
          levels: ["rookie", "veteran", "ace"],
          enemyOffsets: [-2, -1, 0, 1, 2],
          crewSizes: [1, 2, 3],
          runsPerCell: 200
        }
      }),
      output.response
    );

    expect(output.state.status).toBe(400);
    expect((output.state.body as { error: string }).error).toContain("ceiling");
  });

  it("refuses a matrix with more cells than one report may hold", async () => {
    const store = new BatchStore({ directory: await temporaryDirectory(), keep: 10 });
    const output = response();

    await invoke(
      createBatchStartHandler({ password: undefined, store, runner: runnerFor(store, "missing") }),
      request("127.0.0.1", {
        body: {
          ...batchRequest,
          levels: ["rookie", "veteran", "ace"],
          enemyOffsets: [-2, -1, 0, 1, 2],
          crewSizes: [1, 2, 3],
          presetIds: ["a", "b", "c"],
          runsPerCell: 1
        }
      }),
      output.response
    );

    // 135 cells at one run each stays far under the run ceiling, so only the
    // cell ceiling can catch it — and it must, before anything is spawned.
    expect(output.state.status).toBe(400);
    expect((output.state.body as { error: string }).error).toContain("cells");
  });

  it("answers 409 while another batch is running", async () => {
    const store = new BatchStore({ directory: await temporaryDirectory(), keep: 10 });
    const busy = runnerFor(store, "missing");
    busy.start = () => Promise.reject(new BatchAlreadyRunningError("already11"));
    const output = response();

    await invoke(
      createBatchStartHandler({ password: undefined, store, runner: busy }),
      request("127.0.0.1", { body: batchRequest }),
      output.response
    );

    expect(output.state.status).toBe(409);
    expect((output.state.body as { batchId: string }).batchId).toBe("already11");
  });

  it("answers 503 when the harness is not deployed beside the server", async () => {
    const store = new BatchStore({ directory: await temporaryDirectory(), keep: 10 });
    const output = response();

    await invoke(
      createBatchStartHandler({
        password: undefined,
        store,
        runner: runnerFor(store, join(store.directory, "no-such-harness.mjs"))
      }),
      request("127.0.0.1", { body: batchRequest }),
      output.response
    );

    expect(output.state.status).toBe(503);
  });

  it("refuses a request that is not a batch at all", async () => {
    const store = new BatchStore({ directory: await temporaryDirectory(), keep: 10 });
    const output = response();

    await invoke(
      createBatchStartHandler({ password: undefined, store, runner: runnerFor(store, "missing") }),
      request("127.0.0.1", { body: { levels: [] } }),
      output.response
    );

    expect(output.state.status).toBe(400);
  });
});
