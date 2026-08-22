import { describe, expect, it } from "vitest";

import {
  advanceCombat,
  advanceFlyingCastle,
  applyGunnerInput,
  applyShieldInput,
  chooseRoleUpgrade,
  createFlyingCastleConfig,
  createFlyingCastleState,
  createRoleOffers,
  createWavePlan,
  dynamicEntityCount,
  getWaveDifficulty,
  relativeSweptCircleTime,
  shortestAngleDelta,
  type FlyingCastleState,
  type AsteroidState,
  type CombatEnemyState,
  type HostileProjectileState,
  type HomingMissileState,
  type ProjectileState
} from "./index.js";

describe("deterministic combat foundation", () => {
  it("requires a non-zero uint32 seed", () => {
    const config = createFlyingCastleConfig();
    expect(() => createFlyingCastleState(config, 0)).toThrow(RangeError);
    expect(() => createFlyingCastleState(config, 0x1_0000_0000)).toThrow(RangeError);
    expect(createFlyingCastleState(config, 123).runSeed).toBe(123);
    expect(() => createFlyingCastleConfig({ fixedStepMs: 40 })).toThrow(RangeError);
    expect(() =>
      createFlyingCastleConfig({
        caps: { ...config.caps, dynamicEntities: config.caps.dynamicEntities + 1 }
      })
    ).toThrow(RangeError);
  });

  it("keeps spawn and offer streams deterministic and independent", () => {
    const config = createFlyingCastleConfig();
    expect(createWavePlan(config, 123, 8)).toEqual(createWavePlan(config, 123, 8));
    expect(createRoleOffers(123, 8)).toEqual(createRoleOffers(123, 8));
    const offers = createRoleOffers(123, 8);
    createWavePlan(config, 123, 8);
    createWavePlan(config, 123, 9);
    expect(createRoleOffers(123, 8)).toEqual(offers);
  });

  it("unlocks carriers at wave three and scales difficulty monotonically", () => {
    const config = createFlyingCastleConfig();
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

  it("produces the same combat snapshot from the same seed and input trace", () => {
    const config = createFlyingCastleConfig();
    const run = () => {
      let state = createFlyingCastleState(config, 999);
      for (let step = 0; step < 80; step += 1) {
        state = applyGunnerInput(state, {
          vector: { x: 1, y: 0 },
          firing: step % 3 === 0,
          receivedTick: state.clock.tick
        });
        state = advanceFlyingCastle(state, config);
      }
      return state;
    };
    expect(run()).toEqual(run());
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
    const config = createFlyingCastleConfig({ enemySpawnIntervalTicks: 1000 });
    const initial = createFlyingCastleState(config, 8);
    const heading = Math.PI - 0.02;
    const missile: HomingMissileState = {
      id: "missile-test",
      spawnSequence: 1,
      previousX: initial.castle.x + 500,
      previousY: initial.castle.y + 10,
      x: initial.castle.x + 500,
      y: initial.castle.y + 10,
      velocity: {
        x: Math.cos(heading) * config.missileSpeedPerSecond,
        y: Math.sin(heading) * config.missileSpeedPerSecond
      },
      radius: config.missileRadius,
      spawnedTick: 0,
      heading,
      damage: config.missileDamage
    };
    const state: FlyingCastleState = {
      ...initial,
      encounterTick: 1,
      homingMissiles: [missile]
    };
    const advanced = advanceFlyingCastle(state, config);
    const moved = advanced.homingMissiles[0];
    expect(moved).toBeDefined();
    expect(Math.abs(shortestAngleDelta(heading, moved?.heading ?? 0))).toBeLessThanOrEqual(
      config.missileTurnRatePerSecond * (config.fixedStepMs / 1000) + 1e-12
    );
  });

  it("collapses an underpowered shield and lets the same bullet damage the castle", () => {
    const config = createFlyingCastleConfig({ enemySpawnIntervalTicks: 1000 });
    let state = createFlyingCastleState(config, 7);
    state = applyShieldInput(state, { vector: { x: -1, y: 0 }, active: true, receivedTick: 0 });
    state = {
      ...state,
      shieldAngle: -Math.PI,
      shieldActive: true,
      shieldEnergy: 2,
      pendingSpawns: []
    };
    const bullet: HostileProjectileState = {
      id: "hostile-test",
      spawnSequence: 1,
      previousX: state.castle.x - 140,
      previousY: state.castle.y,
      x: state.castle.x - 140,
      y: state.castle.y,
      velocity: { x: 2000, y: 0 },
      radius: config.hostileBulletRadius,
      spawnedTick: 0,
      damage: config.hostileBulletDamage
    };
    const stepped = advanceCombat(
      {
        ...state,
        castle: {
          ...state.castle,
          previousX: state.castle.previousX ?? state.castle.x,
          previousY: state.castle.previousY ?? state.castle.y,
          radius: config.castleRadius
        },
        hostileProjectiles: [bullet]
      },
      config
    );
    expect(stepped.shieldEnergy).toBe(0);
    expect(stepped.shieldActive).toBe(false);
    expect(stepped.castleHp).toBe(config.castleMaxHp - config.hostileBulletDamage);
  });

  it("freezes the exact final state after defeat", () => {
    const config = createFlyingCastleConfig();
    const initial = createFlyingCastleState(config, 72);
    const defeated: FlyingCastleState = { ...initial, encounterPhase: "defeated", castleHp: 0 };
    expect(advanceFlyingCastle(defeated, config)).toBe(defeated);
  });

  it("suppresses capped friendly fire while consuming the ordinary cooldown", () => {
    const baseConfig = createFlyingCastleConfig();
    const config = createFlyingCastleConfig({
      caps: { ...baseConfig.caps, friendlyProjectiles: 1, dynamicEntities: 165 }
    });
    let state = createFlyingCastleState(config, 53);
    for (let step = 0; step < 7; step += 1) {
      state = applyGunnerInput(state, {
        vector: { x: 1, y: 0 },
        firing: true,
        receivedTick: state.clock.tick
      });
      state = advanceFlyingCastle(state, config);
    }
    expect(state.projectiles).toHaveLength(1);
    expect(state.lastFiredTick).toBe(6);
  });

  it("shares one total-cap slot across multiple ready attacks and a pending spawn", () => {
    const config = createFlyingCastleConfig();
    const initial = createFlyingCastleState(config, 601);
    const enemies: CombatEnemyState[] = Array.from({ length: 40 }, (_, index) => ({
      id: `gunship-cap-${String(index)}`,
      spawnSequence: index + 1,
      kind: "gunship",
      previousX: 4400,
      previousY: 400 + index * 4,
      x: 4400,
      y: 400 + index * 4,
      velocity: { x: 0, y: 0 },
      radius: config.gunshipRadius,
      spawnedTick: 0,
      heading: 0,
      hp: config.gunshipHp,
      maxHp: config.gunshipHp,
      attackCooldownTicks: index < 3 ? 0 : 20
    }));
    const asteroids: AsteroidState[] = Array.from({ length: 16 }, (_, index) => ({
      id: `asteroid-cap-${String(index)}`,
      spawnSequence: 41 + index,
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
      id: `hostile-cap-${String(index)}`,
      spawnSequence: 57 + index,
      previousX: 300,
      previousY: 2700,
      x: 300,
      y: 2700,
      velocity: { x: 0, y: 0 },
      radius: config.hostileBulletRadius,
      spawnedTick: 0,
      damage: config.hostileBulletDamage
    }));
    const homingMissiles: HomingMissileState[] = Array.from({ length: 12 }, (_, index) => ({
      id: `missile-cap-${String(index)}`,
      spawnSequence: 152 + index,
      previousX: 4200,
      previousY: 2900,
      x: 4200,
      y: 2900,
      velocity: { x: 0, y: 0 },
      radius: config.missileRadius,
      spawnedTick: 0,
      heading: 0,
      damage: config.missileDamage
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
      spawnedTick: 0
    }));
    const state: FlyingCastleState = {
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
        castle: {
          ...state.castle,
          previousX: state.castle.previousX ?? state.castle.x,
          previousY: state.castle.previousY ?? state.castle.y,
          radius: config.castleRadius
        }
      },
      config
    );

    expect(dynamicEntityCount(advanced)).toBeLessThanOrEqual(config.caps.dynamicEntities);
    expect(advanced.hostileProjectiles).toHaveLength(96);
    expect(advanced.nextSpawnSequence).toBe(197);
    expect(advanced.pendingSpawns).toHaveLength(initial.pendingSpawns.length);
    expect(
      advanced.enemies.slice(0, 3).every(({ attackCooldownTicks }) => attackCooldownTicks > 0)
    ).toBe(true);
  });
});

describe("role upgrades", () => {
  it("applies one role choice atomically and rejects a second choice", () => {
    const config = createFlyingCastleConfig();
    const initial = createFlyingCastleState(config, 42);
    const generated = createRoleOffers(initial.runSeed, 1);
    const intermission: FlyingCastleState = {
      ...initial,
      encounterPhase: "intermission",
      roleOffers: generated.offers
    };
    const offer = generated.offers.gunner;
    const firstCard = offer?.cards[0];
    if (offer === null || firstCard === undefined) throw new Error("expected gunner offer");
    const first = chooseRoleUpgrade(intermission, {
      role: "gunner",
      waveNumber: 1,
      offerId: offer.offerId,
      upgradeId: firstCard.upgradeId
    });
    expect(first.status).toBe("accepted");
    expect(first.state.roleSelections.gunner).toEqual({
      offerId: offer.offerId,
      upgradeId: firstCard.upgradeId,
      role: "gunner",
      source: "player"
    });
    const second = chooseRoleUpgrade(first.state, {
      role: "gunner",
      waveNumber: 1,
      offerId: offer.offerId,
      upgradeId: offer.cards[1]?.upgradeId ?? firstCard.upgradeId
    });
    expect(second.status).toBe("already_chosen");
    expect(second.state).toBe(first.state);
  });

  it("uses deterministic fallback exactly at the 200-tick deadline", () => {
    const config = createFlyingCastleConfig();
    const initial = createFlyingCastleState(config, 24);
    const generated = createRoleOffers(initial.runSeed, 1);
    const beforeDeadline: FlyingCastleState = {
      ...initial,
      encounterPhase: "intermission",
      encounterTick: 199,
      roleOffers: generated.offers,
      roleSelections: { pilot: null, gunner: null, shield: null }
    };
    const nextWave = advanceFlyingCastle(beforeDeadline, config);
    const fallbackSelections = nextWave.roleSelections;
    expect(nextWave.encounterPhase).toBe("combat");
    expect(nextWave.waveNumber).toBe(2);
    expect(nextWave.encounterTick).toBe(0);
    expect(nextWave.roleOffers).toEqual({ pilot: null, gunner: null, shield: null });
    expect(fallbackSelections.pilot).toMatchObject({ role: "pilot", source: "fallback" });
    expect(fallbackSelections.gunner).toMatchObject({ role: "gunner", source: "fallback" });
    expect(fallbackSelections.shield).toMatchObject({ role: "shield", source: "fallback" });
    expect(nextWave.roleModifiers).not.toEqual(initial.roleModifiers);
    expect(nextWave.inputs).toEqual(initial.inputs);
  });
});
