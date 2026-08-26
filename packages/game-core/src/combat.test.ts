import { describe, expect, it } from "vitest";

import {
  advanceCombat,
  advanceSpaceshipSimulation,
  applyGunnerInput,
  applyShieldInput,
  createCleanSpaceshipRun,
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState,
  createTeamUpgradeOffer,
  createTerminalCombatState,
  createWavePlan,
  dynamicEntityCount,
  failWaveByTimeout,
  getEnemyArchetype,
  getWaveDifficulty,
  relativeSweptCircleTime,
  shortestAngleDelta,
  voteForTeamUpgrade,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState,
  type AsteroidState,
  type CombatEnemyState,
  type EnemyWeaponTuning,
  type HostileProjectileState,
  type HomingMissileState,
  type ProjectileState
} from "./index.js";

/** Wave 1 is one gunship followed by the boss, so the hold-until-clear rule is observable. */
function bossAfterEscortConfig() {
  const base = createSpaceshipSimulationConfig();
  return createSpaceshipSimulationConfig({
    ambientAsteroidIntervalMinTicks: 100_000,
    ambientAsteroidIntervalMaxTicks: 100_000,
    waveCampaign: {
      ...base.waveCampaign,
      waves: [
        {
          entries: [
            {
              kind: "gunship",
              count: 1,
              spawnIntervalTicks: 1,
              sectors: [],
              hpMultiplier: null,
              tempoMultiplier: null
            },
            {
              kind: "boss",
              count: 1,
              spawnIntervalTicks: 1,
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
  });
}

function scriptedCampaignConfig() {
  const base = createSpaceshipSimulationConfig();
  return createSpaceshipSimulationConfig({
    waveCampaign: {
      ...base.waveCampaign,
      waves: [
        {
          entries: [
            {
              kind: "gunship",
              count: 3,
              spawnIntervalTicks: 3,
              sectors: ["N"],
              hpMultiplier: null,
              tempoMultiplier: null
            },
            {
              kind: "asteroid",
              count: 1,
              spawnIntervalTicks: 9,
              sectors: ["SE"],
              hpMultiplier: null,
              tempoMultiplier: null
            }
          ],
          hpMultiplier: 2.5,
          tempoMultiplier: null
        },
        {
          entries: [
            {
              kind: "asteroid",
              count: 2,
              spawnIntervalTicks: 5,
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
  });
}

function firstWeapon(config: SpaceshipSimulationConfig, kind: string): EnemyWeaponTuning {
  const weapon = getEnemyArchetype(config, kind).weapons[0];
  if (weapon === undefined) throw new Error(`archetype ${kind} has no weapon`);
  return weapon;
}

function bulletFromWeapon(weapon: EnemyWeaponTuning): HostileProjectileState {
  return {
    id: "hostile-test",
    spawnSequence: 1,
    previousX: 0,
    previousY: 0,
    x: 0,
    y: 0,
    velocity: { x: 0, y: 0 },
    radius: weapon.projectileRadius,
    spawnedTick: 0,
    damage: weapon.damage,
    shieldHitCost: weapon.shieldHitCost,
    lifetimeTicks: weapon.projectileLifetimeTicks,
    visual: weapon.visual
  };
}

function missileFromWeapon(weapon: EnemyWeaponTuning): HomingMissileState {
  return {
    ...bulletFromWeapon(weapon),
    id: "missile-test",
    heading: 0,
    speedPerSecond: weapon.projectileSpeedPerSecond,
    turnRatePerSecond: weapon.turnRatePerSecond
  };
}

describe("deterministic combat foundation", () => {
  it("requires a non-zero uint32 seed", () => {
    const config = createSpaceshipSimulationConfig();
    expect(() => createSpaceshipSimulationState(config, 0)).toThrow(RangeError);
    expect(() => createSpaceshipSimulationState(config, 0x1_0000_0000)).toThrow(RangeError);
    expect(createSpaceshipSimulationState(config, 123).runSeed).toBe(123);
    expect(() => createSpaceshipSimulationConfig({ fixedStepMs: 40 })).toThrow(RangeError);
    expect(() =>
      createSpaceshipSimulationConfig({
        caps: { ...config.caps, dynamicEntities: config.caps.dynamicEntities + 1 }
      })
    ).toThrow(RangeError);
  });

  it("keeps spawn and offer streams deterministic and independent", () => {
    const config = createSpaceshipSimulationConfig();
    expect(createWavePlan(config, 123, 8)).toEqual(createWavePlan(config, 123, 8));
    expect(createTeamUpgradeOffer(123, 8)).toEqual(createTeamUpgradeOffer(123, 8));
    const offers = createTeamUpgradeOffer(123, 8);
    createWavePlan(config, 123, 8);
    createWavePlan(config, 123, 9);
    expect(createTeamUpgradeOffer(123, 8)).toEqual(offers);
  });

  it("unlocks a kind at its configured wave and scales difficulty monotonically", () => {
    const config = createSpaceshipSimulationConfig();
    expect(getEnemyArchetype(config, "missileCarrier").unlockWave).toBe(3);
    expect(createWavePlan(config, 91, 1).plan.some(({ kind }) => kind === "missileCarrier")).toBe(
      false
    );
    expect(createWavePlan(config, 91, 2).plan.some(({ kind }) => kind === "missileCarrier")).toBe(
      false
    );
    expect(createWavePlan(config, 91, 3).plan.some(({ kind }) => kind === "missileCarrier")).toBe(
      true
    );
    for (let wave = 1; wave < 20; wave += 1) {
      const current = getWaveDifficulty(config, wave);
      const next = getWaveDifficulty(config, wave + 1);
      expect(next.budget).toBeGreaterThanOrEqual(current.budget);
      expect(next.hpMultiplier).toBeGreaterThanOrEqual(current.hpMultiplier);
      expect(next.tempoMultiplier).toBeGreaterThanOrEqual(current.tempoMultiplier);
    }
  });

  it("moves a kind unlock by reconfiguring the archetype", () => {
    const base = createSpaceshipSimulationConfig();
    const config = createSpaceshipSimulationConfig({
      enemyArchetypes: {
        ...base.enemyArchetypes,
        missileCarrier: { ...getEnemyArchetype(base, "missileCarrier"), unlockWave: 6 }
      }
    });
    for (const wave of [3, 4, 5]) {
      expect(
        createWavePlan(config, 91, wave).plan.some(({ kind }) => kind === "missileCarrier")
      ).toBe(false);
    }
    expect(createWavePlan(config, 91, 6).plan.some(({ kind }) => kind === "missileCarrier")).toBe(
      true
    );
  });

  it("builds a scripted wave exactly as configured and keeps it seed independent", () => {
    const config = scriptedCampaignConfig();
    const plan = createWavePlan(config, 91, 1).plan;
    expect(plan.map(({ kind }) => kind)).toEqual(["gunship", "gunship", "gunship", "asteroid"]);
    expect(createWavePlan(config, 4242, 1).plan).toEqual(plan);
    expect(plan.map(({ spawnIntervalTicks }) => spawnIntervalTicks)).toEqual([3, 3, 3, 9]);
    expect(plan.map(({ sectors }) => sectors)).toEqual([["N"], ["N"], ["N"], ["SE"]]);
  });

  it("falls back to the director past the last scripted wave", () => {
    const config = scriptedCampaignConfig();
    const scripted = createWavePlan(config, 91, 2).plan;
    expect(scripted.map(({ kind }) => kind)).toEqual(["asteroid", "asteroid"]);
    const directed = createWavePlan(config, 91, 3);
    expect(directed.plan.length).toBeGreaterThan(0);
    expect(directed.plan.every(({ sectors }) => sectors.length === 0)).toBe(true);
    expect(createWavePlan(config, 91, 3)).toEqual(directed);
  });

  it("honours per-entry spawn intervals when draining a scripted wave", () => {
    const config = scriptedCampaignConfig();
    let state = createSpaceshipSimulationState(config, 12);
    const spawnTicks: number[] = [];
    let previousPending = state.pendingSpawns.length;
    for (let step = 0; step < 12; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
      if (state.pendingSpawns.length < previousPending) {
        spawnTicks.push(state.encounterTick);
        previousPending = state.pendingSpawns.length;
      }
    }
    expect(spawnTicks).toEqual([1, 4, 7, 10]);
  });

  it("keeps scripted spawns inside their configured sector", () => {
    const config = scriptedCampaignConfig();
    let state = createSpaceshipSimulationState(config, 12);
    for (let step = 0; step < 8; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
    }
    const centerX = config.worldWidth / 2;
    const centerY = config.worldHeight / 2;
    expect(state.enemies.length).toBeGreaterThan(0);
    for (const enemy of state.enemies) {
      const bearing = Math.atan2(enemy.y - centerY, enemy.x - centerX);
      expect(Math.abs(shortestAngleDelta(-Math.PI / 2, bearing))).toBeLessThanOrEqual(
        Math.PI / 8 + 1e-9
      );
    }
  });

  it("applies scripted difficulty overrides instead of director growth", () => {
    const config = scriptedCampaignConfig();
    expect(getWaveDifficulty(config, 1).hpMultiplier).toBe(2.5);
    expect(getWaveDifficulty(config, 1).tempoMultiplier).toBe(1);
    expect(getWaveDifficulty(config, 2).hpMultiplier).toBe(
      getWaveDifficulty(createSpaceshipSimulationConfig(), 2).hpMultiplier
    );
  });

  it("spawns a boss only on configured boss waves", () => {
    const config = createSpaceshipSimulationConfig();
    const bossInterval = config.waveCampaign.director.bossWaveInterval;
    expect(bossInterval).toBe(5);
    expect(getEnemyArchetype(config, "boss").unlockWave).toBe(10);
    for (const wave of [1, 5, 9, 11, 12]) {
      expect(createWavePlan(config, 91, wave).plan.some(({ kind }) => kind === "boss")).toBe(false);
    }
    for (const wave of [10, 15, 20]) {
      expect(createWavePlan(config, 91, wave).plan.some(({ kind }) => kind === "boss")).toBe(true);
    }
  });

  it("closes the directed plan with the boss instead of shuffling it in", () => {
    const config = createSpaceshipSimulationConfig();
    for (const seed of [7, 91, 4242, 90_001]) {
      const plan = createWavePlan(config, seed, 10).plan;
      expect(plan.filter(({ kind }) => kind === "boss")).toHaveLength(1);
      expect(plan[plan.length - 1]?.kind).toBe("boss");
    }
  });

  it("holds the boss while wave threats are still alive", () => {
    const config = bossAfterEscortConfig();
    let state = createSpaceshipSimulationState(config, 21);
    for (let step = 0; step < 40; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
    }
    expect(state.enemies.map(({ kind }) => kind)).toEqual(["gunship"]);
    expect(state.pendingSpawns.map(({ kind }) => kind)).toEqual(["boss"]);
    expect(state.encounterPhase).toBe("combat");
  });

  it("releases the boss once the wave is cleared", () => {
    const config = bossAfterEscortConfig();
    let state = createSpaceshipSimulationState(config, 21);
    for (let step = 0; step < 10; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
    }
    expect(state.pendingSpawns.map(({ kind }) => kind)).toEqual(["boss"]);
    state = advanceSpaceshipSimulation({ ...state, enemies: [], asteroids: [] }, config);
    expect(state.enemies.map(({ kind }) => kind)).toEqual(["boss"]);
    expect(state.pendingSpawns).toHaveLength(0);
  });

  it("lets an ambient asteroid coexist with the boss release", () => {
    const config = bossAfterEscortConfig();
    let state = createSpaceshipSimulationState(config, 21);
    for (let step = 0; step < 10; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
    }
    const drifting: AsteroidState = {
      id: "ambient-1",
      spawnSequence: 900,
      origin: "ambient",
      previousX: config.worldWidth / 2 + 900,
      previousY: config.worldHeight / 2,
      x: config.worldWidth / 2 + 900,
      y: config.worldHeight / 2,
      velocity: { x: 0, y: 0 },
      radius: config.asteroidRadius,
      spawnedTick: 0,
      hp: config.asteroidHp,
      maxHp: config.asteroidHp,
      damage: config.asteroidDamage
    };
    const released = advanceSpaceshipSimulation(
      { ...state, enemies: [], asteroids: [drifting] },
      config
    );
    expect(released.enemies.map(({ kind }) => kind)).toEqual(["boss"]);

    const blocked = advanceSpaceshipSimulation(
      { ...state, enemies: [], asteroids: [{ ...drifting, origin: "wave" }] },
      config
    );
    expect(blocked.enemies).toHaveLength(0);
    expect(blocked.pendingSpawns.map(({ kind }) => kind)).toEqual(["boss"]);
  });

  it("keeps the wave in combat while the boss is still queued", () => {
    const config = bossAfterEscortConfig();
    let state = createSpaceshipSimulationState(config, 21);
    for (let step = 0; step < 10; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
    }
    const stillQueued = { ...state, enemies: [], asteroids: [] };
    expect(stillQueued.pendingSpawns.map(({ kind }) => kind)).toEqual(["boss"]);
    expect(advanceSpaceshipSimulation(stillQueued, config).encounterPhase).toBe("combat");
  });

  it("spreads a group across every marked sector and stays inside them", () => {
    const base = createSpaceshipSimulationConfig();
    const config = createSpaceshipSimulationConfig({
      ambientAsteroidIntervalMinTicks: 100_000,
      ambientAsteroidIntervalMaxTicks: 100_000,
      waveCampaign: {
        ...base.waveCampaign,
        waves: [
          {
            entries: [
              {
                kind: "gunship",
                count: 12,
                spawnIntervalTicks: 1,
                sectors: ["N", "S"],
                hpMultiplier: null,
                tempoMultiplier: null
              }
            ],
            hpMultiplier: null,
            tempoMultiplier: null
          }
        ]
      }
    });
    let state = createSpaceshipSimulationState(config, 4242);
    for (let step = 0; step < 24; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
    }
    const centerX = config.worldWidth / 2;
    const centerY = config.worldHeight / 2;
    const half = Math.PI / 8 + 1e-9;
    const seen = new Set<string>();
    expect(state.enemies.length).toBeGreaterThan(4);
    for (const enemy of state.enemies) {
      const bearing = Math.atan2(enemy.y - centerY, enemy.x - centerX);
      const north = Math.abs(shortestAngleDelta(-Math.PI / 2, bearing)) <= half;
      const south = Math.abs(shortestAngleDelta(Math.PI / 2, bearing)) <= half;
      expect(north || south).toBe(true);
      seen.add(north ? "N" : "S");
    }
    expect([...seen].sort()).toEqual(["N", "S"]);
  });

  it("runs a catalogue archetype the game never shipped", () => {
    const base = createSpaceshipSimulationConfig();
    const elite = {
      ...getEnemyArchetype(base, "gunship"),
      hp: 480,
      label: "Элитный ганшип",
      visual: {
        shape: "spike" as const,
        color: "#22c55e",
        outline: "#bbf7d0",
        modelScale: 1,
        showHealthBar: true
      }
    };
    const config = createSpaceshipSimulationConfig({
      enemyArchetypes: { ...base.enemyArchetypes, eliteGunship: elite },
      waveCampaign: {
        ...base.waveCampaign,
        waves: [
          {
            entries: [
              {
                kind: "eliteGunship",
                count: 2,
                spawnIntervalTicks: 1,
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
    });
    let state = createSpaceshipSimulationState(config, 31);
    for (let step = 0; step < 6; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
    }
    expect(state.enemies.map(({ kind }) => kind)).toEqual(["eliteGunship", "eliteGunship"]);
    expect(state.enemies[0]?.maxHp).toBe(480);
  });

  it("refuses a campaign that names an archetype outside the catalogue", () => {
    const base = createSpaceshipSimulationConfig();
    expect(() =>
      createSpaceshipSimulationConfig({
        waveCampaign: {
          ...base.waveCampaign,
          waves: [
            {
              entries: [
                {
                  kind: "dreadnought",
                  count: 1,
                  spawnIntervalTicks: 12,
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
      })
    ).toThrow(RangeError);
  });

  it("refuses an empty catalogue and an archetype that squats the hazard id", () => {
    const base = createSpaceshipSimulationConfig();
    expect(() => createSpaceshipSimulationConfig({ enemyArchetypes: {} })).toThrow(RangeError);
    expect(() =>
      createSpaceshipSimulationConfig({
        enemyArchetypes: {
          ...base.enemyArchetypes,
          asteroid: getEnemyArchetype(base, "gunship")
        }
      })
    ).toThrow(RangeError);
  });

  it("fires every barrel on its own cooldown", () => {
    const base = createSpaceshipSimulationConfig();
    const bullet = firstWeapon(base, "gunship");
    const twinGun = {
      ...getEnemyArchetype(base, "gunship"),
      weapons: [
        { ...bullet, cooldownTicks: 2, damage: 3 },
        { ...bullet, cooldownTicks: 10, damage: 40 }
      ]
    };
    const config = createSpaceshipSimulationConfig({
      enemySpawnIntervalTicks: 100_000,
      enemyArchetypes: { ...base.enemyArchetypes, twinGun }
    });
    const initial = createSpaceshipSimulationState(config, 51);
    const enemy: CombatEnemyState = {
      id: "twin-1",
      spawnSequence: 1,
      kind: "twinGun",
      previousX: initial.spaceship.x + 600,
      previousY: initial.spaceship.y,
      x: initial.spaceship.x + 600,
      y: initial.spaceship.y,
      velocity: { x: 0, y: 0 },
      heading: 0,
      angularVelocity: 0,
      radius: twinGun.radius,
      spawnedTick: 0,
      hp: twinGun.hp,
      maxHp: twinGun.hp,
      weaponCooldownTicks: [0, 0]
    };
    const opened = advanceSpaceshipSimulation(
      { ...initial, pendingSpawns: [], enemies: [enemy] },
      config
    );
    // Both barrels open together, then reload independently.
    expect(opened.hostileProjectiles).toHaveLength(2);
    expect(opened.enemies[0]?.weaponCooldownTicks).toEqual([2, 10]);

    let state = opened;
    for (let step = 0; step < 6; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
    }
    // The fast barrel reloaded several times; the slow one has not fired again.
    const fastShots = state.hostileProjectiles.filter(({ damage }) => damage === 3).length;
    const slowShots = state.hostileProjectiles.filter(({ damage }) => damage === 40).length;
    expect(fastShots).toBeGreaterThan(1);
    expect(slowShots).toBe(1);
    expect(state.enemies[0]?.weaponCooldownTicks[1]).toBeGreaterThan(0);
  });

  it("hands each barrel's own look to the shots it fires", () => {
    const base = createSpaceshipSimulationConfig();
    const bullet = firstWeapon(base, "gunship");
    const missile = firstWeapon(base, "boss");
    const mixedGun = {
      ...getEnemyArchetype(base, "gunship"),
      weapons: [
        { ...bullet, cooldownTicks: 2, visual: { shape: "missile-needle", modelScale: 1.5 } },
        { ...bullet, cooldownTicks: 2, visual: null },
        {
          ...missile,
          cooldownTicks: 2,
          burstCount: 1,
          burstSpreadRadians: 0,
          visual: { shape: "missile-torpedo", modelScale: 2 }
        }
      ]
    };
    const config = createSpaceshipSimulationConfig({
      enemySpawnIntervalTicks: 100_000,
      enemyArchetypes: { ...base.enemyArchetypes, mixedGun }
    });
    const initial = createSpaceshipSimulationState(config, 77);
    const enemy: CombatEnemyState = {
      id: "mixed-1",
      spawnSequence: 1,
      kind: "mixedGun",
      previousX: initial.spaceship.x + 600,
      previousY: initial.spaceship.y,
      x: initial.spaceship.x + 600,
      y: initial.spaceship.y,
      velocity: { x: 0, y: 0 },
      heading: 0,
      angularVelocity: 0,
      radius: mixedGun.radius,
      spawnedTick: 0,
      hp: mixedGun.hp,
      maxHp: mixedGun.hp,
      weaponCooldownTicks: [0, 0, 0]
    };
    const opened = advanceSpaceshipSimulation(
      { ...initial, pendingSpawns: [], enemies: [enemy] },
      config
    );

    // Two bullets from two barrels: the first carries its own look, the second
    // stays empty because that barrel has none.
    expect(opened.hostileProjectiles.map(({ visual }) => visual)).toEqual([
      { shape: "missile-needle", modelScale: 1.5 },
      null
    ]);
    expect(opened.homingMissiles.map(({ visual }) => visual)).toEqual([
      { shape: "missile-torpedo", modelScale: 2 }
    ]);
  });

  it("keeps the run identical when only the looks differ", () => {
    const base = createSpaceshipSimulationConfig();
    const dressed = createSpaceshipSimulationConfig({
      // The player hull is presentation-only too, so it rides along here.
      spaceshipVisual: { shape: "boss-mothership", modelScale: 1.4 },
      enemyArchetypes: Object.fromEntries(
        Object.entries(base.enemyArchetypes).map(([kind, archetype]) => [
          kind,
          {
            ...archetype,
            visual: { ...archetype.visual, shape: "boss-mothership" },
            weapons: archetype.weapons.map((weapon) => ({
              ...weapon,
              visual: { shape: "missile-siege", modelScale: 1 }
            }))
          }
        ])
      )
    });

    let plain = createSpaceshipSimulationState(base, 404);
    let painted = createSpaceshipSimulationState(dressed, 404);
    for (let step = 0; step < 400; step += 1) {
      plain = advanceSpaceshipSimulation(plain, base);
      painted = advanceSpaceshipSimulation(painted, dressed);
    }

    expect(painted.encounterTick).toBe(plain.encounterTick);
    expect(painted.score).toBe(plain.score);
    expect(painted.spaceshipHp).toBe(plain.spaceshipHp);
    expect(painted.enemies.map(({ id, x, y, hp }) => ({ id, x, y, hp }))).toEqual(
      plain.enemies.map(({ id, x, y, hp }) => ({ id, x, y, hp }))
    );
  });

  it("holds fire outside its range and shoots when the target comes inside", () => {
    const base = createSpaceshipSimulationConfig();
    const bullet = firstWeapon(base, "gunship");
    // A sentry that barely moves, so only the distance decides when it fires.
    const sentry = {
      ...getEnemyArchetype(base, "gunship"),
      speedPerSecond: 0.001,
      preferredDistance: 100,
      weapons: [{ ...bullet, cooldownTicks: 30, engagementRange: 500 }]
    };
    const config = createSpaceshipSimulationConfig({
      enemySpawnIntervalTicks: 100_000,
      enemyArchetypes: { ...base.enemyArchetypes, sentry }
    });
    const initial = createSpaceshipSimulationState(config, 77);
    const stand = (offsetX: number): CombatEnemyState => ({
      id: "sentry-1",
      spawnSequence: 1,
      kind: "sentry",
      previousX: initial.spaceship.x + offsetX,
      previousY: initial.spaceship.y,
      x: initial.spaceship.x + offsetX,
      y: initial.spaceship.y,
      velocity: { x: 0, y: 0 },
      heading: 0,
      angularVelocity: 0,
      radius: sentry.radius,
      spawnedTick: 0,
      hp: sentry.hp,
      maxHp: sentry.hp,
      weaponCooldownTicks: [0]
    });

    const held = advanceSpaceshipSimulation(
      { ...initial, pendingSpawns: [], enemies: [stand(900)] },
      config
    );
    // Out of range: no shot, and the barrel keeps its charge instead of reloading.
    expect(held.hostileProjectiles).toHaveLength(0);
    expect(held.enemies[0]?.weaponCooldownTicks).toEqual([0]);

    const opened = advanceSpaceshipSimulation(
      { ...initial, pendingSpawns: [], enemies: [stand(400)] },
      config
    );
    expect(opened.hostileProjectiles).toHaveLength(1);
    expect(opened.enemies[0]?.weaponCooldownTicks).toEqual([30]);
  });

  it("lets one group override the wave curve without touching the others", () => {
    const base = createSpaceshipSimulationConfig();
    const config = createSpaceshipSimulationConfig({
      ambientAsteroidIntervalMinTicks: 100_000,
      ambientAsteroidIntervalMaxTicks: 100_000,
      waveCampaign: {
        ...base.waveCampaign,
        waves: [
          {
            entries: [
              {
                kind: "gunship",
                count: 1,
                spawnIntervalTicks: 1,
                sectors: [],
                hpMultiplier: 4,
                tempoMultiplier: null
              },
              {
                kind: "gunship",
                count: 1,
                spawnIntervalTicks: 1,
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
    });
    let state = createSpaceshipSimulationState(config, 61);
    for (let step = 0; step < 6; step += 1) {
      state = advanceSpaceshipSimulation(state, config);
    }
    const baseHp = getEnemyArchetype(config, "gunship").hp;
    const spawned = state.enemies.map(({ maxHp }) => maxHp).sort((left, right) => left - right);
    expect(spawned).toEqual([baseHp, baseHp * 4]);
  });

  it("refuses an archetype without any weapon", () => {
    const base = createSpaceshipSimulationConfig();
    expect(() =>
      createSpaceshipSimulationConfig({
        enemyArchetypes: {
          ...base.enemyArchetypes,
          gunship: { ...getEnemyArchetype(base, "gunship"), weapons: [] }
        }
      })
    ).toThrow(RangeError);
  });

  it("never picks a boss as ordinary director filler", () => {
    const config = createSpaceshipSimulationConfig({
      waveCampaign: {
        ...createSpaceshipSimulationConfig().waveCampaign,
        director: {
          ...createSpaceshipSimulationConfig().waveCampaign.director,
          bossWaveInterval: null
        }
      }
    });
    for (let wave = 1; wave <= 30; wave += 1) {
      expect(createWavePlan(config, 77, wave).plan.some(({ kind }) => kind === "boss")).toBe(false);
    }
  });

  it("fires a boss burst on one cooldown and respects the missile cap", () => {
    const config = createSpaceshipSimulationConfig({ enemySpawnIntervalTicks: 100_000 });
    const boss = getEnemyArchetype(config, "boss");
    const bossWeapon = firstWeapon(config, "boss");
    const initial = createSpaceshipSimulationState(config, 31);
    const bossEnemy: CombatEnemyState = {
      id: "boss-1",
      spawnSequence: 1,
      kind: "boss",
      previousX: initial.spaceship.x + boss.preferredDistance,
      previousY: initial.spaceship.y,
      x: initial.spaceship.x + boss.preferredDistance,
      y: initial.spaceship.y,
      velocity: { x: 0, y: 0 },
      heading: 0,
      angularVelocity: 0,
      radius: boss.radius,
      spawnedTick: 0,
      hp: boss.hp,
      maxHp: boss.hp,
      weaponCooldownTicks: [0]
    };
    const stepped = advanceSpaceshipSimulation(
      { ...initial, pendingSpawns: [], enemies: [bossEnemy] },
      config
    );
    expect(stepped.homingMissiles).toHaveLength(bossWeapon.burstCount);
    const headings = stepped.homingMissiles.map(({ heading }) => heading);
    expect(new Set(headings).size).toBe(bossWeapon.burstCount);
    expect(stepped.enemies[0]?.weaponCooldownTicks[0]).toBe(bossWeapon.cooldownTicks);

    const nearCap = advanceSpaceshipSimulation(
      {
        ...initial,
        pendingSpawns: [],
        enemies: [bossEnemy],
        homingMissiles: Array.from({ length: config.caps.homingMissiles - 1 }, (_, index) => ({
          ...missileFromWeapon(bossWeapon),
          id: `filler-${String(index)}`,
          spawnSequence: 100 + index,
          previousX: 100,
          previousY: 100,
          x: 100,
          y: 100
        }))
      },
      config
    );
    expect(nearCap.homingMissiles.length).toBeLessThanOrEqual(config.caps.homingMissiles);
    expect(nearCap.enemies[0]?.weaponCooldownTicks[0]).toBe(bossWeapon.cooldownTicks);
  });

  it("produces the same combat snapshot from the same seed and input trace", () => {
    const config = createSpaceshipSimulationConfig();
    const run = () => {
      let state = createSpaceshipSimulationState(config, 999);
      for (let step = 0; step < 80; step += 1) {
        state = applyGunnerInput(state, {
          vector: { x: 1, y: 0 },
          firing: step % 3 === 0,
          receivedTick: state.clock.tick
        });
        state = advanceSpaceshipSimulation(state, config);
      }
      return state;
    };
    expect(run()).toEqual(run());
  });

  it("creates a deterministic clean run without carrying prior run state", () => {
    const config = createSpaceshipSimulationConfig();
    const dirty: SpaceshipSimulationState = {
      ...createSpaceshipSimulationState(config, 100),
      spaceshipHp: 1,
      score: 999,
      waveNumber: 8,
      encounterTick: 77,
      roleModifiers: {
        pilot: { speedMultiplier: 2, accelerationMultiplier: 2, maxHpBonus: 100 },
        gunner: { damageMultiplier: 2, cooldownMultiplier: 0.5, projectileSpeedMultiplier: 2 },
        shield: { capacityBonus: 100, rechargeMultiplier: 2, arcWidthBonus: 1 }
      },
      inputs: {
        pilot: { vector: { x: 1, y: 0 }, mgFiring: false, receivedTick: 5 },
        gunner: { vector: { x: 1, y: 0 }, firing: true, receivedTick: 5 },
        shield: { vector: { x: 1, y: 0 }, active: true, receivedTick: 5 }
      }
    };
    expect(dirty.score).toBe(999);

    const clean = createCleanSpaceshipRun(config, 200);
    expect(clean).toEqual(createCleanSpaceshipRun(config, 200));
    expect(clean.runSeed).toBe(200);
    expect(clean.clock).toEqual({ tick: 0, elapsedMs: 0 });
    expect(clean.spaceshipHp).toBe(config.spaceshipMaxHp);
    expect(clean.spaceshipMaxHp).toBe(config.spaceshipMaxHp);
    expect(clean.encounterPhase).toBe("combat");
    expect(clean.outcome).toBeNull();
    expect(clean.waveNumber).toBe(1);
    expect(clean.encounterTick).toBe(0);
    expect(clean.score).toBe(0);
    expect(clean.credits).toBe(0);
    expect(clean.nextSpawnSequence).toBe(1);
    expect(clean.nextProjectileSequence).toBe(0);
    expect(clean.enemies).toEqual([]);
    expect(clean.asteroids).toEqual([]);
    expect(clean.hostileProjectiles).toEqual([]);
    expect(clean.homingMissiles).toEqual([]);
    expect(clean.projectiles).toEqual([]);
    expect(clean.teamUpgradeOffer).toBeNull();
    expect(clean.teamUpgradeVotes).toEqual({ pilot: null, gunner: null, shield: null });
    expect(clean.teamUpgradeSelection).toBeNull();
    expect(clean.inputs).toEqual({ pilot: null, gunner: null, shield: null });
    expect(clean.roleModifiers).toEqual(createSpaceshipSimulationState(config, 200).roleModifiers);
  });
});

describe("combat motion and collision", () => {
  it("uses a relative sweep so a fast projectile cannot tunnel through a moving target", () => {
    const source = {
      id: "source",
      spawnSequence: 1,
      previousX: 0,
      previousY: 0,
      x: 200,
      y: 0,
      velocity: { x: 4000, y: 0 },
      radius: 2,
      spawnedTick: 0
    };
    const target = {
      id: "target",
      spawnSequence: 2,
      previousX: 100,
      previousY: -20,
      x: 100,
      y: 20,
      velocity: { x: 0, y: 800 },
      radius: 10,
      spawnedTick: 0
    };
    expect(relativeSweptCircleTime(source, target)).not.toBeNull();
  });

  it("limits homing turn across the canonical angle boundary", () => {
    const config = createSpaceshipSimulationConfig({ enemySpawnIntervalTicks: 1000 });
    const weapon = firstWeapon(config, "missileCarrier");
    const initial = createSpaceshipSimulationState(config, 8);
    const heading = Math.PI - 0.02;
    const missile: HomingMissileState = {
      ...missileFromWeapon(weapon),
      id: "missile-test",
      spawnSequence: 1,
      previousX: initial.spaceship.x + 500,
      previousY: initial.spaceship.y + 10,
      x: initial.spaceship.x + 500,
      y: initial.spaceship.y + 10,
      velocity: {
        x: Math.cos(heading) * weapon.projectileSpeedPerSecond,
        y: Math.sin(heading) * weapon.projectileSpeedPerSecond
      },
      spawnedTick: 0,
      heading
    };
    const state: SpaceshipSimulationState = {
      ...initial,
      encounterTick: 1,
      homingMissiles: [missile]
    };
    const advanced = advanceSpaceshipSimulation(state, config);
    const moved = advanced.homingMissiles[0];
    expect(moved).toBeDefined();
    expect(Math.abs(shortestAngleDelta(heading, moved?.heading ?? 0))).toBeLessThanOrEqual(
      weapon.turnRatePerSecond * (config.fixedStepMs / 1000) + 1e-12
    );
  });

  it("collapses an underpowered shield and lets the same bullet damage the spaceship", () => {
    const config = createSpaceshipSimulationConfig({ enemySpawnIntervalTicks: 1000 });
    let state = createSpaceshipSimulationState(config, 7);
    state = applyShieldInput(state, { vector: { x: -1, y: 0 }, active: true, receivedTick: 0 });
    state = {
      ...state,
      shieldAngle: -Math.PI,
      shieldActive: true,
      shieldEnergy: 2,
      pendingSpawns: []
    };
    const bullet: HostileProjectileState = {
      ...bulletFromWeapon(firstWeapon(config, "gunship")),
      previousX: state.spaceship.x - 140,
      previousY: state.spaceship.y,
      x: state.spaceship.x - 140,
      y: state.spaceship.y,
      velocity: { x: 2000, y: 0 }
    };
    const stepped = advanceCombat(
      {
        ...state,
        spaceship: {
          ...state.spaceship,
          previousX: state.spaceship.previousX ?? state.spaceship.x,
          previousY: state.spaceship.previousY ?? state.spaceship.y,
          radius: config.spaceshipRadius
        },
        hostileProjectiles: [bullet]
      },
      config
    );
    expect(stepped.shieldEnergy).toBe(0);
    expect(stepped.shieldActive).toBe(false);
    expect(stepped.spaceshipHp).toBe(config.spaceshipMaxHp - firstWeapon(config, "gunship").damage);
  });

  it("rewards missile and wave asteroid shield interceptions exactly once", () => {
    const config = createSpaceshipSimulationConfig({ enemySpawnIntervalTicks: 1000 });
    const initial = createSpaceshipSimulationState(config, 70);
    const x = initial.spaceship.x + config.shieldRadius;
    const y = initial.spaceship.y;
    const missile: HomingMissileState = {
      ...missileFromWeapon(firstWeapon(config, "missileCarrier")),
      id: "shield-missile",
      previousX: x,
      previousY: y,
      x,
      y,
      heading: Math.PI
    };
    const asteroid: AsteroidState = {
      id: "shield-asteroid",
      spawnSequence: 2,
      origin: "wave",
      previousX: x,
      previousY: y,
      x,
      y,
      velocity: { x: 0, y: 0 },
      radius: config.asteroidRadius,
      spawnedTick: 0,
      hp: config.asteroidHp,
      maxHp: config.asteroidHp,
      damage: config.asteroidDamage
    };
    const result = advanceCombat(
      {
        ...initial,
        pendingSpawns: [],
        shieldAngle: 0,
        shieldActive: true,
        shieldEnergy: 100,
        homingMissiles: [missile],
        asteroids: [asteroid],
        spaceship: {
          ...initial.spaceship,
          previousX: initial.spaceship.previousX ?? initial.spaceship.x,
          previousY: initial.spaceship.previousY ?? initial.spaceship.y,
          radius: config.spaceshipRadius
        }
      },
      config
    );
    expect(result.score).toBe(15);
    expect(result.credits).toBe(1);
    expect(result.homingMissiles).toEqual([]);
    expect(result.asteroids).toEqual([]);
  });

  it("does not double reward an asteroid hit by projectile and shield in one step", () => {
    const config = createSpaceshipSimulationConfig({ enemySpawnIntervalTicks: 1000 });
    const initial = createSpaceshipSimulationState(config, 71);
    const x = initial.spaceship.x + config.shieldRadius;
    const y = initial.spaceship.y;
    const asteroid: AsteroidState = {
      id: "contested-asteroid",
      spawnSequence: 2,
      origin: "wave",
      previousX: x,
      previousY: y,
      x,
      y,
      velocity: { x: 0, y: 0 },
      radius: config.asteroidRadius,
      spawnedTick: 0,
      hp: config.friendlyProjectileDamage,
      maxHp: config.friendlyProjectileDamage,
      damage: config.asteroidDamage
    };
    const projectile: ProjectileState = {
      id: "contested-projectile",
      projectileId: "contested-projectile",
      spawnSequence: 1,
      previousX: x,
      previousY: y,
      x,
      y,
      velocity: { x: 0, y: 0 },
      radius: config.projectileRadius,
      spawnedTick: 0,
      damage: config.friendlyProjectileDamage,
      source: "cannon"
    };
    const result = advanceCombat(
      {
        ...initial,
        pendingSpawns: [],
        shieldAngle: 0,
        shieldActive: true,
        shieldEnergy: 100,
        asteroids: [asteroid],
        projectiles: [projectile],
        spaceship: {
          ...initial.spaceship,
          previousX: initial.spaceship.previousX ?? initial.spaceship.x,
          previousY: initial.spaceship.previousY ?? initial.spaceship.y,
          radius: config.spaceshipRadius
        }
      },
      config
    );
    expect(result.score).toBe(10);
    expect(result.credits).toBe(1);
  });

  it("normalizes terminal outcomes and freezes the exact final state", () => {
    const config = createSpaceshipSimulationConfig();
    const initial = createSpaceshipSimulationState(config, 72);
    const defeat = createTerminalCombatState({ ...initial, spaceshipHp: 0 }, "defeat");
    expect(defeat).toMatchObject({
      encounterPhase: "result",
      outcome: "defeat",
      defeatReason: "spaceship_destroyed",
      spaceshipHp: 0
    });
    expect(advanceSpaceshipSimulation(defeat, config)).toBe(defeat);

    const victory = createTerminalCombatState(initial, "victory");
    expect(victory).toMatchObject({
      encounterPhase: "result",
      outcome: "victory",
      spaceshipHp: config.spaceshipMaxHp
    });
    expect(advanceSpaceshipSimulation(victory, config)).toBe(victory);
    expect(() => createTerminalCombatState(initial, "defeat")).toThrow(RangeError);
    expect(() => createTerminalCombatState({ ...initial, spaceshipHp: 0 }, "victory")).toThrow(
      RangeError
    );

    const populated = {
      ...advanceSpaceshipSimulation(initial, config),
      score: 321
    };
    const timeout = failWaveByTimeout(populated);
    expect(timeout).toMatchObject({
      encounterPhase: "result",
      outcome: "defeat",
      defeatReason: "wave_timeout",
      spaceshipHp: config.spaceshipMaxHp,
      score: 321
    });
    expect(timeout.enemies).toBe(populated.enemies);
    expect(timeout.asteroids).toBe(populated.asteroids);
    expect(timeout.hostileProjectiles).toBe(populated.hostileProjectiles);
    expect(timeout.pendingSpawns).toBe(populated.pendingSpawns);
    expect(advanceSpaceshipSimulation(timeout, config)).toBe(timeout);
    expect(() => failWaveByTimeout(timeout)).toThrow(RangeError);
  });

  it("suppresses capped friendly fire while consuming the ordinary cooldown", () => {
    const baseConfig = createSpaceshipSimulationConfig();
    const config = createSpaceshipSimulationConfig({
      caps: { ...baseConfig.caps, friendlyProjectiles: 1, dynamicEntities: 165 }
    });
    let state = createSpaceshipSimulationState(config, 53);
    for (let step = 0; step < 7; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: 1, y: 0 },
        firing: true,
        receivedTick: state.clock.tick
      });
      state = advanceSpaceshipSimulation(state, config);
    }
    expect(state.projectiles).toHaveLength(1);
    expect(state.lastFiredTick).toBe(6);
  });

  it("shares one total-cap slot across multiple ready attacks and a pending spawn", () => {
    const config = createSpaceshipSimulationConfig();
    const initial = createSpaceshipSimulationState(config, 601);
    const enemies: CombatEnemyState[] = Array.from({ length: 40 }, (_, index) => ({
      id: `gunship-cap-${String(index)}`,
      spawnSequence: index + 1,
      kind: "gunship",
      // Inside gunship engagement range, so the ready ones actually shoot.
      previousX: 3000,
      previousY: 2200 + index * 4,
      x: 3000,
      y: 2200 + index * 4,
      velocity: { x: 0, y: 0 },
      radius: getEnemyArchetype(config, "gunship").radius,
      spawnedTick: 0,
      heading: 0,
      angularVelocity: 0,
      hp: getEnemyArchetype(config, "gunship").hp,
      maxHp: getEnemyArchetype(config, "gunship").hp,
      weaponCooldownTicks: [index < 3 ? 0 : 20]
    }));
    const asteroids: AsteroidState[] = Array.from({ length: 16 }, (_, index) => ({
      id: `asteroid-cap-${String(index)}`,
      spawnSequence: 41 + index,
      origin: "wave",
      previousX: 4300,
      previousY: 2500 + index * 4,
      x: 4300,
      y: 2500 + index * 4,
      velocity: { x: 0, y: 0 },
      radius: config.asteroidRadius,
      spawnedTick: 0,
      hp: config.asteroidHp,
      maxHp: config.asteroidHp,
      damage: config.asteroidDamage
    }));
    const hostileProjectiles: HostileProjectileState[] = Array.from({ length: 95 }, (_, index) => ({
      ...bulletFromWeapon(firstWeapon(config, "gunship")),
      id: `hostile-cap-${String(index)}`,
      spawnSequence: 57 + index,
      previousX: 300,
      previousY: 2700,
      x: 300,
      y: 2700
    }));
    const homingMissiles: HomingMissileState[] = Array.from({ length: 12 }, (_, index) => ({
      ...missileFromWeapon(firstWeapon(config, "missileCarrier")),
      id: `missile-cap-${String(index)}`,
      spawnSequence: 152 + index,
      previousX: 4200,
      previousY: 2900,
      x: 4200,
      y: 2900
    }));
    const projectiles: ProjectileState[] = Array.from({ length: 32 }, (_, index) => ({
      id: `projectile-cap-${String(index)}`,
      projectileId: `projectile-cap-${String(index)}`,
      spawnSequence: 164 + index,
      previousX: 200,
      previousY: 200,
      x: 200,
      y: 200,
      velocity: { x: 0, y: 0 },
      radius: config.projectileRadius,
      damage: config.friendlyProjectileDamage,
      source: "cannon",
      spawnedTick: 0
    }));
    const state: SpaceshipSimulationState = {
      ...initial,
      enemies,
      asteroids,
      hostileProjectiles,
      homingMissiles,
      projectiles,
      nextSpawnSequence: 196
    };
    expect(dynamicEntityCount(state)).toBe(195);

    const advanced = advanceCombat(
      {
        ...state,
        spaceship: {
          ...state.spaceship,
          previousX: state.spaceship.previousX ?? state.spaceship.x,
          previousY: state.spaceship.previousY ?? state.spaceship.y,
          radius: config.spaceshipRadius
        }
      },
      config
    );

    expect(dynamicEntityCount(advanced)).toBeLessThanOrEqual(config.caps.dynamicEntities);
    expect(advanced.hostileProjectiles).toHaveLength(96);
    expect(advanced.nextSpawnSequence).toBe(197);
    expect(advanced.pendingSpawns).toHaveLength(initial.pendingSpawns.length);
    expect(
      advanced.enemies
        .slice(0, 3)
        .every(({ weaponCooldownTicks }) => (weaponCooldownTicks[0] ?? 0) > 0)
    ).toBe(true);
  });
});

describe("team upgrades", () => {
  it("accepts a newer role vote and rejects a stale revision", () => {
    const config = createSpaceshipSimulationConfig();
    const initial = createSpaceshipSimulationState(config, 42);
    const generated = createTeamUpgradeOffer(initial.runSeed, 1);
    const intermission: SpaceshipSimulationState = {
      ...initial,
      encounterPhase: "intermission",
      teamUpgradeOffer: generated.offer
    };
    const offer = generated.offer;
    const firstCard = offer.cards[0];
    if (firstCard === undefined) throw new Error("expected offer card");
    const first = voteForTeamUpgrade(intermission, {
      role: "gunner",
      waveNumber: 1,
      offerId: offer.offerId,
      upgradeId: firstCard.upgradeId,
      revision: 1
    });
    expect(first.status).toBe("accepted");
    expect(first.state.teamUpgradeVotes.gunner).toEqual({
      upgradeId: firstCard.upgradeId,
      role: "gunner",
      revision: 1
    });
    const second = voteForTeamUpgrade(first.state, {
      role: "gunner",
      waveNumber: 1,
      offerId: offer.offerId,
      upgradeId: offer.cards[1]?.upgradeId ?? firstCard.upgradeId,
      revision: 1
    });
    expect(second.status).toBe("stale_action");
    expect(second.state).toBe(first.state);
  });

  it("resolves majority atomically at the 600-tick deadline", () => {
    const config = createSpaceshipSimulationConfig();
    const initial = createSpaceshipSimulationState(config, 24);
    const generated = createTeamUpgradeOffer(initial.runSeed, 1);
    const gunnerCard = generated.offer.cards[1];
    if (gunnerCard === undefined) throw new Error("expected gunner card");
    const beforeDeadline: SpaceshipSimulationState = {
      ...initial,
      encounterPhase: "intermission",
      encounterTick: 599,
      credits: 7,
      teamUpgradeOffer: generated.offer,
      teamUpgradeVotes: {
        pilot: { role: "pilot", upgradeId: gunnerCard.upgradeId, revision: 1 },
        gunner: { role: "gunner", upgradeId: gunnerCard.upgradeId, revision: 1 },
        shield: null
      }
    };
    const nextWave = advanceSpaceshipSimulation(beforeDeadline, config);
    expect(nextWave.encounterPhase).toBe("combat");
    expect(nextWave.waveNumber).toBe(2);
    expect(nextWave.encounterTick).toBe(0);
    expect(nextWave.teamUpgradeOffer).toBeNull();
    expect(nextWave.teamUpgradeSelection).toMatchObject({
      role: "gunner",
      upgradeId: gunnerCard.upgradeId,
      price: 5
    });
    expect(nextWave.credits).toBe(2);
    expect(nextWave.roleModifiers).not.toEqual(initial.roleModifiers);
    expect(nextWave.inputs).toEqual(initial.inputs);
  });

  it("uses stable card order for ties and skips no-vote or unaffordable purchases", () => {
    const config = createSpaceshipSimulationConfig();
    const initial = createSpaceshipSimulationState(config, 31);
    const offer = createTeamUpgradeOffer(initial.runSeed, 1).offer;
    const [pilot, gunner, shield] = offer.cards;
    if (pilot === undefined || gunner === undefined || shield === undefined)
      throw new Error("cards");
    const tied = advanceSpaceshipSimulation(
      {
        ...initial,
        encounterPhase: "intermission",
        encounterTick: 599,
        credits: 5,
        teamUpgradeOffer: offer,
        teamUpgradeVotes: {
          pilot: { role: "pilot", upgradeId: pilot.upgradeId, revision: 1 },
          gunner: { role: "gunner", upgradeId: gunner.upgradeId, revision: 1 },
          shield: { role: "shield", upgradeId: shield.upgradeId, revision: 1 }
        }
      },
      config
    );
    expect(tied.teamUpgradeSelection?.upgradeId).toBe(pilot.upgradeId);
    expect(tied.credits).toBe(0);

    for (const credits of [4, 5]) {
      const votes =
        credits === 4
          ? {
              pilot: { role: "pilot" as const, upgradeId: pilot.upgradeId, revision: 1 },
              gunner: null,
              shield: null
            }
          : { pilot: null, gunner: null, shield: null };
      const skipped = advanceSpaceshipSimulation(
        {
          ...initial,
          encounterPhase: "intermission",
          encounterTick: 599,
          credits,
          teamUpgradeOffer: offer,
          teamUpgradeVotes: votes
        },
        config
      );
      expect(skipped.credits).toBe(credits);
      expect(skipped.teamUpgradeSelection).toBeNull();
      expect(skipped.roleModifiers).toEqual(initial.roleModifiers);
    }
  });
});

describe("enemy turn inertia", () => {
  function enemyFacing(
    config: SpaceshipSimulationConfig,
    kind: string,
    heading: number,
    offsetX: number
  ): CombatEnemyState {
    const centre = config.worldWidth / 2;
    return {
      id: `${kind}-turn`,
      spawnSequence: 1,
      kind,
      previousX: centre + offsetX,
      previousY: centre,
      x: centre + offsetX,
      y: centre,
      velocity: { x: 0, y: 0 },
      heading,
      angularVelocity: 0,
      radius: getEnemyArchetype(config, kind).radius,
      spawnedTick: 0,
      hp: getEnemyArchetype(config, kind).hp,
      maxHp: getEnemyArchetype(config, kind).hp,
      weaponCooldownTicks: [1_000_000]
    };
  }

  function stepEnemy(
    config: SpaceshipSimulationConfig,
    state: SpaceshipSimulationState,
    enemy: CombatEnemyState,
    ticks: number
  ): CombatEnemyState[] {
    const trail: CombatEnemyState[] = [];
    // Spawns are drained so the lone enemy under test stays the only one.
    let current: SpaceshipSimulationState = { ...state, pendingSpawns: [], enemies: [enemy] };
    for (let index = 0; index < ticks; index += 1) {
      current = { ...advanceSpaceshipSimulation(current, config), pendingSpawns: [] };
      const stepped = current.enemies[0];
      if (stepped === undefined) break;
      trail.push(stepped);
    }
    return trail;
  }

  it("never turns an enemy faster than its archetype allows", () => {
    const config = createSpaceshipSimulationConfig({ enemySpawnIntervalTicks: 1_000_000 });
    const state = createSpaceshipSimulationState(config, 91);
    // Facing hard away from the ship it wants to close on, so the whole
    // half-turn has to be walked out tick by tick.
    const enemy = enemyFacing(config, "gunship", 0, 1800);
    const cap =
      getEnemyArchetype(config, "gunship").turnRatePerSecond * (config.fixedStepMs / 1000);

    const trail = stepEnemy(config, state, enemy, 24);
    let previous = enemy.heading;
    for (const stepped of trail) {
      expect(Math.abs(shortestAngleDelta(previous, stepped.heading))).toBeLessThanOrEqual(
        cap + 1e-9
      );
      previous = stepped.heading;
    }
    // It still gets there: the point is the path, not a refusal to turn.
    expect(Math.abs(shortestAngleDelta(previous, 0))).toBeGreaterThan(1);
  });

  it("turns a heavier archetype in strictly more ticks than a nimble one", () => {
    const config = createSpaceshipSimulationConfig({ enemySpawnIntervalTicks: 1_000_000 });
    const state = createSpaceshipSimulationState(config, 92);

    function ticksToFace(kind: string): number {
      const trail = stepEnemy(config, state, enemyFacing(config, kind, 0, 1800), 200);
      // Ticks until it has swung more than a quarter turn off its start.
      const settled = trail.findIndex(
        (stepped) => Math.abs(shortestAngleDelta(stepped.heading, 0)) > Math.PI / 2
      );
      return settled === -1 ? Number.POSITIVE_INFINITY : settled;
    }

    expect(ticksToFace("boss")).toBeGreaterThan(ticksToFace("interceptor"));
  });

  it("settles onto its preferred range without a jump in course", () => {
    const config = createSpaceshipSimulationConfig({ enemySpawnIntervalTicks: 1_000_000 });
    const state = createSpaceshipSimulationState(config, 93);
    const archetype = getEnemyArchetype(config, "gunship");
    // Starts outside the range it wants and crosses into it. This crossing is
    // where closing used to switch to circling in one tick, flinging the ship
    // ninety degrees across the line and straight back out again.
    const enemy = enemyFacing(config, "gunship", Math.PI, archetype.preferredDistance + 200);

    // Measured on velocity, not heading: the turn limiter would hide a jump in
    // the rendered facing, but the flight path itself has to be continuous.
    const trail = stepEnemy(config, state, enemy, 120).filter(
      ({ velocity }) => Math.hypot(velocity.x, velocity.y) > 1
    );
    let widest = 0;
    let previous = Math.atan2(trail[0]?.velocity.y ?? 0, trail[0]?.velocity.x ?? 0);
    for (const stepped of trail.slice(1)) {
      const course = Math.atan2(stepped.velocity.y, stepped.velocity.x);
      widest = Math.max(widest, Math.abs(shortestAngleDelta(previous, course)));
      previous = course;
    }
    expect(widest).toBeLessThan(Math.PI / 6);
  });
});
