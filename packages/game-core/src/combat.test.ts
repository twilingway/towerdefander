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
  getWaveDifficulty,
  relativeSweptCircleTime,
  shortestAngleDelta,
  voteForTeamUpgrade,
  type SpaceshipSimulationState,
  type AsteroidState,
  type CombatEnemyState,
  type EnemyWeaponTuning,
  type HostileProjectileState,
  type HomingMissileState,
  type ProjectileState
} from "./index.js";

function scriptedCampaignConfig() {
  const base = createSpaceshipSimulationConfig();
  return createSpaceshipSimulationConfig({
    waveCampaign: {
      ...base.waveCampaign,
      waves: [
        {
          entries: [
            { kind: "gunship", count: 3, spawnIntervalTicks: 3, sector: "N" },
            { kind: "asteroid", count: 1, spawnIntervalTicks: 9, sector: "SE" }
          ],
          hpMultiplier: 2.5,
          tempoMultiplier: null
        },
        {
          entries: [{ kind: "asteroid", count: 2, spawnIntervalTicks: 5, sector: null }],
          hpMultiplier: null,
          tempoMultiplier: null
        }
      ]
    }
  });
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
    lifetimeTicks: weapon.projectileLifetimeTicks
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
    expect(config.enemyArchetypes.missileCarrier.unlockWave).toBe(3);
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
        missileCarrier: { ...base.enemyArchetypes.missileCarrier, unlockWave: 6 }
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
    expect(plan.map(({ sector }) => sector)).toEqual(["N", "N", "N", "SE"]);
  });

  it("falls back to the director past the last scripted wave", () => {
    const config = scriptedCampaignConfig();
    const scripted = createWavePlan(config, 91, 2).plan;
    expect(scripted.map(({ kind }) => kind)).toEqual(["asteroid", "asteroid"]);
    const directed = createWavePlan(config, 91, 3);
    expect(directed.plan.length).toBeGreaterThan(0);
    expect(directed.plan.every(({ sector }) => sector === null)).toBe(true);
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
    const weapon = config.enemyArchetypes.missileCarrier.weapon;
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
      ...bulletFromWeapon(config.enemyArchetypes.gunship.weapon),
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
    expect(stepped.spaceshipHp).toBe(
      config.spaceshipMaxHp - config.enemyArchetypes.gunship.weapon.damage
    );
  });

  it("rewards missile and wave asteroid shield interceptions exactly once", () => {
    const config = createSpaceshipSimulationConfig({ enemySpawnIntervalTicks: 1000 });
    const initial = createSpaceshipSimulationState(config, 70);
    const x = initial.spaceship.x + config.shieldRadius;
    const y = initial.spaceship.y;
    const missile: HomingMissileState = {
      ...missileFromWeapon(config.enemyArchetypes.missileCarrier.weapon),
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
      previousX: 4400,
      previousY: 400 + index * 4,
      x: 4400,
      y: 400 + index * 4,
      velocity: { x: 0, y: 0 },
      radius: config.enemyArchetypes.gunship.radius,
      spawnedTick: 0,
      heading: 0,
      hp: config.enemyArchetypes.gunship.hp,
      maxHp: config.enemyArchetypes.gunship.hp,
      attackCooldownTicks: index < 3 ? 0 : 20
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
      ...bulletFromWeapon(config.enemyArchetypes.gunship.weapon),
      id: `hostile-cap-${String(index)}`,
      spawnSequence: 57 + index,
      previousX: 300,
      previousY: 2700,
      x: 300,
      y: 2700
    }));
    const homingMissiles: HomingMissileState[] = Array.from({ length: 12 }, (_, index) => ({
      ...missileFromWeapon(config.enemyArchetypes.missileCarrier.weapon),
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
      advanced.enemies.slice(0, 3).every(({ attackCooldownTicks }) => attackCooldownTicks > 0)
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
