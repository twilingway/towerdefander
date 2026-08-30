import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Request, RequestHandler, Response } from "express";
import {
  BALANCE_FILE_VERSION,
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
  migrateBalanceDocument,
  toSimulationConfig
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
    version: BALANCE_FILE_VERSION,
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
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.at(-1)?.[0]).toContain(".unusable");
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
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.at(-1)?.[0]).toContain(".unusable");
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
    expect(state.version).toBe(BALANCE_FILE_VERSION);
    expect(state.activePresetId).toBe("operator");
    const wave = state.presets[0]?.tuning.waveCampaign.waves[0];
    expect(wave?.entries.map(({ kind }) => kind)).toEqual(["interceptor", "asteroid"]);
    expect(wave?.entries.map(({ sectors }) => sectors)).toEqual([["SE"], []]);
    // The v1 document carried no visual at all, so the built-in default fills in.
    expect(getEnemyArchetype(store.getActiveSimulationConfig(), "interceptor").visual.shape).toBe(
      "ship-spear"
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
    expect(store.getState().version).toBe(BALANCE_FILE_VERSION);
    expect(getEnemyArchetype(store.getActiveSimulationConfig(), "boss").weapons).toHaveLength(1);
  });

  it("gives a version 5 document the default camera frame", async () => {
    const filePath = await temporaryPresetPath();
    const tuning: Record<string, unknown> = { ...createDefaultTuning() };
    delete tuning.cameraViewWidth;
    await writeFile(
      filePath,
      JSON.stringify({
        version: 5,
        activePresetId: "operator",
        presets: [{ id: "operator", name: "Operator", tuning }]
      }),
      "utf8"
    );
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    expect(store.getState().version).toBe(BALANCE_FILE_VERSION);
    expect(store.getState().presets[0]?.tuning.cameraViewWidth).toBe(2200);
    expect(store.getActiveSimulationConfig().cameraViewWidth).toBe(2200);
  });

  it("gives a version 18 document the default arena without touching its waves", async () => {
    const filePath = await temporaryPresetPath();
    const tuning: Record<string, unknown> = { ...createDefaultTuning() };
    delete tuning.arenaRadius;
    // The operator's own campaign: the point of the test is that adding a field
    // does not take this down with it.
    const waves = [
      {
        entries: [
          {
            kind: "gunship",
            count: 3,
            spawnIntervalTicks: 40,
            sectors: ["N"],
            hpMultiplier: null,
            tempoMultiplier: null
          }
        ],
        hpMultiplier: null,
        tempoMultiplier: null
      }
    ];
    tuning.waveCampaign = { ...(tuning.waveCampaign as object), waves };
    await writeFile(
      filePath,
      JSON.stringify({
        version: 18,
        activePresetId: "operator",
        presets: [{ id: "operator", name: "Operator", tuning }]
      }),
      "utf8"
    );
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    expect(store.getState().version).toBe(BALANCE_FILE_VERSION);
    expect(store.getState().presets[0]?.tuning.arenaRadius).toBe(2200);
    expect(store.getState().presets[0]?.tuning.waveCampaign.waves).toHaveLength(1);
    // The world is derived, so the circle stays inscribed by construction.
    const config = store.getActiveSimulationConfig();
    expect(config.arenaRadius).toBe(2200);
    expect(config.worldWidth).toBe(4400);
    expect(config.worldHeight).toBe(4400);
  });

  it("gives a version 19 document the shield timings without touching its waves", async () => {
    const filePath = await temporaryPresetPath();
    const tuning: Record<string, unknown> = { ...createDefaultTuning() };
    delete tuning.shieldEngageTicks;
    delete tuning.shieldMinimumUpTicks;
    delete tuning.shieldCooldownTicks;
    const waves = [
      {
        entries: [
          {
            kind: "gunship",
            count: 2,
            spawnIntervalTicks: 30,
            sectors: ["E"],
            hpMultiplier: null,
            tempoMultiplier: null
          }
        ],
        hpMultiplier: null,
        tempoMultiplier: null
      }
    ];
    tuning.waveCampaign = { ...(tuning.waveCampaign as object), waves };
    await writeFile(
      filePath,
      JSON.stringify({
        version: 19,
        activePresetId: "operator",
        presets: [{ id: "operator", name: "Operator", tuning }]
      }),
      "utf8"
    );
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    expect(store.getState().presets[0]?.tuning.shieldEngageTicks).toBe(20);
    expect(store.getState().presets[0]?.tuning.shieldMinimumUpTicks).toBe(40);
    expect(store.getState().presets[0]?.tuning.shieldCooldownTicks).toBe(20);
    // The point of the test: the operator's campaign survived the new fields.
    expect(store.getState().presets[0]?.tuning.waveCampaign.waves).toHaveLength(1);
  });

  it("gives a version 20 document enemy skill without touching its waves", async () => {
    const filePath = await temporaryPresetPath();
    const tuning: Record<string, unknown> = { ...createDefaultTuning() };
    // A profile saved before a knob existed: the level must gain the missing
    // field, not be carried over whole and fail the strict schema.
    const partialVeteran: Record<string, unknown> = {
      ...createDefaultTuning().enemySkill.profiles.veteran,
      leadFactor: 0.9
    };
    delete partialVeteran.flankSpread;
    tuning.enemySkill = { profiles: { veteran: partialVeteran } };
    tuning.enemyArchetypes = Object.fromEntries(
      Object.entries(createDefaultTuning().enemyArchetypes).map(([kind, archetype]) => {
        const legacy: Record<string, unknown> = { ...archetype };
        delete legacy.combatSkill;
        return [kind, legacy];
      })
    );
    const waves = [
      {
        entries: [
          {
            kind: "gunship",
            count: 2,
            spawnIntervalTicks: 30,
            sectors: ["E"],
            hpMultiplier: null,
            tempoMultiplier: null
          }
        ],
        hpMultiplier: null,
        tempoMultiplier: null
      }
    ];
    tuning.waveCampaign = { ...(tuning.waveCampaign as object), waves };
    await writeFile(
      filePath,
      JSON.stringify({
        version: 20,
        activePresetId: "operator",
        presets: [{ id: "operator", name: "Operator", tuning }]
      }),
      "utf8"
    );
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    const saved = store.getState().presets[0]?.tuning;
    expect(saved?.enemyArchetypes.gunship?.combatSkill).toBe("rookie");
    expect(saved?.enemySkill.offset).toBe(0);
    // Kept what the operator set, gained only what was missing.
    expect(saved?.enemySkill.profiles.veteran.leadFactor).toBe(0.9);
    expect(saved?.enemySkill.profiles.veteran.flankSpread).toBe(0.5);
    expect(saved?.enemySkill.profiles.ace.leadFactor).toBe(1);
    // The point of the test: the operator's campaign survived the new fields.
    expect(saved?.waveCampaign.waves).toHaveLength(1);
  });

  it("gives a version 21 document the reverse gear without touching its waves", async () => {
    const filePath = await temporaryPresetPath();
    const tuning: Record<string, unknown> = { ...createDefaultTuning() };
    delete tuning.spaceshipReverseSpeedFactor;
    const waves = [
      {
        entries: [
          {
            kind: "gunship",
            count: 2,
            spawnIntervalTicks: 30,
            sectors: ["E"],
            hpMultiplier: null,
            tempoMultiplier: null
          }
        ],
        hpMultiplier: null,
        tempoMultiplier: null
      }
    ];
    tuning.waveCampaign = { ...(tuning.waveCampaign as object), waves };
    await writeFile(
      filePath,
      JSON.stringify({
        version: 21,
        activePresetId: "operator",
        presets: [{ id: "operator", name: "Operator", tuning }]
      }),
      "utf8"
    );
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    const saved = store.getState().presets[0]?.tuning;
    expect(saved?.spaceshipReverseSpeedFactor).toBe(0.4);
    // The point of the test: the operator's campaign survived the new field.
    expect(saved?.waveCampaign.waves).toHaveLength(1);
  });

  it("derives the world from an operator's larger arena", async () => {
    const filePath = await temporaryPresetPath();
    const tuning = { ...createDefaultTuning(), arenaRadius: 4400 };
    await writeFile(
      filePath,
      JSON.stringify({
        version: BALANCE_FILE_VERSION,
        activePresetId: "operator",
        presets: [{ id: "operator", name: "Operator", tuning }]
      }),
      "utf8"
    );
    const store = new BalanceStore({ filePath, logger: { warn: vi.fn() } });
    await store.load();

    const config = store.getActiveSimulationConfig();
    expect(config.arenaRadius).toBe(4400);
    expect(config.worldWidth).toBe(8800);
    expect(config.worldHeight).toBe(8800);
  });

  it("gives a version 6 weapon most of its own reach as a firing range", async () => {
    const filePath = await temporaryPresetPath();
    const defaults = createDefaultTuning();
    const archetypes = Object.fromEntries(
      Object.entries(defaults.enemyArchetypes).map(([kind, archetype]) => [
        kind,
        {
          ...archetype,
          weapons: archetype.weapons.map((weapon) => {
            const legacy: Record<string, unknown> = { ...weapon };
            delete legacy.engagementRange;
            return legacy;
          })
        }
      ])
    );
    await writeFile(
      filePath,
      JSON.stringify({
        version: 6,
        activePresetId: "operator",
        presets: [
          {
            id: "operator",
            name: "Operator",
            tuning: { ...defaults, enemyArchetypes: archetypes }
          }
        ]
      }),
      "utf8"
    );
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    expect(store.getState().version).toBe(BALANCE_FILE_VERSION);
    // Gunship bullets reach 440 * 180 * 0.05 = 3960 world units.
    expect(
      getEnemyArchetype(store.getActiveSimulationConfig(), "gunship").weapons[0]
    ).toMatchObject({ engagementRange: 2772 });
  });

  it("turns version 7 silhouettes into catalogue assets and drops their colours", async () => {
    const filePath = await temporaryPresetPath();
    const defaults = createDefaultTuning();
    const legacyShapes = [
      "arrowhead",
      "block",
      "diamond",
      "dart",
      "hexagon",
      "cross",
      "ring",
      "spike"
    ] as const;
    const kinds = Object.keys(defaults.enemyArchetypes);
    const archetypes = Object.fromEntries(
      kinds.map((kind, index) => {
        const archetype = defaults.enemyArchetypes[kind];
        if (archetype === undefined) throw new Error(`missing archetype ${kind}`);
        return [
          kind,
          {
            ...archetype,
            visual: {
              shape: legacyShapes[index % legacyShapes.length],
              color: "#e65f4b",
              outline: "#ffd1b0",
              modelScale: archetype.visual.modelScale,
              showHealthBar: archetype.visual.showHealthBar
            },
            weapons: archetype.weapons.map((weapon) => {
              const legacy: Record<string, unknown> = { ...weapon };
              delete legacy.visual;
              return legacy;
            })
          }
        ];
      })
    );
    const legacyTuning: Record<string, unknown> = {
      ...defaults,
      enemyArchetypes: archetypes
    };
    delete legacyTuning.asteroidVisual;
    const document = {
      version: 7,
      activePresetId: "operator",
      presets: [{ id: "operator", name: "Operator", tuning: legacyTuning }]
    };
    await writeFile(filePath, JSON.stringify(document), "utf8");
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    expect(store.getState().version).toBe(BALANCE_FILE_VERSION);

    const tuning = store.getState().presets[0]?.tuning;
    if (tuning === undefined) throw new Error("Expected the migrated preset.");
    // Every old silhouette lands on the asset the mapping table names.
    expect(kinds.map((kind) => tuning.enemyArchetypes[kind]?.visual.shape)).toEqual([
      "ship-spear",
      "ship-blockfrigate",
      "ship-diamond",
      "ship-arrowhead",
      "ship-hexcorvette"
    ]);
    for (const kind of kinds) {
      const visual = tuning.enemyArchetypes[kind]?.visual;
      expect(visual, kind).not.toHaveProperty("color");
      expect(visual, kind).not.toHaveProperty("outline");
      expect(tuning.enemyArchetypes[kind]?.weapons.map(({ visual: shot }) => shot)).toEqual(
        tuning.enemyArchetypes[kind]?.weapons.map(() => null)
      );
    }
    expect(tuning.asteroidVisual).toBeNull();

    // Running the migration again must not move an already-migrated document.
    const migratedOnce = migrateBalanceDocument(document);
    expect(migrateBalanceDocument(migratedOnce)).toEqual(migratedOnce);
  });

  it("gives a version 8 document the built-in player ship", async () => {
    const filePath = await temporaryPresetPath();
    const defaults = createDefaultTuning();
    // Version 8 kept the whole player ship in code, so none of this was stored.
    const playerShipFields = new Set([
      "spaceshipVisual",
      "spaceshipMaxHp",
      "spaceshipRadius",
      "spaceshipSpeedPerSecond",
      "spaceshipAccelerationPerSecondSquared",
      "spaceshipBrakingPerSecondSquared",
      "headingMaxAngularSpeedPerSecond",
      "headingAngularAccelerationPerSecondSquared",
      "headingAngularBrakingPerSecondSquared",
      "friendlyProjectileDamage",
      "fireCooldownTicks",
      "projectileSpeedPerSecond",
      "projectileRadius",
      "projectileLifetimeMs",
      "turretMaxAngularSpeedPerSecond",
      "turretAngularAccelerationPerSecondSquared",
      "turretAngularBrakingPerSecondSquared",
      "mgDamage",
      "mgFireCooldownTicks",
      "mgProjectileSpeedPerSecond",
      "mgProjectileRadius",
      "mgHeatCapacity",
      "mgHeatPerShot",
      "mgCoolingPerSecond",
      "mgRearmThreshold",
      "shieldCapacity",
      "shieldDrainPerSecond",
      "shieldRechargePerSecond",
      "shieldRadius",
      "shieldArcRadians",
      "shieldMaxAngularSpeedPerSecond",
      "shieldAngularAccelerationPerSecondSquared",
      "shieldAngularBrakingPerSecondSquared"
    ]);
    const legacyTuning = Object.fromEntries(
      Object.entries(defaults).filter(([field]) => !playerShipFields.has(field))
    );
    const document = {
      version: 8,
      activePresetId: "operator",
      presets: [{ id: "operator", name: "Operator", tuning: legacyTuning }]
    };
    await writeFile(filePath, JSON.stringify(document), "utf8");
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    expect(store.getState().version).toBe(BALANCE_FILE_VERSION);

    // The preset keeps playing with exactly the numbers it played with before.
    const config = store.getActiveSimulationConfig();
    expect(config.spaceshipSpeedPerSecond).toBe(defaults.spaceshipSpeedPerSecond);
    expect(config.shieldCapacity).toBe(defaults.shieldCapacity);
    expect(config.mgHeatCapacity).toBe(defaults.mgHeatCapacity);
    expect(config.spaceshipVisual).toBeNull();

    const migratedOnce = migrateBalanceDocument(document);
    expect(migrateBalanceDocument(migratedOnce)).toEqual(migratedOnce);
  });

  it("gives a version 9 document the built-in autopilot levels", async () => {
    const filePath = await temporaryPresetPath();
    const defaults = createDefaultTuning();
    // Version 9 had no autopilot section at all: the demo bot was hardcoded.
    const legacyTuning: Partial<BalanceTuning> = { ...defaults };
    delete legacyTuning.autopilot;
    const document = {
      version: 9,
      activePresetId: "operator",
      presets: [{ id: "operator", name: "Operator", tuning: legacyTuning }]
    };
    await writeFile(filePath, JSON.stringify(document), "utf8");
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    expect(store.getState().version).toBe(BALANCE_FILE_VERSION);
    expect(store.getActiveTuning().autopilot).toEqual(defaults.autopilot);

    // The rest of the preset keeps playing with exactly the numbers it had.
    const config = store.getActiveSimulationConfig();
    expect(config.spaceshipSpeedPerSecond).toBe(defaults.spaceshipSpeedPerSecond);
    expect(config.shieldCapacity).toBe(defaults.shieldCapacity);

    const migratedOnce = migrateBalanceDocument(document);
    expect(migrateBalanceDocument(migratedOnce)).toEqual(migratedOnce);
  });

  it("gives a version 15 document the parallax background defaults", async () => {
    const filePath = await temporaryPresetPath();
    const defaults = createDefaultTuning();
    // Version 15 had no background section at all: the display drew a flat color.
    const legacyTuning: Partial<BalanceTuning> = { ...defaults };
    delete legacyTuning.background;
    const document = {
      version: 15,
      activePresetId: "operator",
      presets: [{ id: "operator", name: "Operator", tuning: legacyTuning }]
    };
    await writeFile(filePath, JSON.stringify(document), "utf8");
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    expect(store.getState().version).toBe(BALANCE_FILE_VERSION);
    expect(store.getActiveTuning().background).toEqual(defaults.background);

    // The rest of the preset keeps playing with exactly the numbers it had.
    const config = store.getActiveSimulationConfig();
    expect(config.cameraViewWidth).toBe(defaults.cameraViewWidth);
    expect(config.spaceshipSpeedPerSecond).toBe(defaults.spaceshipSpeedPerSecond);

    const migratedOnce = migrateBalanceDocument(document);
    expect(migrateBalanceDocument(migratedOnce)).toEqual(migratedOnce);
  });

  it("persists tuned parallax background values to disk", async () => {
    const filePath = await temporaryPresetPath();
    const store = new BalanceStore({ filePath, logger: { warn: vi.fn() } });
    const file = tunedPresetsFile(10);
    const preset = file.presets[0];
    if (preset === undefined) throw new Error("fixture must contain a preset");
    const background = {
      parallaxStrength: 1.6,
      driftSpeed: 2,
      nebulaAlpha: 0.4,
      nebulaPreset: "gold" as const
    };
    await store.save({
      ...file,
      presets: [{ ...preset, tuning: { ...preset.tuning, background } }]
    });

    expect(store.getActiveTuning().background).toEqual(background);
    const persisted = JSON.parse(await readFile(filePath, "utf8")) as BalancePresetsFile;
    expect(persisted.presets[0]?.tuning.background).toEqual(background);
  });

  it("gives a version 10 preset the agility its enemies never had", async () => {
    const filePath = await temporaryPresetPath();
    const defaults = createDefaultTuning();
    // Version 10 turned an enemy hull instantly, so no archetype carries any
    // of the three turn fields. A saved preset has to keep playing regardless.
    const legacyArchetypes = Object.fromEntries(
      Object.entries(defaults.enemyArchetypes).map(([kind, archetype]) => {
        const stripped: Record<string, unknown> = { ...archetype };
        delete stripped.turnRatePerSecond;
        delete stripped.turnAccelerationPerSecondSquared;
        delete stripped.turnBrakingPerSecondSquared;
        return [kind, stripped];
      })
    );
    // Plus one the operator made up, which has no built-in numbers to fall back on.
    legacyArchetypes.homebrew = {
      ...legacyArchetypes.gunship,
      label: "Самодел"
    };
    const document = {
      version: 10,
      activePresetId: "operator",
      presets: [
        {
          id: "operator",
          name: "Operator",
          tuning: { ...defaults, enemyArchetypes: legacyArchetypes }
        }
      ]
    };
    await writeFile(filePath, JSON.stringify(document), "utf8");
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    expect(store.getState().version).toBe(BALANCE_FILE_VERSION);

    // Built-in archetypes get their own agility back, not a shared default.
    const migrated = store.getActiveTuning().enemyArchetypes;
    expect(migrated.boss?.turnRatePerSecond).toBe(
      defaults.enemyArchetypes.boss?.turnRatePerSecond ?? Math.PI / 4
    );
    expect(migrated.interceptor?.turnRatePerSecond).toBeGreaterThan(
      migrated.boss?.turnRatePerSecond ?? 0
    );
    // The operator's own archetype gets a usable one rather than failing to load.
    expect(migrated.homebrew?.turnRatePerSecond).toBeGreaterThan(0);

    const migratedOnce = migrateBalanceDocument(document);
    expect(migrateBalanceDocument(migratedOnce)).toEqual(migratedOnce);
  });

  it("carries the weapon looks into the simulation config", async () => {
    const filePath = await temporaryPresetPath();
    const defaults = createDefaultTuning();
    const document = {
      version: BALANCE_FILE_VERSION,
      activePresetId: "operator",
      presets: [
        {
          id: "operator",
          name: "Operator",
          tuning: {
            ...defaults,
            turretVisual: {
              shape: "weapon-gatling",
              modelScale: 1.4,
              mountX: 0.4,
              mountY: 0,
              pivotX: 0,
              pivotY: -0.3
            },
            projectileVisual: { shape: "missile-torpedo", modelScale: 0.8 },
            mgProjectileVisual: { shape: "missile-needle", modelScale: 0.5 }
          }
        }
      ]
    };
    await writeFile(filePath, JSON.stringify(document), "utf8");
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    const config = store.getActiveSimulationConfig();
    expect(config.turretVisual?.shape).toBe("weapon-gatling");
    expect(config.turretVisual?.pivotY).toBe(-0.3);
    // The mount is a separate offset: it says where on the hull the gun sits.
    expect(config.turretVisual?.mountX).toBe(0.4);
    // The two barrels keep separate looks, which is the point: a burst has to
    // read as two weapons rather than one.
    expect(config.projectileVisual?.shape).toBe("missile-torpedo");
    expect(config.mgProjectileVisual?.shape).toBe("missile-needle");
    expect(config.mgProjectileVisual?.modelScale).toBe(0.5);
  });

  it("gives a preset from before the weapon looks the default of none", async () => {
    const filePath = await temporaryPresetPath();
    const defaults = createDefaultTuning();
    const dated: Record<string, unknown> = { ...defaults };
    delete dated.turretVisual;
    delete dated.projectileVisual;
    delete dated.mgProjectileVisual;
    await writeFile(
      filePath,
      JSON.stringify({
        version: 12,
        activePresetId: "operator",
        presets: [{ id: "operator", name: "Operator", tuning: dated }]
      }),
      "utf8"
    );
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    expect(store.getActiveTuning().turretVisual).toBeNull();
    expect(store.getActiveTuning().projectileVisual).toBeNull();
    expect(store.getActiveTuning().mgProjectileVisual).toBeNull();
  });

  it("gives a gun chosen before the pivot existed no offset at all", async () => {
    const filePath = await temporaryPresetPath();
    const defaults = createDefaultTuning();
    // The pivot lives inside the visual rather than beside it, so the flat
    // field list cannot reach it. This is the exact shape of migration that
    // cost an operator a wave table once already.
    await writeFile(
      filePath,
      JSON.stringify({
        version: 13,
        activePresetId: "operator",
        presets: [
          {
            id: "operator",
            name: "Operator",
            tuning: { ...defaults, turretVisual: { shape: "weapon-gatling", modelScale: 1.4 } }
          }
        ]
      }),
      "utf8"
    );
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    const turret = store.getActiveTuning().turretVisual;
    expect(turret?.shape).toBe("weapon-gatling");
    // The choice survives, and the gun draws where it always drew.
    expect(turret?.modelScale).toBe(1.4);
    expect(turret?.pivotX).toBe(0);
    expect(turret?.pivotY).toBe(0);
    // Same for the mount, which arrived at the same time.
    expect(turret?.mountX).toBe(0);
    expect(turret?.mountY).toBe(0);
  });

  it("keeps a campaign when a preset predates the current helm section", async () => {
    const filePath = await temporaryPresetPath();
    const defaults = createDefaultTuning();
    const tuning: Record<string, unknown> = {
      ...defaults,
      waveCampaign: {
        ...defaults.waveCampaign,
        waves: [
          {
            entries: [
              {
                kind: "gunship",
                count: 2,
                spawnIntervalTicks: 40,
                sectors: [],
                hpMultiplier: null,
                tempoMultiplier: null
              }
            ],
            hpMultiplier: null,
            tempoMultiplier: null
          }
        ]
      }
    };
    // Version 17 carried the retired counter angle, and a leftover key fails the
    // strict schema just as loudly as a missing one.
    const legacyHelm: Record<string, unknown> = { ...defaults.helm, stopCounterRadians: 0.12 };
    delete legacyHelm.stopDampening;
    delete legacyHelm.scheme;
    tuning.helm = legacyHelm;
    await writeFile(
      filePath,
      JSON.stringify({
        version: 17,
        activePresetId: "operator",
        presets: [{ id: "operator", name: "Operator", tuning }]
      }),
      "utf8"
    );
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    expect(store.getActiveTuning().waveCampaign.waves).toHaveLength(1);
    expect(store.getActiveTuning().helm).toEqual(defaults.helm);
    expect(store.getActiveTuning().helm.scheme).toBe("tank");
  });

  it("keeps a campaign when a saved profile predates a new profile knob", async () => {
    const filePath = await temporaryPresetPath();
    const defaults = createDefaultTuning();
    // Exactly how an operator's waves went missing: one knob was added to the
    // profile schema, the whole saved profile was carried over unchanged, it
    // failed the strict schema, and the silent fallback to built-in defaults
    // put an empty campaign in front of the console — which the next save kept.
    const dated: Record<string, unknown> = { ...defaults.autopilot.profiles.ace };
    delete dated.cannonHeatCeiling;
    const waves = [
      {
        entries: [
          {
            kind: "gunship",
            count: 3,
            spawnIntervalTicks: 40,
            sectors: [],
            hpMultiplier: null,
            tempoMultiplier: null
          }
        ],
        hpMultiplier: null,
        tempoMultiplier: null
      }
    ];
    const document = {
      version: 11,
      activePresetId: "operator",
      presets: [
        {
          id: "operator",
          name: "Operator",
          tuning: {
            ...defaults,
            waveCampaign: { ...defaults.waveCampaign, waves },
            autopilot: {
              ...defaults.autopilot,
              profiles: { ...defaults.autopilot.profiles, ace: dated }
            }
          }
        }
      ]
    };
    await writeFile(filePath, JSON.stringify(document), "utf8");
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    // The campaign is the thing that must survive.
    expect(store.getActiveTuning().waveCampaign.waves).toHaveLength(1);
    // And the missing knob is filled rather than fatal.
    expect(store.getActiveTuning().autopilot.profiles.ace.cannonHeatCeiling).toBe(
      defaults.autopilot.profiles.ace.cannonHeatCeiling
    );
    // A hand-tuned value in the same profile is not trampled by the defaults.
    expect(store.getActiveTuning().autopilot.profiles.ace.leadFactor).toBe(
      defaults.autopilot.profiles.ace.leadFactor
    );
  });

  it("keeps a hand-tuned autopilot profile and fills only the missing ones", async () => {
    const filePath = await temporaryPresetPath();
    const defaults = createDefaultTuning();
    const handTuned = { ...defaults.autopilot.profiles.ace, mgConeRadians: 0.05 };
    const document = {
      version: 9,
      activePresetId: "operator",
      presets: [
        {
          id: "operator",
          name: "Operator",
          tuning: { ...defaults, autopilot: { level: "ace", profiles: { ace: handTuned } } }
        }
      ]
    };
    await writeFile(filePath, JSON.stringify(document), "utf8");
    const store = new BalanceStore({ filePath, logger: { warn: vi.fn() } });
    await store.load();

    const { autopilot } = store.getActiveTuning();
    expect(autopilot.level).toBe("ace");
    expect(autopilot.profiles.ace.mgConeRadians).toBe(0.05);
    expect(autopilot.profiles.rookie).toEqual(defaults.autopilot.profiles.rookie);
    expect(autopilot.profiles.veteran).toEqual(defaults.autopilot.profiles.veteran);
  });

  it("keeps the autopilot section out of the simulation config", () => {
    const config = toSimulationConfig(createDefaultTuning());
    expect(config).not.toHaveProperty("autopilot");
  });

  it("carries an edited player ship into the next run", async () => {
    const filePath = await temporaryPresetPath();
    const defaults = createDefaultTuning();
    await writeFile(
      filePath,
      JSON.stringify({
        version: BALANCE_FILE_VERSION,
        activePresetId: "operator",
        presets: [
          {
            id: "operator",
            name: "Operator",
            tuning: {
              ...defaults,
              spaceshipSpeedPerSecond: 410,
              shieldCapacity: 180,
              shieldRadius: 150,
              spaceshipVisual: { shape: "ship-lancer", modelScale: 1.2 }
            }
          }
        ]
      }),
      "utf8"
    );
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).not.toHaveBeenCalled();
    const config = store.getActiveSimulationConfig();
    expect(config.spaceshipSpeedPerSecond).toBe(410);
    expect(config.shieldCapacity).toBe(180);
    expect(config.shieldRadius).toBe(150);
    expect(config.spaceshipVisual).toEqual({ shape: "ship-lancer", modelScale: 1.2 });
  });

  it("refuses a player ship the simulation cannot run", async () => {
    const filePath = await temporaryPresetPath();
    const defaults = createDefaultTuning();
    await writeFile(
      filePath,
      JSON.stringify({
        version: BALANCE_FILE_VERSION,
        activePresetId: "operator",
        presets: [
          {
            id: "operator",
            name: "Operator",
            // The core caps the rearm threshold by the heat capacity.
            tuning: { ...defaults, mgHeatCapacity: 40, mgRearmThreshold: 90 }
          }
        ]
      }),
      "utf8"
    );
    const warn = vi.fn();
    const store = new BalanceStore({ filePath, logger: { warn } });
    await store.load();

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.at(-1)?.[0]).toContain(".unusable");
    // The broken preset never becomes active; built-in defaults stay in place.
    expect(store.getActiveSimulationConfig().mgHeatCapacity).toBe(defaults.mgHeatCapacity);
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
