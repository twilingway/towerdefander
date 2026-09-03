import { describe, expect, it } from "vitest";

import {
  advanceCombat,
  advanceSpaceshipSimulation,
  applyGunnerInput,
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState,
  createTeamUpgradeOffer,
  damageTaken,
  getEnemyArchetype,
  voteForTeamUpgrade,
  type CombatEnemyState,
  type HostileProjectileState,
  type ProjectileState,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState
} from "./index.ts";

/** Nothing spawns on its own, so every counter in a test has exactly one cause. */
function quietConfig(): SpaceshipSimulationConfig {
  return createSpaceshipSimulationConfig({
    enemySpawnIntervalTicks: 1000,
    ambientAsteroidIntervalMinTicks: 100_000,
    ambientAsteroidIntervalMaxTicks: 100_000
  });
}

function settled(state: SpaceshipSimulationState, config: SpaceshipSimulationConfig) {
  return {
    ...state,
    pendingSpawns: [],
    spaceship: {
      ...state.spaceship,
      previousX: state.spaceship.previousX ?? state.spaceship.x,
      previousY: state.spaceship.previousY ?? state.spaceship.y,
      radius: config.spaceshipRadius
    }
  };
}

function projectileAt(
  x: number,
  y: number,
  config: SpaceshipSimulationConfig,
  source: ProjectileState["source"]
): ProjectileState {
  return {
    id: `shot-${source}`,
    projectileId: `shot-${source}`,
    spawnSequence: 1,
    previousX: x,
    previousY: y,
    x,
    y,
    velocity: { x: 0, y: 0 },
    radius: config.projectileRadius,
    spawnedTick: 0,
    damage: config.friendlyProjectileDamage,
    source,
    homing: null
  };
}

function enemyAt(x: number, y: number, hp: number, config: SpaceshipSimulationConfig) {
  const archetype = getEnemyArchetype(config, "gunship");
  const enemy: CombatEnemyState = {
    id: "target",
    spawnSequence: 2,
    kind: "gunship",
    previousX: x,
    previousY: y,
    x,
    y,
    velocity: { x: 0, y: 0 },
    heading: 0,
    angularVelocity: 0,
    orbitSign: 1,
    perception: { tick: -1, x: 0, y: 0, velocityX: 0, velocityY: 0 },
    aimRngState: 1,
    radius: archetype.radius,
    spawnedTick: 0,
    hp,
    maxHp: archetype.hp,
    weaponCooldownTicks: archetype.weapons.map(() => 1000)
  };
  return { enemy, archetype };
}

describe("run statistics", () => {
  it("attributes a hit to the barrel that fired it and caps damage at what was left", () => {
    const config = quietConfig();
    const initial = createSpaceshipSimulationState(config, 71);
    const x = initial.spaceship.x + 500;
    const y = initial.spaceship.y;
    const { enemy, archetype } = enemyAt(x, y, 3, config);

    const result = advanceCombat(
      {
        ...settled(initial, config),
        enemies: [enemy],
        projectiles: [projectileAt(x, y, config, "cannon")]
      },
      config
    );

    expect(result.enemies).toEqual([]);
    expect(result.runStats.hitsByCannon).toBe(1);
    expect(result.runStats.hitsByMachineGun).toBe(0);
    // The shot carries far more than three points; only three ever existed.
    expect(config.friendlyProjectileDamage).toBeGreaterThan(3);
    expect(result.runStats.damageDealtByCannon).toBe(3);
    expect(result.runStats.creditsEarned).toBe(archetype.creditReward);
  });

  it("counts a nose gun hit separately from the turret", () => {
    const config = quietConfig();
    const initial = createSpaceshipSimulationState(config, 72);
    const x = initial.spaceship.x + 500;
    const y = initial.spaceship.y;
    const { enemy } = enemyAt(x, y, 1000, config);

    const result = advanceCombat(
      {
        ...settled(initial, config),
        enemies: [enemy],
        projectiles: [projectileAt(x, y, config, "machineGun")]
      },
      config
    );

    expect(result.runStats.hitsByMachineGun).toBe(1);
    expect(result.runStats.damageDealtByMachineGun).toBe(config.friendlyProjectileDamage);
    expect(result.runStats.hitsByCannon).toBe(0);
    expect(result.runStats.damageDealtByCannon).toBe(0);
  });

  it("records damage taken by threat class and sums it to the health actually lost", () => {
    const config = quietConfig();
    const initial = createSpaceshipSimulationState(config, 73);
    const bullet: HostileProjectileState = {
      id: "incoming",
      spawnSequence: 3,
      previousX: initial.spaceship.x,
      previousY: initial.spaceship.y,
      x: initial.spaceship.x,
      y: initial.spaceship.y,
      velocity: { x: 0, y: 0 },
      radius: 6,
      spawnedTick: 0,
      damage: 17,
      shieldHitCost: 5,
      lifetimeTicks: 1000,
      visual: null
    };

    const result = advanceCombat(
      { ...settled(initial, config), hostileProjectiles: [bullet] },
      config
    );

    expect(result.runStats.damageTakenFromBullets).toBe(17);
    expect(result.runStats.damageTakenFromMissiles).toBe(0);
    expect(result.runStats.damageTakenFromAsteroids).toBe(0);
    expect(damageTaken(result.runStats)).toBe(config.spaceshipMaxHp - result.spaceshipHp);
  });

  it("keeps counters across steps and across the wave boundary", () => {
    const config = quietConfig();
    const initial = createSpaceshipSimulationState(config, 74);
    const x = initial.spaceship.x + 500;
    const y = initial.spaceship.y;
    const { enemy } = enemyAt(x, y, 1000, config);

    const hit = advanceCombat(
      {
        ...settled(initial, config),
        enemies: [enemy],
        projectiles: [projectileAt(x, y, config, "cannon")]
      },
      config
    );
    expect(hit.runStats.hitsByCannon).toBe(1);

    // The wave is clear on this step, so the run crosses into the intermission.
    const cleared = advanceCombat({ ...settled(initial, config), ...hit, enemies: [] }, config);
    expect(cleared.encounterPhase).toBe("intermission");
    expect(cleared.runStats.hitsByCannon).toBe(1);
    expect(cleared.runStats.damageDealtByCannon).toBe(hit.runStats.damageDealtByCannon);
  });

  it("counts a turret shot as it leaves the barrel", () => {
    const config = quietConfig();
    const initial = createSpaceshipSimulationState(config, 75);
    const aimed = applyGunnerInput(settled(initial, config), {
      vector: { x: 1, y: 0 },
      firing: true,
      receivedTick: initial.clock.tick
    });

    const stepped = advanceSpaceshipSimulation(aimed, config);

    expect(stepped.runStats.shotsByCannon).toBe(1);
    expect(stepped.runStats.shotsByMachineGun).toBe(0);
  });

  it("records credits spent when the crew buys an upgrade", () => {
    const config = quietConfig();
    const initial = createSpaceshipSimulationState(config, 76);
    const offer = createTeamUpgradeOffer(
      config.moduleTiers,
      config.endlessTier,
      4,
      initial.waveNumber
    );
    if (offer === null) throw new Error("expected an offer");
    const card = offer.cards[0];
    if (card === undefined) throw new Error("offer must carry a card");

    const voted = voteForTeamUpgrade(
      {
        ...settled(initial, config),
        encounterPhase: "intermission" as const,
        encounterTick: config.intermissionTicks - 1,
        credits: 10,
        teamUpgradeOffer: offer
      },
      {
        role: card.role,
        waveNumber: initial.waveNumber,
        offerId: offer.offerId,
        upgradeId: card.upgradeId,
        revision: 1
      }
    );
    expect(voted.status).toBe("accepted");

    const result = advanceCombat(voted.state, config);

    expect(result.credits).toBe(5);
    expect(result.runStats.creditsSpent).toBe(5);
  });
});
