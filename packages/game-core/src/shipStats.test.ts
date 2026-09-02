import { describe, expect, it } from "vitest";

import {
  advanceSpaceshipSimulation,
  applyGunnerInput,
  applyPilotInput,
  applyShieldInput,
  computeShipStats,
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState,
  getEnemyArchetype,
  MODULE_TARGET_FIELDS,
  SHIP_STAT_FIELDS,
  shipStatsFromConfig,
  type CombatEnemyState,
  type ShipStatEffect,
  type ShipStatField,
  type ShipStats,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState
} from "./index.ts";

function base(): ShipStats {
  return shipStatsFromConfig(createSpaceshipSimulationConfig());
}

describe("ship stat fields", () => {
  it("names every field exactly once and excludes only what is published per run", () => {
    expect(new Set(SHIP_STAT_FIELDS).size).toBe(SHIP_STAT_FIELDS.length);
    const targets = new Set<string>(MODULE_TARGET_FIELDS);
    expect(targets.has("shieldRadius")).toBe(false);
    expect(targets.has("headingAngularBrakingPerSecondSquared")).toBe(false);
    expect(MODULE_TARGET_FIELDS).toHaveLength(SHIP_STAT_FIELDS.length - 2);
  });

  it("reads the run's base straight off the config", () => {
    const config = createSpaceshipSimulationConfig();
    expect(shipStatsFromConfig(config).spaceshipMaxHp).toBe(config.spaceshipMaxHp);
    expect(shipStatsFromConfig(config).shieldArcRadians).toBe(config.shieldArcRadians);
  });
});

describe("computeShipStats", () => {
  it("leaves the ship alone when nothing has been bought", () => {
    expect(computeShipStats(base(), [])).toEqual(base());
  });

  it("sums additions, sums percents and multiplies multipliers", () => {
    const stats = computeShipStats(base(), [
      { target: "spaceshipMaxHp", op: "add", value: 25 },
      { target: "spaceshipMaxHp", op: "add", value: 25 },
      { target: "spaceshipSpeedPerSecond", op: "percent", value: 0.1 },
      { target: "spaceshipSpeedPerSecond", op: "percent", value: 0.1 }
    ]);

    expect(stats.spaceshipMaxHp).toBe(base().spaceshipMaxHp + 50);
    expect(stats.spaceshipSpeedPerSecond).toBeCloseTo(base().spaceshipSpeedPerSecond * 1.2, 10);
  });

  it("does not care in which order the modules were bought", () => {
    const effects: ShipStatEffect[] = [
      { target: "friendlyProjectileDamage", op: "percent", value: 0.15 },
      { target: "friendlyProjectileDamage", op: "add", value: 3 },
      { target: "fireCooldownTicks", op: "multiply", value: 0.9 },
      { target: "friendlyProjectileDamage", op: "multiply", value: 1.1 }
    ];

    expect(computeShipStats(base(), effects)).toEqual(
      computeShipStats(base(), [...effects].reverse())
    );
  });

  it("keeps a cooldown whole, and never below a quarter of its base", () => {
    const cooldown = base().fireCooldownTicks;
    expect(
      computeShipStats(base(), [{ target: "fireCooldownTicks", op: "multiply", value: 0.9 }])
        .fireCooldownTicks
    ).toBe(Math.ceil(cooldown * 0.9));
    expect(
      computeShipStats(base(), [{ target: "fireCooldownTicks", op: "multiply", value: 0.01 }])
        .fireCooldownTicks
    ).toBe(Math.ceil(cooldown * 0.25));
  });

  it("holds the shield arc at a full circle for everyone who reads it", () => {
    // The clamp used to live only in the display projection, so a wide arc
    // blocked shots it never drew.
    const stats = computeShipStats(base(), [
      { target: "shieldArcRadians", op: "add", value: Math.PI * 4 }
    ]);
    expect(stats.shieldArcRadians).toBe(Math.PI * 2);
  });

  it("refuses to take any stat below zero", () => {
    const stats = computeShipStats(base(), [
      { target: "shieldRechargePerSecond", op: "add", value: -1_000 }
    ]);
    expect(stats.shieldRechargePerSecond).toBe(0);
  });
});

/**
 * The guard that keeps ship stats in the state.
 *
 * For every stat: the step must not care what the config says about it, and it
 * must care what the state says. The first half catches a read left on the
 * config, which compiles and plays almost right; the second half stops the
 * first from passing for the boring reason that the scenario never touches the
 * field at all.
 */
const TRACE_TICKS = 600;

/**
 * One scenario per weapon kind, and the stat that only that kind reads is
 * checked under it. Without this the laser and missile stats would pass the
 * config half for the boring reason that nothing in a kinetic run touches them.
 */
const GUARD_SCENARIOS = {
  kinetic: {},
  // The turret's reach is cut below the far enemies on purpose: with every
  // target already inside it, doubling the range would change nothing and the
  // guard would prove nothing.
  laser: { cannonWeaponKind: "laser", mgWeaponKind: "laser", cannonLaserRange: 250 },
  missile: { cannonWeaponKind: "missile", mgWeaponKind: "missile" }
} as const satisfies Record<string, Partial<SpaceshipSimulationConfig>>;

type GuardScenario = keyof typeof GUARD_SCENARIOS;

const SCENARIO_BY_FIELD: Partial<Record<ShipStatField, GuardScenario>> = {
  cannonLaserRange: "laser",
  mgLaserRange: "laser",
  laserBeamRadius: "laser",
  friendlyMissileTurnRatePerSecond: "missile",
  friendlyMissileAcquireConeRadians: "missile"
};

/**
 * Where the guard's four enemies stand and open fire, pinned rather than taken
 * from the catalogue. This scenario is an instrument for the stat plumbing, and
 * a balance pass that moved every archetype closer quietly broke it: the guard
 * ship died halfway through the trace, and a state frozen on the result screen
 * exercises nothing - the beam's reach and the shield's minimum hold stopped
 * being proven while every other field still was. Pinned, the instrument reads
 * the same whatever the catalogue is tuned to next.
 */
const GUARD_ENEMY_RANGES: Readonly<Record<string, { hold: number; engage: number }>> = {
  gunship: { hold: 650, engage: 1200 },
  missileCarrier: { hold: 900, engage: 1700 },
  sniper: { hold: 1400, engage: 3000 },
  interceptor: { hold: 320, engage: 600 }
};

function pinnedArchetypes(
  archetypes: SpaceshipSimulationConfig["enemyArchetypes"]
): SpaceshipSimulationConfig["enemyArchetypes"] {
  return Object.fromEntries(
    Object.entries(archetypes).map(([kind, archetype]) => {
      const pinned = GUARD_ENEMY_RANGES[kind];
      if (pinned === undefined) return [kind, archetype];
      return [
        kind,
        {
          ...archetype,
          preferredDistance: pinned.hold,
          weapons: archetype.weapons.map((weapon) => ({
            ...weapon,
            engagementRange: pinned.engage
          }))
        }
      ];
    })
  );
}

function guardConfig(
  overrides: Partial<SpaceshipSimulationConfig> = {}
): SpaceshipSimulationConfig {
  // The wave is placed by hand below, so nothing else may spawn; the ambient
  // rocks stay, because they are what the shield and the hull meet.
  return createSpaceshipSimulationConfig({
    enemySpawnIntervalTicks: 100_000,
    ambientAsteroidIntervalMinTicks: 40,
    ambientAsteroidIntervalMaxTicks: 60,
    enemyArchetypes: pinnedArchetypes(createSpaceshipSimulationConfig().enemyArchetypes),
    ...overrides
  });
}

/**
 * Four enemies close enough to trade with, tough enough to survive the trace:
 * a wave that cleared would drop the run into an intermission, where the ship
 * is neutralized and most of its stats stop mattering.
 */
function guardEnemies(
  state: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig
): CombatEnemyState[] {
  const kinds = Object.keys(config.enemyArchetypes).slice(0, 4);
  return kinds.map((kind, index) => {
    const angle = (index / kinds.length) * Math.PI * 2;
    const distance = 340 + index * 90;
    const archetype = getEnemyArchetype(config, kind);
    return {
      id: `guard-${String(index)}`,
      spawnSequence: index + 1,
      kind,
      previousX: state.spaceship.x + Math.cos(angle) * distance,
      previousY: state.spaceship.y + Math.sin(angle) * distance,
      x: state.spaceship.x + Math.cos(angle) * distance,
      y: state.spaceship.y + Math.sin(angle) * distance,
      velocity: { x: 0, y: 0 },
      heading: angle + Math.PI,
      angularVelocity: 0,
      orbitSign: index % 2 === 0 ? 1 : -1,
      perception: { tick: -1, x: 0, y: 0, velocityX: 0, velocityY: 0 },
      aimRngState: 7 + index,
      radius: archetype.radius,
      spawnedTick: 0,
      hp: 20_000,
      maxHp: 20_000,
      weaponCooldownTicks: archetype.weapons.map(() => 0)
    };
  });
}

/**
 * Busy on purpose: thrust forward, coast and reverse; both barrels firing at an
 * aim that jumps rather than drifts, so a traverse rate is worth something; the
 * shield raised long enough to drain and dropped long enough to re-arm.
 */
function runTrace(config: SpaceshipSimulationConfig, initial: SpaceshipSimulationState): string {
  let state = initial;
  for (let tick = 0; tick < TRACE_TICKS; tick += 1) {
    const receivedTick = state.clock.tick;
    const phase = tick % 150;
    const thrust = phase < 70 ? 1 : phase < 100 ? 0 : phase < 130 ? -1 : 1;
    // A bearing that snaps to the opposite side: a turret that traverses at any
    // rate reaches a drifting target, and then its rate never shows up.
    const aim = tick % 60 < 30 ? 0 : Math.PI;
    state = applyPilotInput(state, {
      vector: { x: 0, y: 0 },
      mgFiring: tick % 8 < 6,
      receivedTick,
      turn: tick % 90 < 45 ? 1 : -1,
      thrust
    });
    state = applyGunnerInput(state, {
      vector: { x: Math.cos(aim), y: Math.sin(aim) },
      firing: true,
      receivedTick
    });
    // Held long enough to drain in the first half; in the second, asked for
    // and dropped again so quickly that the minimum hold and the cooldown are
    // what decide, rather than the operator.
    state = applyShieldInput(state, {
      vector: { x: Math.cos(aim + Math.PI / 2), y: Math.sin(aim + Math.PI / 2) },
      active: tick < 300 ? tick % 260 < 190 : tick % 60 < 14,
      receivedTick
    });
    state = advanceSpaceshipSimulation(state, config);
  }
  const { ship, purchasedModules, ...rest } = state;
  void ship;
  void purchasedModules;
  return JSON.stringify(rest);
}

function doubled<T extends ShipStats>(source: T, field: ShipStatField): T {
  return { ...source, [field]: source[field] * 2 };
}

function prepareGuard(scenario: GuardScenario) {
  const config = guardConfig(GUARD_SCENARIOS[scenario]);
  const fresh = createSpaceshipSimulationState(config, 991);
  const initial: SpaceshipSimulationState = {
    ...fresh,
    pendingSpawns: [],
    enemies: guardEnemies(fresh, config),
    // A hurt hull and a repair too big for it: without one the maximum is never
    // the thing that decides anything.
    spaceshipHp: 200,
    lootDrops: [
      {
        id: "guard-loot",
        spawnSequence: 99,
        previousX: fresh.spaceship.x + 40,
        previousY: fresh.spaceship.y,
        x: fresh.spaceship.x + 40,
        y: fresh.spaceship.y,
        velocity: { x: 0, y: 0 },
        radius: config.lootDropRadius,
        spawnedTick: 0,
        kind: "repair",
        amount: 10_000,
        lifetimeTicks: config.lootLifetimeTicks
      }
    ]
  };
  return { config, initial, baseline: runTrace(config, initial) };
}

describe("ship stats are read from the state, never from the config", () => {
  const prepared = new Map(
    (Object.keys(GUARD_SCENARIOS) as GuardScenario[]).map((name) => [name, prepareGuard(name)])
  );

  for (const field of SHIP_STAT_FIELDS) {
    const scenario = SCENARIO_BY_FIELD[field] ?? "kinetic";
    it(`ignores the config's ${field} and follows the state's`, () => {
      const guard = prepared.get(scenario);
      if (guard === undefined) throw new Error(`no scenario ${scenario}`);
      expect(
        runTrace(doubled(guard.config, field), guard.initial),
        `${field} is still read from the config`
      ).toBe(guard.baseline);
      expect(
        runTrace(guard.config, { ...guard.initial, ship: doubled(guard.initial.ship, field) }),
        `${field} is never exercised by the ${scenario} scenario, so the guard proves nothing`
      ).not.toBe(guard.baseline);
    });
  }
});
