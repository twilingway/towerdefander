import { advanceClock, type SimulationClock } from "./primitives.js";
import { constrainMovingCircleToArena, isWithinCircularEnvelope } from "./arenaGeometry.js";
import {
  advanceCombat,
  assertCombatResultInvariant,
  createInitialCombatState,
  dynamicEntityCount,
  validateCombatConfig,
  validateRunSeed,
  type CombatConfig,
  type CombatStateFields
} from "./combat.js";

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

export interface SpaceshipSimulationConfig extends CombatConfig {
  readonly fixedStepMs: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  /**
   * Presentation only: the narrowest slice of the world the display frames, in
   * world units. The simulation never reads it; it travels with the balance
   * preset the way enemy visuals do.
   */
  readonly cameraViewWidth: number;
  readonly spaceshipSpeedPerSecond: number;
  readonly spaceshipAccelerationPerSecondSquared: number;
  readonly spaceshipBrakingPerSecondSquared: number;
  readonly spaceshipRadius: number;
  readonly inputTimeoutTicks: number;
  readonly projectileSpeedPerSecond: number;
  readonly projectileLifetimeMs: number;
  readonly projectileRadius: number;
  readonly fireCooldownTicks: number;
  readonly shieldCapacity: number;
  readonly shieldDrainPerSecond: number;
  readonly shieldRechargePerSecond: number;
  readonly turretMaxAngularSpeedPerSecond: number;
  readonly turretAngularAccelerationPerSecondSquared: number;
  readonly turretAngularBrakingPerSecondSquared: number;
  readonly shieldMaxAngularSpeedPerSecond: number;
  readonly shieldAngularAccelerationPerSecondSquared: number;
  readonly shieldAngularBrakingPerSecondSquared: number;
  readonly headingMaxAngularSpeedPerSecond: number;
  readonly headingAngularAccelerationPerSecondSquared: number;
  readonly headingAngularBrakingPerSecondSquared: number;
  readonly mgFireCooldownTicks: number;
  readonly mgDamage: number;
  readonly mgProjectileSpeedPerSecond: number;
  readonly mgProjectileRadius: number;
  readonly mgHeatCapacity: number;
  readonly mgHeatPerShot: number;
  readonly mgCoolingPerSecond: number;
  readonly mgRearmThreshold: number;
}

export type FriendlyWeaponSource = "cannon" | "machineGun";

export interface TrustedPilotInput {
  readonly vector: Vector2;
  readonly mgFiring: boolean;
  readonly receivedTick: number;
}

export interface TrustedGunnerInput {
  readonly vector: Vector2;
  readonly firing: boolean;
  readonly receivedTick: number;
}

export interface TrustedShieldInput {
  readonly vector: Vector2;
  readonly active: boolean;
  readonly receivedTick: number;
}

export interface SpaceshipKinematics {
  readonly x: number;
  readonly y: number;
  readonly previousX?: number;
  readonly previousY?: number;
  readonly velocity: Vector2;
}

export interface ProjectileState {
  readonly id: string;
  readonly projectileId: string;
  readonly spawnSequence: number;
  readonly previousX: number;
  readonly previousY: number;
  readonly x: number;
  readonly y: number;
  readonly velocity: Vector2;
  readonly radius: number;
  readonly damage: number;
  readonly spawnedTick: number;
  readonly source: FriendlyWeaponSource;
}

export interface SpaceshipSimulationState extends CombatStateFields {
  readonly clock: SimulationClock;
  readonly spaceship: SpaceshipKinematics;
  readonly turretAngle: number;
  readonly turretTargetAngle: number | null;
  readonly turretAngularVelocity: number;
  readonly shieldAngle: number;
  readonly shieldTargetAngle: number | null;
  readonly shieldAngularVelocity: number;
  readonly shieldActive: boolean;
  readonly shieldEnergy: number;
  readonly shieldRearmRequired: boolean;
  readonly spaceshipHeading: number;
  readonly headingTargetAngle: number | null;
  readonly headingAngularVelocity: number;
  readonly mgHeat: number;
  readonly mgOverheated: boolean;
  readonly queuedMgFire: boolean;
  readonly lastMgFiredTick: number | null;
  readonly inputs: {
    readonly pilot: TrustedPilotInput | null;
    readonly gunner: TrustedGunnerInput | null;
    readonly shield: TrustedShieldInput | null;
  };
  readonly projectiles: readonly ProjectileState[];
  readonly nextProjectileSequence: number;
  readonly lastFiredTick: number | null;
  readonly queuedFire: boolean;
}

const defaultSpaceshipSimulationConfig: SpaceshipSimulationConfig = {
  fixedStepMs: 50,
  worldWidth: 4400,
  worldHeight: 4400,
  cameraViewWidth: 1600,
  arenaRadius: 2200,
  spaceshipSpeedPerSecond: 320,
  spaceshipAccelerationPerSecondSquared: 640,
  spaceshipBrakingPerSecondSquared: 800,
  spaceshipRadius: 52,
  inputTimeoutTicks: 5,
  projectileSpeedPerSecond: 720,
  projectileLifetimeMs: 1500,
  projectileRadius: 8,
  fireCooldownTicks: 5,
  shieldCapacity: 100,
  shieldDrainPerSecond: 20,
  shieldRechargePerSecond: 10,
  turretMaxAngularSpeedPerSecond: (13 * Math.PI) / 30,
  turretAngularAccelerationPerSecondSquared: (13 * Math.PI) / 15,
  turretAngularBrakingPerSecondSquared: (13 * Math.PI) / 10,
  shieldMaxAngularSpeedPerSecond: (13 * Math.PI) / 24,
  shieldAngularAccelerationPerSecondSquared: (13 * Math.PI) / 12,
  shieldAngularBrakingPerSecondSquared: (13 * Math.PI) / 8,
  headingMaxAngularSpeedPerSecond: (13 * Math.PI) / 15,
  headingAngularAccelerationPerSecondSquared: (26 * Math.PI) / 15,
  headingAngularBrakingPerSecondSquared: (13 * Math.PI) / 5,
  mgFireCooldownTicks: 2,
  mgDamage: 8,
  mgProjectileSpeedPerSecond: 900,
  mgProjectileRadius: 5,
  mgHeatCapacity: 100,
  mgHeatPerShot: 4,
  mgCoolingPerSecond: 30,
  mgRearmThreshold: 30,
  spaceshipMaxHp: 500,
  shieldRadius: 104,
  shieldArcRadians: Math.PI / 2,
  asteroidShieldHitCost: 20,
  asteroidDamage: 40,
  friendlyProjectileDamage: 25,
  enemySpawnIntervalTicks: 12,
  ambientAsteroidIntervalMinTicks: 40,
  ambientAsteroidIntervalMaxTicks: 100,
  intermissionTicks: 600,
  waveCampaign: {
    waves: [],
    director: {
      baseBudget: 5,
      budgetGrowth: 2,
      budgetCap: 120,
      hpGrowth: 0.12,
      hpMultiplierCap: 8,
      tempoGrowth: 0.05,
      tempoMultiplierCap: 3,
      bossWaveInterval: 5
    }
  },
  enemyArchetypes: {
    gunship: {
      hp: 50,
      radius: 28,
      speedPerSecond: 150,
      preferredDistance: 650,
      weapons: [
        {
          kind: "bullet",
          cooldownTicks: 30,
          damage: 10,
          shieldHitCost: 4,
          projectileRadius: 7,
          projectileSpeedPerSecond: 440,
          projectileLifetimeTicks: 180,
          engagementRange: 1200,
          turnRatePerSecond: Math.PI / 2,
          burstCount: 1,
          burstSpreadRadians: 0
        }
      ],
      visual: {
        shape: "arrowhead",
        color: "#e65f4b",
        outline: "#ffd1b0",
        modelScale: 1,
        showHealthBar: false
      },
      label: "Ганшип",
      spawnPolicy: "standard",
      spawnCost: 2,
      unlockWave: 1,
      scoreReward: 25,
      creditReward: 2
    },
    missileCarrier: {
      hp: 110,
      radius: 38,
      speedPerSecond: 95,
      preferredDistance: 900,
      weapons: [
        {
          kind: "missile",
          cooldownTicks: 70,
          damage: 30,
          shieldHitCost: 12,
          projectileRadius: 12,
          projectileSpeedPerSecond: 260,
          projectileLifetimeTicks: 240,
          engagementRange: 1700,
          turnRatePerSecond: Math.PI / 2,
          burstCount: 1,
          burstSpreadRadians: 0
        }
      ],
      visual: {
        shape: "block",
        color: "#aa5bd6",
        outline: "#ffd1b0",
        modelScale: 1,
        showHealthBar: false
      },
      label: "Ракетоносец",
      spawnPolicy: "standard",
      spawnCost: 4,
      unlockWave: 3,
      scoreReward: 25,
      creditReward: 4
    },
    sniper: {
      hp: 70,
      radius: 30,
      speedPerSecond: 70,
      preferredDistance: 1400,
      weapons: [
        {
          kind: "bullet",
          cooldownTicks: 100,
          damage: 35,
          shieldHitCost: 10,
          projectileRadius: 9,
          projectileSpeedPerSecond: 900,
          projectileLifetimeTicks: 120,
          engagementRange: 3000,
          turnRatePerSecond: Math.PI / 2,
          burstCount: 1,
          burstSpreadRadians: 0
        }
      ],
      visual: {
        shape: "diamond",
        color: "#4bb1e6",
        outline: "#d6f0ff",
        modelScale: 1,
        showHealthBar: false
      },
      label: "Снайпер",
      spawnPolicy: "standard",
      spawnCost: 3,
      unlockWave: 5,
      scoreReward: 30,
      creditReward: 3
    },
    interceptor: {
      hp: 22,
      radius: 18,
      speedPerSecond: 260,
      preferredDistance: 320,
      weapons: [
        {
          kind: "bullet",
          cooldownTicks: 12,
          damage: 4,
          shieldHitCost: 2,
          projectileRadius: 5,
          projectileSpeedPerSecond: 520,
          projectileLifetimeTicks: 90,
          engagementRange: 600,
          turnRatePerSecond: Math.PI / 2,
          burstCount: 1,
          burstSpreadRadians: 0
        }
      ],
      visual: {
        shape: "dart",
        color: "#f2c14b",
        outline: "#fff0c2",
        modelScale: 1,
        showHealthBar: false
      },
      label: "Перехватчик",
      spawnPolicy: "standard",
      spawnCost: 1,
      unlockWave: 1,
      scoreReward: 12,
      creditReward: 1
    },
    boss: {
      hp: 900,
      radius: 90,
      speedPerSecond: 60,
      preferredDistance: 700,
      weapons: [
        {
          kind: "missile",
          cooldownTicks: 60,
          damage: 30,
          shieldHitCost: 12,
          projectileRadius: 14,
          projectileSpeedPerSecond: 240,
          projectileLifetimeTicks: 300,
          engagementRange: 1600,
          turnRatePerSecond: Math.PI / 2,
          burstCount: 3,
          burstSpreadRadians: Math.PI / 6
        }
      ],
      visual: {
        shape: "hexagon",
        color: "#8f2f4d",
        outline: "#ffb0c8",
        modelScale: 1,
        showHealthBar: true
      },
      label: "Босс",
      spawnPolicy: "boss",
      spawnCost: 20,
      unlockWave: 10,
      scoreReward: 250,
      creditReward: 30
    }
  },
  asteroidHp: 65,
  asteroidRadius: 34,
  asteroidSpeedPerSecond: 190,
  asteroidLifetimeTicks: 500,
  asteroidSpawnCost: 1,
  asteroidScoreReward: 10,
  asteroidCreditReward: 1,
  missileInterceptScoreReward: 5,
  worldPadding: 256,
  spatialCellSize: 256,
  caps: {
    enemyShips: 40,
    asteroids: 16,
    hostileProjectiles: 96,
    homingMissiles: 12,
    friendlyProjectiles: 32,
    dynamicEntities: 196
  }
};

export function createSpaceshipSimulationConfig(
  overrides: Partial<SpaceshipSimulationConfig> = {}
): SpaceshipSimulationConfig {
  const config = { ...defaultSpaceshipSimulationConfig, ...overrides };
  validateSpaceshipSimulationConfig(config);
  return config;
}

export function validateSpaceshipSimulationConfig(config: SpaceshipSimulationConfig): void {
  validateCombatConfig(config);
  const positiveSafeIntegers: readonly (readonly [string, number])[] = [
    ["fixedStepMs", config.fixedStepMs],
    ["inputTimeoutTicks", config.inputTimeoutTicks],
    ["projectileLifetimeMs", config.projectileLifetimeMs],
    ["fireCooldownTicks", config.fireCooldownTicks],
    ["mgFireCooldownTicks", config.mgFireCooldownTicks]
  ];

  for (const [name, value] of positiveSafeIntegers) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }

  const positiveFiniteNumbers: readonly (readonly [string, number])[] = [
    ["worldWidth", config.worldWidth],
    ["worldHeight", config.worldHeight],
    ["cameraViewWidth", config.cameraViewWidth],
    ["spaceshipSpeedPerSecond", config.spaceshipSpeedPerSecond],
    ["spaceshipAccelerationPerSecondSquared", config.spaceshipAccelerationPerSecondSquared],
    ["spaceshipBrakingPerSecondSquared", config.spaceshipBrakingPerSecondSquared],
    ["spaceshipRadius", config.spaceshipRadius],
    ["projectileSpeedPerSecond", config.projectileSpeedPerSecond],
    ["projectileRadius", config.projectileRadius],
    ["shieldCapacity", config.shieldCapacity],
    ["shieldDrainPerSecond", config.shieldDrainPerSecond],
    ["shieldRechargePerSecond", config.shieldRechargePerSecond],
    ["turretMaxAngularSpeedPerSecond", config.turretMaxAngularSpeedPerSecond],
    ["turretAngularAccelerationPerSecondSquared", config.turretAngularAccelerationPerSecondSquared],
    ["turretAngularBrakingPerSecondSquared", config.turretAngularBrakingPerSecondSquared],
    ["shieldMaxAngularSpeedPerSecond", config.shieldMaxAngularSpeedPerSecond],
    ["shieldAngularAccelerationPerSecondSquared", config.shieldAngularAccelerationPerSecondSquared],
    ["shieldAngularBrakingPerSecondSquared", config.shieldAngularBrakingPerSecondSquared],
    ["headingMaxAngularSpeedPerSecond", config.headingMaxAngularSpeedPerSecond],
    [
      "headingAngularAccelerationPerSecondSquared",
      config.headingAngularAccelerationPerSecondSquared
    ],
    ["headingAngularBrakingPerSecondSquared", config.headingAngularBrakingPerSecondSquared],
    ["mgDamage", config.mgDamage],
    ["mgProjectileSpeedPerSecond", config.mgProjectileSpeedPerSecond],
    ["mgProjectileRadius", config.mgProjectileRadius],
    ["mgHeatCapacity", config.mgHeatCapacity],
    ["mgHeatPerShot", config.mgHeatPerShot]
  ];

  for (const [name, value] of positiveFiniteNumbers) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number`);
    }
  }

  const nonNegativeFiniteNumbers: readonly (readonly [string, number])[] = [
    ["mgCoolingPerSecond", config.mgCoolingPerSecond],
    ["mgRearmThreshold", config.mgRearmThreshold]
  ];

  for (const [name, value] of nonNegativeFiniteNumbers) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative finite number`);
    }
  }

  if (config.mgRearmThreshold > config.mgHeatCapacity) {
    throw new RangeError("mgRearmThreshold cannot exceed mgHeatCapacity");
  }

  if (config.arenaRadius < config.spaceshipRadius) {
    throw new RangeError("arenaRadius must fit the spaceship radius");
  }
}

export function createSpaceshipSimulationState(
  config: SpaceshipSimulationConfig,
  runSeed: number
): SpaceshipSimulationState {
  return createCleanSpaceshipRun(config, runSeed);
}

export function createCleanSpaceshipRun(
  config: SpaceshipSimulationConfig,
  runSeed: number
): SpaceshipSimulationState {
  validateSpaceshipSimulationConfig(config);
  validateRunSeed(runSeed);

  return {
    ...createInitialCombatState(config, runSeed),
    clock: { tick: 0, elapsedMs: 0 },
    spaceship: {
      x: config.worldWidth / 2,
      y: config.worldHeight / 2,
      previousX: config.worldWidth / 2,
      previousY: config.worldHeight / 2,
      velocity: { x: 0, y: 0 }
    },
    turretAngle: 0,
    turretTargetAngle: null,
    turretAngularVelocity: 0,
    shieldAngle: 0,
    shieldTargetAngle: null,
    shieldAngularVelocity: 0,
    shieldActive: false,
    shieldEnergy: config.shieldCapacity,
    shieldRearmRequired: false,
    spaceshipHeading: 0,
    headingTargetAngle: null,
    headingAngularVelocity: 0,
    mgHeat: 0,
    mgOverheated: false,
    queuedMgFire: false,
    lastMgFiredTick: null,
    inputs: {
      pilot: null,
      gunner: null,
      shield: null
    },
    projectiles: [],
    nextProjectileSequence: 0,
    lastFiredTick: null,
    queuedFire: false
  };
}

export function normalizeVector(vector: Vector2): Vector2 {
  assertFiniteVector(vector);
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0 || length <= 1) {
    return { x: vector.x, y: vector.y };
  }

  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

export function applyPilotInput(
  state: SpaceshipSimulationState,
  input: TrustedPilotInput
): SpaceshipSimulationState {
  assertReceivedTick(state, input.receivedTick);
  const vector = normalizeVector(input.vector);
  const isRisingMgEdge = input.mgFiring && state.inputs.pilot?.mgFiring !== true;
  return {
    ...state,
    queuedMgFire: state.queuedMgFire || isRisingMgEdge,
    headingTargetAngle: isZeroVector(vector)
      ? state.headingTargetAngle
      : canonicalizeAngle(Math.atan2(vector.y, vector.x)),
    inputs: {
      ...state.inputs,
      pilot: { vector, mgFiring: input.mgFiring, receivedTick: input.receivedTick }
    }
  };
}

export function applyGunnerInput(
  state: SpaceshipSimulationState,
  input: TrustedGunnerInput
): SpaceshipSimulationState {
  assertReceivedTick(state, input.receivedTick);
  const firing = input.firing;
  const isRisingEdge = firing && state.inputs.gunner?.firing !== true;
  const vector = normalizeVector(input.vector);
  return {
    ...state,
    queuedFire: state.queuedFire || isRisingEdge,
    turretTargetAngle: isZeroVector(vector)
      ? state.turretTargetAngle
      : canonicalizeAngle(Math.atan2(vector.y, vector.x)),
    inputs: {
      ...state.inputs,
      gunner: {
        vector,
        firing,
        receivedTick: input.receivedTick
      }
    }
  };
}

export function applyShieldInput(
  state: SpaceshipSimulationState,
  input: TrustedShieldInput
): SpaceshipSimulationState {
  assertReceivedTick(state, input.receivedTick);
  const vector = normalizeVector(input.vector);
  return {
    ...state,
    shieldRearmRequired: input.active && (state.shieldRearmRequired || state.shieldEnergy <= 0),
    shieldTargetAngle: isZeroVector(vector)
      ? state.shieldTargetAngle
      : canonicalizeAngle(Math.atan2(vector.y, vector.x)),
    inputs: {
      ...state.inputs,
      shield: {
        vector,
        active: input.active,
        receivedTick: input.receivedTick
      }
    }
  };
}

/** Clears a pending fire edge at the authoritative disconnect boundary. */
export function cancelQueuedFire(state: SpaceshipSimulationState): SpaceshipSimulationState {
  return state.queuedFire ? { ...state, queuedFire: false } : state;
}

/** Turns off the authoritative shield immediately at a trusted disconnect boundary. */
export function deactivateShield(state: SpaceshipSimulationState): SpaceshipSimulationState {
  return state.shieldActive ? { ...state, shieldActive: false } : state;
}

/** Cancels every gunner intent owned by a disconnected trusted connection. */
export function cancelGunnerControl(state: SpaceshipSimulationState): SpaceshipSimulationState {
  return {
    ...state,
    turretTargetAngle: null,
    queuedFire: false,
    inputs: {
      ...state.inputs,
      gunner:
        state.inputs.gunner === null
          ? null
          : { ...state.inputs.gunner, vector: ZERO, firing: false }
    }
  };
}

/** Cancels every shield intent owned by a disconnected trusted connection. */
export function cancelShieldControl(state: SpaceshipSimulationState): SpaceshipSimulationState {
  return {
    ...state,
    shieldTargetAngle: null,
    shieldActive: false,
    shieldRearmRequired: false,
    inputs: {
      ...state.inputs,
      shield:
        state.inputs.shield === null
          ? null
          : { ...state.inputs.shield, vector: ZERO, active: false }
    }
  };
}

/** Cancels every pilot intent owned by a disconnected trusted connection. */
export function cancelPilotControl(state: SpaceshipSimulationState): SpaceshipSimulationState {
  return {
    ...state,
    headingTargetAngle: null,
    queuedMgFire: false,
    inputs: {
      ...state.inputs,
      pilot:
        state.inputs.pilot === null
          ? null
          : { ...state.inputs.pilot, vector: ZERO, mgFiring: false }
    }
  };
}

export function advanceSpaceshipSimulation(
  state: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig
): SpaceshipSimulationState {
  validateSpaceshipSimulationConfig(config);
  assertCombatResultInvariant(state);
  if (state.encounterPhase === "result") {
    return state;
  }
  const clock = advanceClock(state.clock, config.fixedStepMs);
  if (state.encounterPhase === "intermission") {
    return advanceCombatInSpaceshipSimulation(
      { ...neutralizeCombatControls(state), clock },
      config
    );
  }
  const pilotFresh = isFresh(clock.tick, state.inputs.pilot, config.inputTimeoutTicks);
  const gunnerFresh = isFresh(clock.tick, state.inputs.gunner, config.inputTimeoutTicks);
  const shieldFresh = isFresh(clock.tick, state.inputs.shield, config.inputTimeoutTicks);
  const pilotVector = pilotFresh && state.inputs.pilot !== null ? state.inputs.pilot.vector : ZERO;
  const inputs = {
    pilot:
      pilotFresh || state.inputs.pilot === null
        ? state.inputs.pilot
        : { ...state.inputs.pilot, vector: ZERO, mgFiring: false },
    gunner:
      gunnerFresh || state.inputs.gunner === null
        ? state.inputs.gunner
        : { ...state.inputs.gunner, firing: false },
    shield: state.inputs.shield
  };
  const secondsPerStep = config.fixedStepMs / 1000;
  const targetVelocity = {
    x: pilotVector.x * config.spaceshipSpeedPerSecond * state.roleModifiers.pilot.speedMultiplier,
    y: pilotVector.y * config.spaceshipSpeedPerSecond * state.roleModifiers.pilot.speedMultiplier
  };
  const velocityDelta =
    pilotVector.x === 0 && pilotVector.y === 0
      ? config.spaceshipBrakingPerSecondSquared * secondsPerStep
      : config.spaceshipAccelerationPerSecondSquared *
        state.roleModifiers.pilot.accelerationMultiplier *
        secondsPerStep;
  const nextVelocity = moveVectorTowards(state.spaceship.velocity, targetVelocity, velocityDelta);
  const spaceship = moveSpaceshipWithinWorld(state.spaceship, nextVelocity, secondsPerStep, config);

  const turretTargetAngle = gunnerFresh ? state.turretTargetAngle : null;
  const shieldTargetAngle = shieldFresh ? state.shieldTargetAngle : null;
  const headingTargetAngle = pilotFresh ? state.headingTargetAngle : null;
  const turretTraverse = advanceAngularTraverse(
    {
      angle: state.turretAngle,
      targetAngle: turretTargetAngle,
      angularVelocity: state.turretAngularVelocity
    },
    {
      maxAngularSpeed: config.turretMaxAngularSpeedPerSecond,
      angularAcceleration: config.turretAngularAccelerationPerSecondSquared,
      angularBraking: config.turretAngularBrakingPerSecondSquared,
      secondsPerStep
    }
  );
  const shieldTraverse = advanceAngularTraverse(
    {
      angle: state.shieldAngle,
      targetAngle: shieldTargetAngle,
      angularVelocity: state.shieldAngularVelocity
    },
    {
      maxAngularSpeed: config.shieldMaxAngularSpeedPerSecond,
      angularAcceleration: config.shieldAngularAccelerationPerSecondSquared,
      angularBraking: config.shieldAngularBrakingPerSecondSquared,
      secondsPerStep
    }
  );
  const headingTraverse = advanceAngularTraverse(
    {
      angle: state.spaceshipHeading,
      targetAngle: headingTargetAngle,
      angularVelocity: state.headingAngularVelocity
    },
    {
      maxAngularSpeed: config.headingMaxAngularSpeedPerSecond,
      angularAcceleration: config.headingAngularAccelerationPerSecondSquared,
      angularBraking: config.headingAngularBrakingPerSecondSquared,
      secondsPerStep
    }
  );
  const shieldDesiredActive = state.inputs.shield?.active === true;
  const shieldCanActivate = !state.shieldRearmRequired && state.shieldEnergy > 0;
  const shieldWasActive = shieldDesiredActive && shieldCanActivate;
  const shieldCapacity = config.shieldCapacity + state.roleModifiers.shield.capacityBonus;
  const shieldEnergy = shieldWasActive
    ? clamp(state.shieldEnergy - config.shieldDrainPerSecond * secondsPerStep, 0, shieldCapacity)
    : clamp(
        state.shieldEnergy +
          config.shieldRechargePerSecond *
            state.roleModifiers.shield.rechargeMultiplier *
            secondsPerStep,
        0,
        shieldCapacity
      );
  const shieldDepleted = shieldWasActive && shieldEnergy === 0;
  const shieldActive = shieldWasActive && !shieldDepleted;
  const shieldRearmRequired = state.shieldRearmRequired || shieldDepleted;
  const movedProjectiles = moveProjectiles(state.projectiles, config);
  const projectiles = [...movedProjectiles];
  let nextProjectileSequence = state.nextProjectileSequence;
  let nextSpawnSequence = state.nextSpawnSequence;
  let lastFiredTick = state.lastFiredTick;
  let queuedFire = state.queuedFire;
  let lastMgFiredTick = state.lastMgFiredTick;
  let queuedMgFire = state.queuedMgFire;
  let mgHeat = state.mgHeat;

  const canCreateFriendlyProjectile = (list: readonly ProjectileState[]) =>
    list.length < config.caps.friendlyProjectiles &&
    dynamicEntityCount({ ...state, projectiles: list }) < config.caps.dynamicEntities;

  const gunnerCooldownTicks = Math.max(
    1,
    Math.ceil(config.fireCooldownTicks * state.roleModifiers.gunner.cooldownMultiplier)
  );
  const gunnerEligible =
    (state.queuedFire || (gunnerFresh && state.inputs.gunner?.firing === true)) &&
    (state.lastFiredTick === null || clock.tick - state.lastFiredTick >= gunnerCooldownTicks);

  if (gunnerEligible) {
    if (canCreateFriendlyProjectile(projectiles)) {
      const direction = { x: Math.cos(turretTraverse.angle), y: Math.sin(turretTraverse.angle) };
      projectiles.push({
        id: `projectile-${String(nextProjectileSequence)}`,
        projectileId: `projectile-${String(nextProjectileSequence)}`,
        spawnSequence: nextSpawnSequence,
        previousX: spaceship.x + direction.x * (config.spaceshipRadius + config.projectileRadius),
        previousY: spaceship.y + direction.y * (config.spaceshipRadius + config.projectileRadius),
        x: spaceship.x + direction.x * (config.spaceshipRadius + config.projectileRadius),
        y: spaceship.y + direction.y * (config.spaceshipRadius + config.projectileRadius),
        velocity: {
          x:
            direction.x *
            config.projectileSpeedPerSecond *
            state.roleModifiers.gunner.projectileSpeedMultiplier,
          y:
            direction.y *
            config.projectileSpeedPerSecond *
            state.roleModifiers.gunner.projectileSpeedMultiplier
        },
        radius: config.projectileRadius,
        damage: config.friendlyProjectileDamage * state.roleModifiers.gunner.damageMultiplier,
        spawnedTick: clock.tick,
        source: "cannon"
      });
      nextProjectileSequence += 1;
      nextSpawnSequence += 1;
    }
    lastFiredTick = clock.tick;
    queuedFire = false;
  }

  const mgCooldownTicks = Math.max(1, config.mgFireCooldownTicks);
  const mgEligible =
    !state.mgOverheated &&
    (state.queuedMgFire || (pilotFresh && state.inputs.pilot?.mgFiring === true)) &&
    (state.lastMgFiredTick === null || clock.tick - state.lastMgFiredTick >= mgCooldownTicks);

  let mgSpawnedThisTick = false;
  if (mgEligible) {
    if (canCreateFriendlyProjectile(projectiles)) {
      const direction = { x: Math.cos(headingTraverse.angle), y: Math.sin(headingTraverse.angle) };
      const noseOffset = config.spaceshipRadius + config.mgProjectileRadius;
      projectiles.push({
        id: `projectile-${String(nextProjectileSequence)}`,
        projectileId: `projectile-${String(nextProjectileSequence)}`,
        spawnSequence: nextSpawnSequence,
        previousX: spaceship.x + direction.x * noseOffset,
        previousY: spaceship.y + direction.y * noseOffset,
        x: spaceship.x + direction.x * noseOffset,
        y: spaceship.y + direction.y * noseOffset,
        velocity: {
          x: direction.x * config.mgProjectileSpeedPerSecond,
          y: direction.y * config.mgProjectileSpeedPerSecond
        },
        radius: config.mgProjectileRadius,
        damage: config.mgDamage,
        spawnedTick: clock.tick,
        source: "machineGun"
      });
      nextProjectileSequence += 1;
      nextSpawnSequence += 1;
      mgHeat = Math.min(config.mgHeatCapacity, mgHeat + config.mgHeatPerShot);
      mgSpawnedThisTick = true;
    }
    lastMgFiredTick = clock.tick;
    queuedMgFire = false;
  }

  if (!mgSpawnedThisTick) {
    mgHeat = Math.max(0, mgHeat - config.mgCoolingPerSecond * secondsPerStep);
  }
  let mgOverheated = state.mgOverheated;
  if (!mgOverheated && mgHeat >= config.mgHeatCapacity) {
    mgOverheated = true;
  } else if (mgOverheated && mgHeat <= config.mgRearmThreshold) {
    mgOverheated = false;
  }

  const baseState: SpaceshipSimulationState = {
    ...state,
    clock,
    spaceship,
    inputs,
    turretAngle: turretTraverse.angle,
    turretTargetAngle,
    turretAngularVelocity: turretTraverse.angularVelocity,
    shieldAngle: shieldTraverse.angle,
    shieldTargetAngle,
    shieldAngularVelocity: shieldTraverse.angularVelocity,
    shieldActive,
    shieldEnergy,
    shieldRearmRequired,
    spaceshipHeading: headingTraverse.angle,
    headingTargetAngle,
    headingAngularVelocity: headingTraverse.angularVelocity,
    projectiles,
    nextSpawnSequence,
    nextProjectileSequence,
    lastFiredTick,
    queuedFire,
    mgHeat,
    mgOverheated,
    queuedMgFire,
    lastMgFiredTick
  };
  return advanceCombatInSpaceshipSimulation(baseState, config);
}

function advanceCombatInSpaceshipSimulation(
  state: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig
): SpaceshipSimulationState {
  if (state.encounterPhase === "intermission") {
    const neutral = neutralizeCombatControls(state);
    const secondsPerStep = config.fixedStepMs / 1000;
    const mgHeat = Math.max(0, neutral.mgHeat - config.mgCoolingPerSecond * secondsPerStep);
    let mgOverheated = neutral.mgOverheated;
    if (!mgOverheated && mgHeat >= config.mgHeatCapacity) {
      mgOverheated = true;
    } else if (mgOverheated && mgHeat <= config.mgRearmThreshold) {
      mgOverheated = false;
    }
    const recharged = {
      ...neutral,
      shieldEnergy: clamp(
        neutral.shieldEnergy +
          config.shieldRechargePerSecond *
            neutral.roleModifiers.shield.rechargeMultiplier *
            (config.fixedStepMs / 1000),
        0,
        config.shieldCapacity + neutral.roleModifiers.shield.capacityBonus
      ),
      mgHeat,
      mgOverheated
    };
    const result = advanceCombat(rechargedForCombat(recharged, config), config);
    return {
      ...recharged,
      ...result,
      projectiles: removeExpiredProjectiles(
        result.projectiles as readonly ProjectileState[],
        recharged.clock.tick,
        config
      )
    };
  }
  const result = advanceCombat(rechargedForCombat(state, config), config);
  const next: SpaceshipSimulationState = {
    ...state,
    ...result,
    projectiles: removeExpiredProjectiles(
      result.projectiles as readonly ProjectileState[],
      state.clock.tick,
      config
    )
  };
  return result.encounterPhase === "intermission" ? neutralizeCombatControls(next) : next;
}

function rechargedForCombat(state: SpaceshipSimulationState, config: SpaceshipSimulationConfig) {
  return {
    ...state,
    spaceship: {
      ...state.spaceship,
      previousX: state.spaceship.previousX ?? state.spaceship.x,
      previousY: state.spaceship.previousY ?? state.spaceship.y,
      radius: config.spaceshipRadius
    }
  };
}

function neutralizeCombatControls(state: SpaceshipSimulationState): SpaceshipSimulationState {
  return {
    ...state,
    turretTargetAngle: null,
    shieldTargetAngle: null,
    headingTargetAngle: null,
    shieldActive: false,
    queuedFire: false,
    queuedMgFire: false,
    inputs: {
      pilot:
        state.inputs.pilot === null
          ? null
          : { ...state.inputs.pilot, vector: { x: 0, y: 0 }, mgFiring: false },
      gunner:
        state.inputs.gunner === null
          ? null
          : { ...state.inputs.gunner, vector: { x: 0, y: 0 }, firing: false },
      shield:
        state.inputs.shield === null
          ? null
          : { ...state.inputs.shield, vector: { x: 0, y: 0 }, active: false }
    }
  };
}

const ZERO: Vector2 = { x: 0, y: 0 };

export function moveVectorTowards(
  current: Vector2,
  target: Vector2,
  maximumDelta: number
): Vector2 {
  assertFiniteVector(current);
  assertFiniteVector(target);
  if (!Number.isFinite(maximumDelta) || maximumDelta < 0) {
    throw new RangeError("maximumDelta must be a non-negative finite number");
  }

  const deltaX = target.x - current.x;
  const deltaY = target.y - current.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0 || distance <= maximumDelta) {
    return { x: target.x, y: target.y };
  }

  const scale = maximumDelta / distance;
  return {
    x: current.x + deltaX * scale,
    y: current.y + deltaY * scale
  };
}

export function canonicalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) {
    throw new RangeError("angle must be a finite number");
  }

  const wrapped = ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/** Returns the shortest signed delta in (-PI, PI], choosing positive PI at the exact antipode. */
export function shortestAngleDelta(currentAngle: number, targetAngle: number): number {
  const delta = canonicalizeAngle(canonicalizeAngle(targetAngle) - canonicalizeAngle(currentAngle));
  return Math.abs(Math.abs(delta) - Math.PI) <= ANGLE_EPSILON ? Math.PI : delta;
}

export function moveScalarTowards(current: number, target: number, maximumDelta: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target)) {
    throw new RangeError("scalar values must be finite numbers");
  }
  if (!Number.isFinite(maximumDelta) || maximumDelta < 0) {
    throw new RangeError("maximumDelta must be a non-negative finite number");
  }

  if (Math.abs(target - current) <= maximumDelta) {
    return target;
  }
  return current + Math.sign(target - current) * maximumDelta;
}

interface AngularTraverseState {
  readonly angle: number;
  readonly targetAngle: number | null;
  readonly angularVelocity: number;
}

interface AngularTraverseConfig {
  readonly maxAngularSpeed: number;
  readonly angularAcceleration: number;
  readonly angularBraking: number;
  readonly secondsPerStep: number;
}

function advanceAngularTraverse(
  state: AngularTraverseState,
  config: AngularTraverseConfig
): AngularTraverseState {
  const angle = canonicalizeAngle(state.angle);
  if (state.targetAngle === null) {
    const angularVelocity = moveScalarTowards(
      state.angularVelocity,
      0,
      config.angularBraking * config.secondsPerStep
    );
    return {
      angle: canonicalizeAngle(angle + angularVelocity * config.secondsPerStep),
      targetAngle: null,
      angularVelocity
    };
  }

  const targetAngle = canonicalizeAngle(state.targetAngle);
  const delta = shortestAngleDelta(angle, targetAngle);
  if (delta === 0) {
    return { angle: targetAngle, targetAngle, angularVelocity: 0 };
  }

  const desiredSpeedMagnitude = Math.min(
    config.maxAngularSpeed,
    Math.sqrt(2 * config.angularBraking * Math.abs(delta))
  );
  const desiredVelocity = Math.sign(delta) * desiredSpeedMagnitude;
  const accelerating =
    state.angularVelocity === 0 ||
    (Math.sign(state.angularVelocity) === Math.sign(desiredVelocity) &&
      Math.abs(desiredVelocity) > Math.abs(state.angularVelocity));
  const velocityRate = accelerating ? config.angularAcceleration : config.angularBraking;
  const angularVelocity = moveScalarTowards(
    state.angularVelocity,
    desiredVelocity,
    velocityRate * config.secondsPerStep
  );
  const angularStep = angularVelocity * config.secondsPerStep;

  if (Math.sign(angularStep) === Math.sign(delta) && Math.abs(angularStep) >= Math.abs(delta)) {
    return { angle: targetAngle, targetAngle, angularVelocity: 0 };
  }

  return {
    angle: canonicalizeAngle(angle + angularStep),
    targetAngle,
    angularVelocity
  };
}

function moveSpaceshipWithinWorld(
  spaceship: SpaceshipKinematics,
  velocity: Vector2,
  secondsPerStep: number,
  config: SpaceshipSimulationConfig
): SpaceshipKinematics {
  const candidateX = spaceship.x + velocity.x * secondsPerStep;
  const candidateY = spaceship.y + velocity.y * secondsPerStep;
  const constrained = constrainMovingCircleToArena(
    {
      x: candidateX,
      y: candidateY,
      radius: config.spaceshipRadius,
      velocity
    },
    {
      centerX: config.worldWidth / 2,
      centerY: config.worldHeight / 2,
      radius: config.arenaRadius
    }
  );

  return {
    x: constrained.x,
    y: constrained.y,
    previousX: spaceship.x,
    previousY: spaceship.y,
    velocity: constrained.velocity
  };
}

function moveProjectiles(
  projectiles: readonly ProjectileState[],
  config: SpaceshipSimulationConfig
): readonly ProjectileState[] {
  const secondsPerStep = config.fixedStepMs / 1000;

  return projectiles.map((projectile) => ({
    ...projectile,
    previousX: projectile.x,
    previousY: projectile.y,
    x: projectile.x + projectile.velocity.x * secondsPerStep,
    y: projectile.y + projectile.velocity.y * secondsPerStep
  }));
}

function removeExpiredProjectiles(
  projectiles: readonly ProjectileState[],
  currentTick: number,
  config: SpaceshipSimulationConfig
): readonly ProjectileState[] {
  return projectiles.filter(
    (projectile) =>
      (currentTick - projectile.spawnedTick) * config.fixedStepMs < config.projectileLifetimeMs &&
      isWithinCircularEnvelope(
        projectile.x,
        projectile.y,
        projectile.radius,
        {
          centerX: config.worldWidth / 2,
          centerY: config.worldHeight / 2,
          radius: config.arenaRadius
        },
        config.worldPadding
      )
  );
}

function isFresh(
  currentTick: number,
  input: { readonly receivedTick: number } | null,
  timeoutTicks: number
): boolean {
  return input !== null && currentTick - input.receivedTick < timeoutTicks;
}

function isZeroVector(vector: Vector2): boolean {
  return vector.x === 0 && vector.y === 0;
}

function assertFiniteVector(vector: Vector2): void {
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y)) {
    throw new RangeError("vector coordinates must be finite numbers");
  }
}

function assertReceivedTick(state: SpaceshipSimulationState, receivedTick: number): void {
  if (!Number.isSafeInteger(receivedTick) || receivedTick < 0) {
    throw new RangeError("receivedTick must be a non-negative safe integer");
  }
  if (receivedTick > state.clock.tick) {
    throw new RangeError("receivedTick cannot be in the future");
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

const TAU = Math.PI * 2;
const ANGLE_EPSILON = Number.EPSILON * 8 * Math.PI;
