import { advanceClock, type SimulationClock } from "./primitives.js";

export const MIN_SECTOR_COUNT = 2;
export const MAX_SECTOR_COUNT = 6;
export const STARTING_TREASURY_PER_SECTOR = 25;

export type SectorId = 0 | 1 | 2 | 3 | 4 | 5;
export type DefenseResult = "in_progress" | "victory" | "defeat";
export type DefenseStage = "intermission" | "combat";
export type EnemyType = "balanced" | "fast" | "heavy" | "boss";

export interface EnemyArchetypeConfig {
  readonly maxHealth: number;
  readonly speedPerStep: number;
  readonly gateDamage: number;
  readonly reward: number;
  readonly airstrikeCharge: number;
}

export interface WaveSpawn {
  readonly step: number;
  readonly sectorId: SectorId;
  readonly enemyType: EnemyType;
}

export interface WaveConfig {
  readonly spawns: readonly WaveSpawn[];
}

export interface DefenseConfig {
  readonly fixedStepMs: number;
  readonly intermissionDurationMs: number;
  readonly sectorCount: number;
  readonly pathLength: number;
  readonly gateMaxHealth: number;
  readonly baseDefenseDamage: number;
  readonly damagePerUpgrade: number;
  readonly maxDefenseLevel: number;
  readonly repairCost: number;
  readonly repairAmount: number;
  readonly upgradeBaseCost: number;
  readonly upgradeCostStep: number;
  readonly enemyArchetypes: Readonly<Record<EnemyType, EnemyArchetypeConfig>>;
  readonly waves: readonly WaveConfig[];
  readonly airstrike: {
    readonly chargeRequired: number;
    readonly damage: number;
  };
}

export interface SectorState {
  readonly sectorId: SectorId;
  readonly gateHealth: number;
  readonly defenseLevel: number;
}

export interface EnemyState {
  readonly enemyId: string;
  readonly sectorId: SectorId;
  readonly enemyType: EnemyType;
  readonly health: number;
  readonly maxHealth: number;
  readonly progress: number;
}

export interface AirstrikeEffect {
  readonly sequence: number;
  readonly actionId: string;
  readonly playerId: string;
  readonly targetSectorId: SectorId;
  readonly appliedTick: number;
}

export interface DefenseState {
  readonly seed: number;
  readonly clock: SimulationClock;
  readonly treasury: number;
  readonly result: DefenseResult;
  readonly stage: DefenseStage;
  readonly waveNumber: number;
  readonly waveStep: number;
  readonly intermissionRemainingSteps: number;
  readonly sectors: readonly SectorState[];
  readonly enemies: readonly EnemyState[];
  readonly nextSpawnIndex: number;
  readonly enemySequence: number;
  readonly airstrikeCharge: number;
  readonly lastAirstrikeEffect: AirstrikeEffect | null;
}

export type DefenseAction =
  | { readonly type: "repair"; readonly sectorId: SectorId }
  | { readonly type: "upgrade"; readonly sectorId: SectorId }
  | {
      readonly type: "airstrike";
      readonly sourceSectorId: SectorId;
      readonly targetSectorId: SectorId;
      readonly actionId: string;
      readonly playerId: string;
    };

export type DefenseActionRejection = "battle_finished" | "insufficient_funds" | "not_available";

export type DefenseActionResult =
  | { readonly accepted: true; readonly state: DefenseState }
  | {
      readonly accepted: false;
      readonly reason: DefenseActionRejection;
      readonly state: DefenseState;
    };

interface WaveSpawnTemplate {
  readonly step: number;
  readonly enemyType: EnemyType;
}

const enemyTypes: readonly EnemyType[] = ["balanced", "fast", "heavy", "boss"];

const prototypeWaveTemplates: readonly (readonly WaveSpawnTemplate[])[] = [
  [
    { step: 1, enemyType: "balanced" },
    { step: 5, enemyType: "balanced" }
  ],
  [
    { step: 1, enemyType: "fast" },
    { step: 4, enemyType: "balanced" },
    { step: 7, enemyType: "fast" }
  ],
  [
    { step: 1, enemyType: "heavy" },
    { step: 4, enemyType: "fast" },
    { step: 8, enemyType: "balanced" }
  ],
  [
    { step: 1, enemyType: "heavy" },
    { step: 3, enemyType: "fast" },
    { step: 6, enemyType: "heavy" },
    { step: 9, enemyType: "balanced" }
  ],
  [
    { step: 1, enemyType: "heavy" },
    { step: 4, enemyType: "fast" },
    { step: 7, enemyType: "boss" },
    { step: 10, enemyType: "heavy" }
  ]
];

const prototypeEnemyArchetypes: Readonly<Record<EnemyType, EnemyArchetypeConfig>> = {
  balanced: {
    maxHealth: 18,
    speedPerStep: 1,
    gateDamage: 15,
    reward: 8,
    airstrikeCharge: 14
  },
  fast: {
    maxHealth: 12,
    speedPerStep: 2,
    gateDamage: 12,
    reward: 7,
    airstrikeCharge: 12
  },
  heavy: {
    maxHealth: 34,
    speedPerStep: 1,
    gateDamage: 24,
    reward: 14,
    airstrikeCharge: 20
  },
  boss: {
    maxHealth: 90,
    speedPerStep: 1,
    gateDamage: 45,
    reward: 40,
    airstrikeCharge: 35
  }
};

export function createPrototypeDefenseConfig(sectorCount: number): DefenseConfig {
  assertSectorCount(sectorCount);

  const waves = prototypeWaveTemplates.map((template) => ({
    spawns: expandWaveTemplate(template, sectorCount)
  }));

  const config: DefenseConfig = {
    fixedStepMs: 1000,
    intermissionDurationMs: 10_000,
    sectorCount,
    pathLength: 12,
    gateMaxHealth: 100,
    baseDefenseDamage: 4,
    damagePerUpgrade: 2,
    maxDefenseLevel: 4,
    repairCost: 15,
    repairAmount: 20,
    upgradeBaseCost: 20,
    upgradeCostStep: 10,
    enemyArchetypes: prototypeEnemyArchetypes,
    waves,
    airstrike: {
      chargeRequired: 100,
      damage: 30
    }
  };

  validateDefenseConfig(config);
  return config;
}

export const prototypeDefenseConfig: DefenseConfig = createPrototypeDefenseConfig(2);

export function isSectorId(value: number): value is SectorId {
  return Number.isSafeInteger(value) && value >= 0 && value < MAX_SECTOR_COUNT;
}

export function isSectorIdInDefense(value: number, sectorCount: number): value is SectorId {
  return isValidSectorCount(sectorCount) && isSectorId(value) && value < sectorCount;
}

export function getAirstrikeTargetSectorIds(
  sourceSectorId: SectorId,
  sectorCount: number
): readonly SectorId[] {
  assertSectorCount(sectorCount);
  if (!isSectorIdInDefense(sourceSectorId, sectorCount)) {
    throw new RangeError("sourceSectorId must exist in the defense");
  }

  const candidates = [
    sourceSectorId,
    (sourceSectorId - 1 + sectorCount) % sectorCount,
    (sourceSectorId + 1) % sectorCount
  ];
  const uniqueTargets: SectorId[] = [];

  for (const candidate of candidates) {
    if (!isSectorIdInDefense(candidate, sectorCount)) {
      throw new RangeError("airstrike target calculation produced an invalid sector");
    }
    if (!uniqueTargets.includes(candidate)) {
      uniqueTargets.push(candidate);
    }
  }

  return uniqueTargets;
}

export function isAirstrikeTargetAllowed(
  sourceSectorId: number,
  targetSectorId: number,
  sectorCount: number
): boolean {
  if (
    !isSectorIdInDefense(sourceSectorId, sectorCount) ||
    !isSectorIdInDefense(targetSectorId, sectorCount)
  ) {
    return false;
  }

  return getAirstrikeTargetSectorIds(sourceSectorId, sectorCount).includes(targetSectorId);
}

export function validateDefenseConfig(config: DefenseConfig): void {
  assertSectorCount(config.sectorCount);
  if (config.waves.length !== 5) {
    throw new RangeError("waves must contain exactly 5 entries");
  }

  const positiveIntegers: [string, number][] = [
    ["fixedStepMs", config.fixedStepMs],
    ["intermissionDurationMs", config.intermissionDurationMs],
    ["pathLength", config.pathLength],
    ["gateMaxHealth", config.gateMaxHealth],
    ["baseDefenseDamage", config.baseDefenseDamage],
    ["damagePerUpgrade", config.damagePerUpgrade],
    ["maxDefenseLevel", config.maxDefenseLevel],
    ["repairCost", config.repairCost],
    ["repairAmount", config.repairAmount],
    ["upgradeBaseCost", config.upgradeBaseCost],
    ["upgradeCostStep", config.upgradeCostStep],
    ["airstrike.chargeRequired", config.airstrike.chargeRequired],
    ["airstrike.damage", config.airstrike.damage]
  ];

  for (const enemyType of enemyTypes) {
    const archetype = config.enemyArchetypes[enemyType];
    positiveIntegers.push(
      [`enemyArchetypes.${enemyType}.maxHealth`, archetype.maxHealth],
      [`enemyArchetypes.${enemyType}.speedPerStep`, archetype.speedPerStep],
      [`enemyArchetypes.${enemyType}.gateDamage`, archetype.gateDamage],
      [`enemyArchetypes.${enemyType}.reward`, archetype.reward],
      [`enemyArchetypes.${enemyType}.airstrikeCharge`, archetype.airstrikeCharge]
    );
  }

  for (const [name, value] of positiveIntegers) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }

  if (config.intermissionDurationMs % config.fixedStepMs !== 0) {
    throw new RangeError("intermissionDurationMs must be divisible by fixedStepMs");
  }

  const bossSectors = new Set<SectorId>();
  config.waves.forEach((wave, waveIndex) => {
    let previousStep = 0;
    for (const spawn of wave.spawns) {
      if (!Number.isSafeInteger(spawn.step) || spawn.step < 1) {
        throw new RangeError("spawn.step must be a positive safe integer");
      }
      if (spawn.step < previousStep) {
        throw new RangeError("wave spawns must be sorted by step");
      }
      if (!isSectorIdInDefense(spawn.sectorId, config.sectorCount)) {
        throw new RangeError("spawn.sectorId must exist in the defense");
      }
      if (!enemyTypes.includes(spawn.enemyType)) {
        throw new RangeError("spawn.enemyType is unknown");
      }
      if (spawn.enemyType === "boss") {
        if (waveIndex !== 4) {
          throw new RangeError("boss may only spawn in wave 5");
        }
        if (bossSectors.has(spawn.sectorId)) {
          throw new RangeError("wave 5 must contain exactly one boss per sector");
        }
        bossSectors.add(spawn.sectorId);
      }
      previousStep = spawn.step;
    }
  });

  if (bossSectors.size !== config.sectorCount) {
    throw new RangeError("wave 5 must contain exactly one boss per sector");
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
    treasury: STARTING_TREASURY_PER_SECTOR * config.sectorCount,
    result: "in_progress",
    stage: "intermission",
    waveNumber: 1,
    waveStep: 0,
    intermissionRemainingSteps: config.intermissionDurationMs / config.fixedStepMs,
    sectors: createSectorIds(config.sectorCount).map((sectorId) => ({
      sectorId,
      gateHealth: config.gateMaxHealth,
      defenseLevel: 1
    })),
    enemies: [],
    nextSpawnIndex: 0,
    enemySequence: 0,
    airstrikeCharge: 0,
    lastAirstrikeEffect: null
  };
}

export function getDefenseDamage(config: DefenseConfig, level: number): number {
  return config.baseDefenseDamage + (level - 1) * config.damagePerUpgrade;
}

export function getUpgradeCost(config: DefenseConfig, currentLevel: number): number {
  return config.upgradeBaseCost + (currentLevel - 1) * config.upgradeCostStep;
}

export function getIntermissionRemainingSeconds(
  state: DefenseState,
  config: DefenseConfig
): number {
  return Math.ceil((state.intermissionRemainingSteps * config.fixedStepMs) / 1000);
}

export function advanceDefense(state: DefenseState, config: DefenseConfig): DefenseState {
  if (state.result !== "in_progress") {
    return state;
  }

  const clock = advanceClock(state.clock, config.fixedStepMs);
  if (state.stage === "intermission") {
    const remaining = Math.max(0, state.intermissionRemainingSteps - 1);
    return {
      ...state,
      clock,
      stage: remaining === 0 ? "combat" : "intermission",
      intermissionRemainingSteps: remaining,
      waveStep: 0
    };
  }

  const wave = config.waves[state.waveNumber - 1];
  if (wave === undefined) {
    throw new RangeError("state waveNumber has no configuration");
  }

  const waveStep = state.waveStep + 1;
  const enemies = state.enemies.map((enemy) => ({ ...enemy }));
  let nextSpawnIndex = state.nextSpawnIndex;
  let enemySequence = state.enemySequence;
  let treasury = state.treasury;
  let airstrikeCharge = state.airstrikeCharge;

  while (wave.spawns[nextSpawnIndex]?.step === waveStep) {
    const spawn = wave.spawns[nextSpawnIndex];
    if (spawn === undefined) {
      break;
    }
    const archetype = config.enemyArchetypes[spawn.enemyType];
    enemies.push({
      enemyId: `enemy-${String(enemySequence)}`,
      sectorId: spawn.sectorId,
      enemyType: spawn.enemyType,
      health: archetype.maxHealth,
      maxHealth: archetype.maxHealth,
      progress: 0
    });
    nextSpawnIndex += 1;
    enemySequence += 1;
  }

  const survivingAfterAttack: EnemyState[] = [];
  for (const sector of state.sectors) {
    const candidates = enemies.filter((enemy) => enemy.sectorId === sector.sectorId);
    const target = candidates.reduce<EnemyState | undefined>(
      (nearest, enemy) =>
        nearest === undefined || enemy.progress > nearest.progress ? enemy : nearest,
      undefined
    );

    for (const enemy of candidates) {
      if (enemy.enemyId !== target?.enemyId) {
        survivingAfterAttack.push(enemy);
        continue;
      }

      const health = enemy.health - getDefenseDamage(config, sector.defenseLevel);
      if (health <= 0) {
        const reward = rewardForEnemy(config, enemy);
        treasury += reward.treasury;
        airstrikeCharge = Math.min(
          config.airstrike.chargeRequired,
          airstrikeCharge + reward.airstrikeCharge
        );
      } else {
        survivingAfterAttack.push({ ...enemy, health });
      }
    }
  }

  const gateHealthBySector = new Map(
    state.sectors.map((sector) => [sector.sectorId, sector.gateHealth] as const)
  );
  const activeEnemies: EnemyState[] = [];

  for (const enemy of survivingAfterAttack) {
    const archetype = config.enemyArchetypes[enemy.enemyType];
    const progress = enemy.progress + archetype.speedPerStep;
    if (progress >= config.pathLength) {
      const gateHealth = gateHealthBySector.get(enemy.sectorId);
      if (gateHealth === undefined) {
        throw new RangeError("enemy references a missing sector");
      }
      gateHealthBySector.set(enemy.sectorId, Math.max(0, gateHealth - archetype.gateDamage));
    } else {
      activeEnemies.push({ ...enemy, progress });
    }
  }

  const sectors = state.sectors.map((sector) => ({
    ...sector,
    gateHealth: gateHealthBySector.get(sector.sectorId) ?? sector.gateHealth
  }));
  const defeated = sectors.some((sector) => sector.gateHealth === 0);
  const waveCleared = nextSpawnIndex === wave.spawns.length && activeEnemies.length === 0;

  if (defeated) {
    return {
      ...state,
      clock,
      treasury,
      result: "defeat",
      waveStep,
      sectors,
      enemies: activeEnemies,
      nextSpawnIndex,
      enemySequence,
      airstrikeCharge
    };
  }

  if (waveCleared && state.waveNumber === config.waves.length) {
    return {
      ...state,
      clock,
      treasury,
      result: "victory",
      waveStep,
      sectors,
      enemies: activeEnemies,
      nextSpawnIndex,
      enemySequence,
      airstrikeCharge
    };
  }

  if (waveCleared) {
    return {
      ...state,
      clock,
      treasury,
      stage: "intermission",
      waveNumber: state.waveNumber + 1,
      waveStep: 0,
      intermissionRemainingSteps: config.intermissionDurationMs / config.fixedStepMs,
      sectors,
      enemies: [],
      nextSpawnIndex: 0,
      enemySequence,
      airstrikeCharge
    };
  }

  return {
    ...state,
    clock,
    treasury,
    waveStep,
    sectors,
    enemies: activeEnemies,
    nextSpawnIndex,
    enemySequence,
    airstrikeCharge
  };
}

export function applyDefenseAction(
  state: DefenseState,
  config: DefenseConfig,
  action: DefenseAction
): DefenseActionResult {
  if (state.result !== "in_progress") {
    return { accepted: false, reason: "battle_finished", state };
  }

  if (action.type === "airstrike") {
    return applyAirstrike(state, config, action);
  }

  const sectorIndex = state.sectors.findIndex((sector) => sector.sectorId === action.sectorId);
  const sector = state.sectors[sectorIndex];
  if (
    sectorIndex < 0 ||
    sector === undefined ||
    !isSectorIdInDefense(action.sectorId, config.sectorCount)
  ) {
    return { accepted: false, reason: "not_available", state };
  }

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

  return {
    accepted: true,
    state: {
      ...state,
      treasury: state.treasury - cost,
      sectors: state.sectors.map((currentSector, index) =>
        index === sectorIndex ? updatedSector : currentSector
      )
    }
  };
}

function applyAirstrike(
  state: DefenseState,
  config: DefenseConfig,
  action: Extract<DefenseAction, { type: "airstrike" }>
): DefenseActionResult {
  const targetAllowed = isAirstrikeTargetAllowed(
    action.sourceSectorId,
    action.targetSectorId,
    config.sectorCount
  );
  const targets = targetAllowed
    ? state.enemies.filter((enemy) => enemy.sectorId === action.targetSectorId)
    : [];

  if (
    !targetAllowed ||
    state.stage !== "combat" ||
    state.airstrikeCharge < config.airstrike.chargeRequired ||
    targets.length === 0
  ) {
    return { accepted: false, reason: "not_available", state };
  }

  let treasury = state.treasury;
  let airstrikeCharge = 0;
  const enemies: EnemyState[] = [];

  for (const enemy of state.enemies) {
    if (enemy.sectorId !== action.targetSectorId) {
      enemies.push(enemy);
      continue;
    }

    const health = enemy.health - config.airstrike.damage;
    if (health > 0) {
      enemies.push({ ...enemy, health });
      continue;
    }

    const reward = rewardForEnemy(config, enemy);
    treasury += reward.treasury;
    airstrikeCharge = Math.min(
      config.airstrike.chargeRequired,
      airstrikeCharge + reward.airstrikeCharge
    );
  }

  return {
    accepted: true,
    state: {
      ...state,
      treasury,
      enemies,
      airstrikeCharge,
      lastAirstrikeEffect: {
        sequence: (state.lastAirstrikeEffect?.sequence ?? 0) + 1,
        actionId: action.actionId,
        playerId: action.playerId,
        targetSectorId: action.targetSectorId,
        appliedTick: state.clock.tick
      }
    }
  };
}

function expandWaveTemplate(
  template: readonly WaveSpawnTemplate[],
  sectorCount: number
): readonly WaveSpawn[] {
  return template.flatMap(({ step, enemyType }) =>
    createSectorIds(sectorCount).map((sectorId) => ({ step, sectorId, enemyType }))
  );
}

function createSectorIds(sectorCount: number): readonly SectorId[] {
  assertSectorCount(sectorCount);
  return Array.from({ length: sectorCount }, (_, sectorId) => {
    if (!isSectorId(sectorId)) {
      throw new RangeError("sector builder produced an invalid sector");
    }
    return sectorId;
  });
}

function assertSectorCount(sectorCount: number): void {
  if (!isValidSectorCount(sectorCount)) {
    throw new RangeError(
      `sectorCount must be a safe integer from ${String(MIN_SECTOR_COUNT)} to ${String(MAX_SECTOR_COUNT)}`
    );
  }
}

function isValidSectorCount(sectorCount: number): boolean {
  return (
    Number.isSafeInteger(sectorCount) &&
    sectorCount >= MIN_SECTOR_COUNT &&
    sectorCount <= MAX_SECTOR_COUNT
  );
}

function rewardForEnemy(
  config: DefenseConfig,
  enemy: EnemyState
): { treasury: number; airstrikeCharge: number } {
  const archetype = config.enemyArchetypes[enemy.enemyType];
  return { treasury: archetype.reward, airstrikeCharge: archetype.airstrikeCharge };
}
