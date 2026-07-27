import { advanceClock, type SimulationClock } from "./primitives.js";

export type SectorId = 0 | 1;
export type DefenseResult = "in_progress" | "victory" | "defeat";

export interface EnemySpawn {
  readonly tick: number;
  readonly sectorId: number;
}

export interface DefenseConfig {
  readonly fixedStepMs: number;
  readonly sectorCount: number;
  readonly pathLength: number;
  readonly gateMaxHealth: number;
  readonly startingTreasury: number;
  readonly baseDefenseDamage: number;
  readonly damagePerUpgrade: number;
  readonly maxDefenseLevel: number;
  readonly repairCost: number;
  readonly repairAmount: number;
  readonly upgradeBaseCost: number;
  readonly upgradeCostStep: number;
  readonly enemy: {
    readonly maxHealth: number;
    readonly speedPerStep: number;
    readonly gateDamage: number;
    readonly reward: number;
  };
  readonly spawns: readonly EnemySpawn[];
}

export interface SectorState {
  readonly sectorId: SectorId;
  readonly gateHealth: number;
  readonly defenseLevel: number;
}

export interface EnemyState {
  readonly enemyId: string;
  readonly sectorId: SectorId;
  readonly health: number;
  readonly progress: number;
}

export interface DefenseState {
  readonly seed: number;
  readonly clock: SimulationClock;
  readonly treasury: number;
  readonly result: DefenseResult;
  readonly sectors: readonly [SectorState, SectorState];
  readonly enemies: readonly EnemyState[];
  readonly nextSpawnIndex: number;
}

export type DefenseAction =
  | { readonly type: "repair"; readonly sectorId: SectorId }
  | { readonly type: "upgrade"; readonly sectorId: SectorId };

export type DefenseActionRejection = "battle_finished" | "insufficient_funds" | "not_available";

export type DefenseActionResult =
  | { readonly accepted: true; readonly state: DefenseState }
  | {
      readonly accepted: false;
      readonly reason: DefenseActionRejection;
      readonly state: DefenseState;
    };

export const prototypeDefenseConfig: DefenseConfig = {
  fixedStepMs: 500,
  sectorCount: 2,
  pathLength: 6,
  gateMaxHealth: 100,
  startingTreasury: 50,
  baseDefenseDamage: 3,
  damagePerUpgrade: 2,
  maxDefenseLevel: 3,
  repairCost: 15,
  repairAmount: 20,
  upgradeBaseCost: 20,
  upgradeCostStep: 10,
  enemy: {
    maxHealth: 9,
    speedPerStep: 1,
    gateDamage: 20,
    reward: 8
  },
  spawns: [
    { tick: 1, sectorId: 0 },
    { tick: 1, sectorId: 1 },
    { tick: 2, sectorId: 0 },
    { tick: 2, sectorId: 1 },
    { tick: 3, sectorId: 0 },
    { tick: 3, sectorId: 1 },
    { tick: 5, sectorId: 0 },
    { tick: 5, sectorId: 1 }
  ]
};

export function validateDefenseConfig(config: DefenseConfig): void {
  if (config.sectorCount !== 2) {
    throw new RangeError("sectorCount must be exactly 2");
  }

  const positiveIntegers: readonly (readonly [string, number])[] = [
    ["fixedStepMs", config.fixedStepMs],
    ["pathLength", config.pathLength],
    ["gateMaxHealth", config.gateMaxHealth],
    ["baseDefenseDamage", config.baseDefenseDamage],
    ["damagePerUpgrade", config.damagePerUpgrade],
    ["maxDefenseLevel", config.maxDefenseLevel],
    ["repairCost", config.repairCost],
    ["repairAmount", config.repairAmount],
    ["upgradeBaseCost", config.upgradeBaseCost],
    ["upgradeCostStep", config.upgradeCostStep],
    ["enemy.maxHealth", config.enemy.maxHealth],
    ["enemy.speedPerStep", config.enemy.speedPerStep],
    ["enemy.gateDamage", config.enemy.gateDamage],
    ["enemy.reward", config.enemy.reward]
  ];

  for (const [name, value] of positiveIntegers) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }

  if (!Number.isSafeInteger(config.startingTreasury) || config.startingTreasury < 0) {
    throw new RangeError("startingTreasury must be a non-negative safe integer");
  }

  let previousTick = 0;
  for (const spawn of config.spawns) {
    if (!Number.isSafeInteger(spawn.tick) || spawn.tick < 1) {
      throw new RangeError("spawn.tick must be a positive safe integer");
    }
    if (spawn.tick < previousTick) {
      throw new RangeError("spawns must be sorted by tick");
    }
    if (spawn.sectorId !== 0 && spawn.sectorId !== 1) {
      throw new RangeError("spawn.sectorId must be 0 or 1");
    }
    previousTick = spawn.tick;
  }
}

export function createDefenseState(config: DefenseConfig, seed: number): DefenseState {
  validateDefenseConfig(config);
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError("seed must be a safe integer");
  }

  return {
    seed,
    clock: { tick: 0, elapsedMs: 0 },
    treasury: config.startingTreasury,
    result: "in_progress",
    sectors: [
      { sectorId: 0, gateHealth: config.gateMaxHealth, defenseLevel: 1 },
      { sectorId: 1, gateHealth: config.gateMaxHealth, defenseLevel: 1 }
    ],
    enemies: [],
    nextSpawnIndex: 0
  };
}

export function getDefenseDamage(config: DefenseConfig, level: number): number {
  return config.baseDefenseDamage + (level - 1) * config.damagePerUpgrade;
}

export function getUpgradeCost(config: DefenseConfig, currentLevel: number): number {
  return config.upgradeBaseCost + (currentLevel - 1) * config.upgradeCostStep;
}

export function advanceDefense(state: DefenseState, config: DefenseConfig): DefenseState {
  if (state.result !== "in_progress") {
    return state;
  }

  const clock = advanceClock(state.clock, config.fixedStepMs);
  const enemies = state.enemies.map((enemy) => ({ ...enemy }));
  let nextSpawnIndex = state.nextSpawnIndex;
  let treasury = state.treasury;

  while (config.spawns[nextSpawnIndex]?.tick === clock.tick) {
    const spawn = config.spawns[nextSpawnIndex];
    if (spawn === undefined) {
      break;
    }
    enemies.push({
      enemyId: `enemy-${String(nextSpawnIndex)}`,
      sectorId: toSectorId(spawn.sectorId),
      health: config.enemy.maxHealth,
      progress: 0
    });
    nextSpawnIndex += 1;
  }

  const survivingAfterAttack: EnemyState[] = [];
  for (const sector of state.sectors) {
    let target: EnemyState | undefined;
    for (const enemy of enemies) {
      if (
        enemy.sectorId === sector.sectorId &&
        (target === undefined || enemy.progress > target.progress)
      ) {
        target = enemy;
      }
    }
    const targetId = target?.enemyId;

    for (const enemy of enemies.filter((candidate) => candidate.sectorId === sector.sectorId)) {
      if (enemy.enemyId !== targetId) {
        survivingAfterAttack.push(enemy);
        continue;
      }

      const health = enemy.health - getDefenseDamage(config, sector.defenseLevel);
      if (health <= 0) {
        treasury += config.enemy.reward;
      } else {
        survivingAfterAttack.push({ ...enemy, health });
      }
    }
  }

  const gateHealth: [number, number] = [state.sectors[0].gateHealth, state.sectors[1].gateHealth];
  const activeEnemies: EnemyState[] = [];

  for (const enemy of survivingAfterAttack) {
    const progress = enemy.progress + config.enemy.speedPerStep;
    if (progress >= config.pathLength) {
      gateHealth[enemy.sectorId] = Math.max(
        0,
        gateHealth[enemy.sectorId] - config.enemy.gateDamage
      );
    } else {
      activeEnemies.push({ ...enemy, progress });
    }
  }

  const sectors: [SectorState, SectorState] = [
    { ...state.sectors[0], gateHealth: gateHealth[0] },
    { ...state.sectors[1], gateHealth: gateHealth[1] }
  ];
  const result: DefenseResult = sectors.some((sector) => sector.gateHealth === 0)
    ? "defeat"
    : nextSpawnIndex === config.spawns.length && activeEnemies.length === 0
      ? "victory"
      : "in_progress";

  return {
    ...state,
    clock,
    treasury,
    result,
    sectors,
    enemies: activeEnemies,
    nextSpawnIndex
  };
}

function toSectorId(value: number): SectorId {
  if (value !== 0 && value !== 1) {
    throw new RangeError("sectorId must be 0 or 1");
  }
  return value;
}

export function applyDefenseAction(
  state: DefenseState,
  config: DefenseConfig,
  action: DefenseAction
): DefenseActionResult {
  if (state.result !== "in_progress") {
    return { accepted: false, reason: "battle_finished", state };
  }

  const sector = state.sectors[action.sectorId];
  const cost =
    action.type === "repair" ? config.repairCost : getUpgradeCost(config, sector.defenseLevel);

  if (
    (action.type === "repair" && sector.gateHealth >= config.gateMaxHealth) ||
    (action.type === "upgrade" && sector.defenseLevel >= config.maxDefenseLevel)
  ) {
    return { accepted: false, reason: "not_available", state };
  }

  if (state.treasury < cost) {
    return { accepted: false, reason: "insufficient_funds", state };
  }

  const updatedSector: SectorState =
    action.type === "repair"
      ? {
          ...sector,
          gateHealth: Math.min(config.gateMaxHealth, sector.gateHealth + config.repairAmount)
        }
      : { ...sector, defenseLevel: sector.defenseLevel + 1 };

  const sectors: [SectorState, SectorState] =
    action.sectorId === 0 ? [updatedSector, state.sectors[1]] : [state.sectors[0], updatedSector];

  return {
    accepted: true,
    state: {
      ...state,
      treasury: state.treasury - cost,
      sectors
    }
  };
}
