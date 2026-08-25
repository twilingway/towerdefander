import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Request, RequestHandler, Response } from "express";
import {
  balancePresetsFileSchema,
  type BalancePresetsFile,
  type BalanceTuning
} from "@spaceship-defender/protocol";
import { getEnemyArchetype } from "@spaceship-defender/game-core";
import { describe, expect, it, vi } from "vitest";

import { Readable } from "node:stream";

import {
  createBalanceSaveHandler,
  createBalanceStateHandler,
  createBalanceValidateHandler,
  readJsonBody
} from "./routes.js";
import {
  BalanceStore,
  createDefaultPresetsFile,
  createDefaultTuning,
  migrateBalanceDocument
} from "./store.js";

function requireArchetype(tuning: BalanceTuning, kind: string) {
  const archetype = tuning.enemyArchetypes[kind];
  if (archetype === undefined) throw new Error(`missing archetype ${kind}`);
  return archetype;
}

function basicAuthorization(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function request(
  remoteAddress: string | undefined,
  options: { authorization?: string; forwardedFor?: string; body?: unknown } = {}
): Request {
  return {
    headers: {
      authorization: options.authorization,
      "x-forwarded-for": options.forwardedFor
    },
    socket: { remoteAddress },
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

async function temporaryPresetPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "balance-store-"));
  return join(directory, "balance.json");
}

function tunedPresetsFile(hp: number): BalancePresetsFile {
  const tuning = createDefaultTuning();
  return {
    version: 4,
    activePresetId: "tuned",
    presets: [
      {
        id: "tuned",
        name: "Tuned",
        tuning: {
          ...tuning,
          enemyArchetypes: {
            ...tuning.enemyArchetypes,
            gunship: { ...requireArchetype(tuning, "gunship"), hp }
          }
        }
      }
    ]
  };
}

describe("balance store", () => {
  it("publishes built-in defaults that satisfy the shared schema", () => {
    expect(balancePresetsFileSchema.safeParse(createDefaultPresetsFile()).success).toBe(true);
  });

  it("falls back to defaults and warns when the file is missing", async () => {
    const warn = vi.fn();
    const store = new BalanceStore({ filePath: await temporaryPresetPath(), logger: { warn } });
    await store.load();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(store.getActiveTuning()).toEqual(createDefaultTuning());
  });

  it("falls back to defaults and warns when the file is not valid JSON", async () => {
    const filePath = await temporaryPresetPath();
    await writeFile(filePath, "{ not json", "utf8");
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(store.getActiveTuning()).toEqual(createDefaultTuning());
  });

  it("falls back to defaults when the document fails the schema", async () => {
    const filePath = await temporaryPresetPath();
    await writeFile(filePath, JSON.stringify({ version: 1, presets: [] }), "utf8");
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(store.getActiveTuning()).toEqual(createDefaultTuning());
  });

  it("falls back to defaults when a preset cannot drive a simulation", async () => {
    const filePath = await temporaryPresetPath();
    const unplayable = tunedPresetsFile(50);
    const tuning = unplayable.presets[0]?.tuning;
    if (tuning === undefined) throw new Error("fixture must contain a preset");
    await writeFile(
      filePath,
      JSON.stringify({
        ...unplayable,
        presets: [
          {
            ...unplayable.presets[0],
            tuning: {
              ...tuning,
              enemyArchetypes: {
                ...tuning.enemyArchetypes,
                gunship: { ...requireArchetype(tuning, "gunship"), radius: 999_999 }
              }
            }
          }
        ]
      }),
      "utf8"
    );
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(store.getActiveTuning()).toEqual(createDefaultTuning());
  });

  it("loads a valid document and applies it to the simulation config", async () => {
    const filePath = await temporaryPresetPath();
    await writeFile(filePath, JSON.stringify(tunedPresetsFile(777)), "utf8");
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();
    expect(warn).not.toHaveBeenCalled();
    expect(getEnemyArchetype(store.getActiveSimulationConfig(), "gunship").hp).toBe(777);
  });

  it("writes the document to disk and swaps the active tuning", async () => {
    const filePath = await temporaryPresetPath();
    const store = new BalanceStore({ filePath, logger: { warn: vi.fn() } });
    await store.save(tunedPresetsFile(321));
    expect(getEnemyArchetype(store.getActiveSimulationConfig(), "gunship").hp).toBe(321);
    const persisted: unknown = JSON.parse(await readFile(filePath, "utf8"));
    expect(balancePresetsFileSchema.parse(persisted).activePresetId).toBe("tuned");
  });

  it("refuses to persist a document that cannot drive a simulation", async () => {
    const filePath = await temporaryPresetPath();
    const store = new BalanceStore({ filePath, logger: { warn: vi.fn() } });
    const broken = tunedPresetsFile(10);
    const tuning = broken.presets[0]?.tuning;
    if (tuning === undefined) throw new Error("fixture must contain a preset");
    await expect(
      store.save({
        ...broken,
        presets: [
          {
            ...broken.presets[0],
            tuning: {
              ...tuning,
              ambientAsteroidIntervalMinTicks: 900,
              ambientAsteroidIntervalMaxTicks: 100
            }
          }
        ]
      } as BalancePresetsFile)
    ).rejects.toThrow();
    expect(store.getActiveTuning()).toEqual(createDefaultTuning());
  });
});

describe("version 1 migration", () => {
  function legacyDocument() {
    const tuning = createDefaultTuning();
    const archetypes = Object.fromEntries(
      Object.entries(tuning.enemyArchetypes).map(([kind, archetype]) => {
        const legacy: Record<string, unknown> = { ...archetype };
        delete legacy.visual;
        delete legacy.label;
        return [kind, legacy];
      })
    );
    return {
      version: 1,
      activePresetId: "operator",
      presets: [
        {
          id: "operator",
          name: "Operator",
          tuning: {
            ...tuning,
            enemyArchetypes: archetypes,
            waveCampaign: {
              ...tuning.waveCampaign,
              waves: [
                {
                  entries: [
                    { kind: "interceptor", count: 2, spawnIntervalTicks: 12, sector: "SE" },
                    { kind: "asteroid", count: 1, spawnIntervalTicks: 8, sector: null }
                  ],
                  hpMultiplier: null,
                  tempoMultiplier: null
                }
              ]
            }
          }
        }
      ]
    };
  }

  it("carries a version 1 file forward instead of dropping the operator balance", async () => {
    const filePath = await temporaryPresetPath();
    await writeFile(filePath, JSON.stringify(legacyDocument()), "utf8");
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();
    expect(warn).not.toHaveBeenCalled();

    const state = store.getState();
    expect(state.version).toBe(4);
    expect(state.activePresetId).toBe("operator");
    const wave = state.presets[0]?.tuning.waveCampaign.waves[0];
    expect(wave?.entries.map(({ kind }) => kind)).toEqual(["interceptor", "asteroid"]);
    expect(wave?.entries.map(({ sectors }) => sectors)).toEqual([["SE"], []]);
    expect(getEnemyArchetype(store.getActiveSimulationConfig(), "interceptor").visual.shape).toBe(
      "dart"
    );
  });

  it("turns a version 2 single weapon into a weapon list", async () => {
    const filePath = await temporaryPresetPath();
    const tuning = createDefaultTuning();
    const archetypes = Object.fromEntries(
      Object.entries(tuning.enemyArchetypes).map(([kind, archetype]) => {
        const legacy: Record<string, unknown> = { ...archetype, weapon: archetype.weapons[0] };
        delete legacy.weapons;
        return [kind, legacy];
      })
    );
    await writeFile(
      filePath,
      JSON.stringify({
        version: 2,
        activePresetId: "operator",
        presets: [
          { id: "operator", name: "Operator", tuning: { ...tuning, enemyArchetypes: archetypes } }
        ]
      }),
      "utf8"
    );
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();
    expect(warn).not.toHaveBeenCalled();
    expect(store.getState().version).toBe(4);
    expect(getEnemyArchetype(store.getActiveSimulationConfig(), "boss").weapons).toHaveLength(1);
  });

  it("leaves a current document untouched", () => {
    const current = tunedPresetsFile(99);
    expect(migrateBalanceDocument(current)).toBe(current);
  });
});

describe("balance routes", () => {
  function storeFor(filePath: string): BalanceStore {
    return new BalanceStore({ filePath, logger: { warn: vi.fn() } });
  }

  it("serves the current state to a loopback client when no password is set", async () => {
    const store = storeFor(await temporaryPresetPath());
    const output = response();
    await invoke(
      createBalanceStateHandler({ password: undefined, store }),
      request("127.0.0.1"),
      output.response
    );
    expect(output.state.status).toBe(200);
    expect(output.state.headers["cache-control"]).toBe("no-store");
    expect(balancePresetsFileSchema.safeParse(output.state.body).success).toBe(true);
  });

  it("rejects a non-loopback client when no password is set", async () => {
    const store = storeFor(await temporaryPresetPath());
    const output = response();
    await invoke(
      createBalanceStateHandler({ password: undefined, store }),
      request("10.0.0.9", { forwardedFor: "127.0.0.1" }),
      output.response
    );
    expect(output.state.status).toBe(401);
    expect(output.state.headers["www-authenticate"]).toContain("Basic");
    expect(output.state.body).toBe("Unauthorized");
  });

  it("accepts the configured password and rejects a wrong one", async () => {
    const store = storeFor(await temporaryPresetPath());
    const accepted = response();
    await invoke(
      createBalanceStateHandler({ password: "secret", store }),
      request("10.0.0.9", { authorization: basicAuthorization("admin", "secret") }),
      accepted.response
    );
    expect(accepted.state.status).toBe(200);

    const rejected = response();
    await invoke(
      createBalanceStateHandler({ password: "secret", store }),
      request("10.0.0.9", { authorization: basicAuthorization("admin", "wrong") }),
      rejected.response
    );
    expect(rejected.state.status).toBe(401);
  });

  it("saves a valid document and leaves an invalid one on disk untouched", async () => {
    const filePath = await temporaryPresetPath();
    const store = storeFor(filePath);
    const saved = response();
    await invoke(
      createBalanceSaveHandler({ password: undefined, store }),
      request("127.0.0.1", { body: tunedPresetsFile(404) }),
      saved.response
    );
    expect(saved.state.status).toBe(200);
    expect(getEnemyArchetype(store.getActiveSimulationConfig(), "gunship").hp).toBe(404);

    const rejected = response();
    await invoke(
      createBalanceSaveHandler({ password: undefined, store }),
      request("127.0.0.1", { body: { version: 1, activePresetId: "x", presets: [] } }),
      rejected.response
    );
    expect(rejected.state.status).toBe(400);
    expect(getEnemyArchetype(store.getActiveSimulationConfig(), "gunship").hp).toBe(404);
    const persisted: unknown = JSON.parse(await readFile(filePath, "utf8"));
    expect(
      balancePresetsFileSchema.parse(persisted).presets[0]?.tuning.enemyArchetypes.gunship?.hp
    ).toBe(404);
  });

  it("validates without touching the stored document", async () => {
    const filePath = await temporaryPresetPath();
    const store = storeFor(filePath);
    const output = response();
    await invoke(
      createBalanceValidateHandler({ password: undefined, store }),
      request("127.0.0.1", { body: tunedPresetsFile(55) }),
      output.response
    );
    expect(output.state.body).toEqual({ valid: true, message: null });
    expect(store.getActiveTuning()).toEqual(createDefaultTuning());
    await expect(readFile(filePath, "utf8")).rejects.toThrow();
  });

  it("reports why an invalid document was refused", async () => {
    const store = storeFor(await temporaryPresetPath());
    const output = response();
    await invoke(
      createBalanceValidateHandler({ password: undefined, store }),
      request("127.0.0.1", { body: { version: 3 } }),
      output.response
    );
    expect(output.state.body).toMatchObject({ valid: false });
  });
});

describe("json body reader", () => {
  async function readBody(payload: string): Promise<{ body: unknown; state: ResponseState }> {
    const state: ResponseState = { status: 200, headers: {}, body: undefined };
    const input = Readable.from(
      payload.length === 0 ? [] : [Buffer.from(payload, "utf8")]
    ) as unknown as Request;
    (input as unknown as { destroy: () => void }).destroy = () => undefined;

    const settled = new Promise<void>((resolve) => {
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
        json(body: unknown) {
          state.body = body;
          resolve();
          return this;
        },
        send(body: unknown) {
          state.body = body;
          resolve();
          return this;
        }
      } as unknown as Response;
      readJsonBody()(input, fakeResponse, () => {
        resolve();
      });
    });

    await settled;
    return { body: (input as unknown as { body: unknown }).body, state };
  }

  it("parses a JSON payload onto the request", async () => {
    const result = await readBody(JSON.stringify({ hello: "world" }));
    expect(result.body).toEqual({ hello: "world" });
  });

  it("answers 400 for a payload that is not JSON", async () => {
    const result = await readBody("{ not json");
    expect(result.state.status).toBe(400);
    expect(result.state.headers["cache-control"]).toBe("no-store");
  });

  it("treats an empty payload as no body", async () => {
    const result = await readBody("");
    expect(result.body).toBeUndefined();
  });
});
