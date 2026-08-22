import { advanceClock, type SimulationClock } from "./primitives.js";
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

export interface FlyingCastleConfig extends CombatConfig {
  readonly fixedStepMs: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly castleSpeedPerSecond: number;
  readonly castleAccelerationPerSecondSquared: number;
  readonly castleBrakingPerSecondSquared: number;
  readonly castleRadius: number;
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
}

export interface TrustedPilotInput {
  readonly vector: Vector2;
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

export interface CastleState {
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
}

export interface FlyingCastleState extends CombatStateFields {
  readonly clock: SimulationClock;
  readonly castle: CastleState;
  readonly turretAngle: number;
  readonly turretTargetAngle: number | null;
  readonly turretAngularVelocity: number;
  readonly shieldAngle: number;
  readonly shieldTargetAngle: number | null;
  readonly shieldAngularVelocity: number;
  readonly shieldActive: boolean;
  readonly shieldEnergy: number;
  readonly shieldRearmRequired: boolean;
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

const defaultFlyingCastleConfig: FlyingCastleConfig = {
  fixedStepMs: 50,
  worldWidth: 4800,
  worldHeight: 3200,
  castleSpeedPerSecond: 320,
  castleAccelerationPerSecondSquared: 640,
  castleBrakingPerSecondSquared: 800,
  castleRadius: 52,
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
  castleMaxHp: 500,
  shieldRadius: 104,
  shieldArcRadians: Math.PI / 2,
  hostileBulletShieldHitCost: 4,
  missileShieldHitCost: 12,
  asteroidShieldHitCost: 20,
  hostileBulletDamage: 10,
  missileDamage: 30,
  asteroidDamage: 40,
  friendlyProjectileDamage: 25,
  enemySpawnIntervalTicks: 12,
  intermissionTicks: 200,
  waveBaseBudget: 5,
  waveBudgetGrowth: 2,
  waveBudgetCap: 120,
  waveHpGrowth: 0.12,
  waveHpMultiplierCap: 8,
  waveTempoGrowth: 0.05,
  waveTempoMultiplierCap: 3,
  gunshipHp: 50,
  gunshipRadius: 28,
  gunshipSpeedPerSecond: 150,
  gunshipPreferredDistance: 650,
  gunshipFireCooldownTicks: 30,
  carrierHp: 110,
  carrierRadius: 38,
  carrierSpeedPerSecond: 95,
  carrierPreferredDistance: 900,
  carrierFireCooldownTicks: 70,
  asteroidHp: 65,
  asteroidRadius: 34,
  asteroidSpeedPerSecond: 190,
  asteroidLifetimeTicks: 500,
  hostileBulletRadius: 7,
  hostileBulletSpeedPerSecond: 440,
  hostileBulletLifetimeTicks: 180,
  missileRadius: 12,
  missileSpeedPerSecond: 260,
  missileTurnRatePerSecond: Math.PI / 2,
  missileLifetimeTicks: 240,
  worldPadding: 240,
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

export function createFlyingCastleConfig(
  overrides: Partial<FlyingCastleConfig> = {}
): FlyingCastleConfig {
  const config = { ...defaultFlyingCastleConfig, ...overrides };
  validateFlyingCastleConfig(config);
  return config;
}

export function validateFlyingCastleConfig(config: FlyingCastleConfig): void {
  validateCombatConfig(config);
  const positiveSafeIntegers: readonly (readonly [string, number])[] = [
    ["fixedStepMs", config.fixedStepMs],
    ["inputTimeoutTicks", config.inputTimeoutTicks],
    ["projectileLifetimeMs", config.projectileLifetimeMs],
    ["fireCooldownTicks", config.fireCooldownTicks]
  ];

  for (const [name, value] of positiveSafeIntegers) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }

  const positiveFiniteNumbers: readonly (readonly [string, number])[] = [
    ["worldWidth", config.worldWidth],
    ["worldHeight", config.worldHeight],
    ["castleSpeedPerSecond", config.castleSpeedPerSecond],
    ["castleAccelerationPerSecondSquared", config.castleAccelerationPerSecondSquared],
    ["castleBrakingPerSecondSquared", config.castleBrakingPerSecondSquared],
    ["castleRadius", config.castleRadius],
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
    ["shieldAngularBrakingPerSecondSquared", config.shieldAngularBrakingPerSecondSquared]
  ];

  for (const [name, value] of positiveFiniteNumbers) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number`);
    }
  }

  if (config.worldWidth < config.castleRadius * 2) {
    throw new RangeError("worldWidth must fit the castle diameter");
  }
  if (config.worldHeight < config.castleRadius * 2) {
    throw new RangeError("worldHeight must fit the castle diameter");
  }
}

export function createFlyingCastleState(
  config: FlyingCastleConfig,
  runSeed: number
): FlyingCastleState {
  return createCleanFlyingCastleRun(config, runSeed);
}

export function createCleanFlyingCastleRun(
  config: FlyingCastleConfig,
  runSeed: number
): FlyingCastleState {
  validateFlyingCastleConfig(config);
  validateRunSeed(runSeed);

  return {
    ...createInitialCombatState(config, runSeed),
    clock: { tick: 0, elapsedMs: 0 },
    castle: {
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
  state: FlyingCastleState,
  input: TrustedPilotInput
): FlyingCastleState {
  assertReceivedTick(state, input.receivedTick);
  return {
    ...state,
    inputs: {
      ...state.inputs,
      pilot: { vector: normalizeVector(input.vector), receivedTick: input.receivedTick }
    }
  };
}

export function applyGunnerInput(
  state: FlyingCastleState,
  input: TrustedGunnerInput
): FlyingCastleState {
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
  state: FlyingCastleState,
  input: TrustedShieldInput
): FlyingCastleState {
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
export function cancelQueuedFire(state: FlyingCastleState): FlyingCastleState {
  return state.queuedFire ? { ...state, queuedFire: false } : state;
}

/** Turns off the authoritative shield immediately at a trusted disconnect boundary. */
export function deactivateShield(state: FlyingCastleState): FlyingCastleState {
  return state.shieldActive ? { ...state, shieldActive: false } : state;
}

/** Cancels every gunner intent owned by a disconnected trusted connection. */
export function cancelGunnerControl(state: FlyingCastleState): FlyingCastleState {
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
export function cancelShieldControl(state: FlyingCastleState): FlyingCastleState {
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

export function advanceFlyingCastle(
  state: FlyingCastleState,
  config: FlyingCastleConfig
): FlyingCastleState {
  validateFlyingCastleConfig(config);
  assertCombatResultInvariant(state);
  if (state.encounterPhase === "result") {
    return state;
  }
  const clock = advanceClock(state.clock, config.fixedStepMs);
  if (state.encounterPhase === "intermission") {
    return advanceCombatInFlyingCastle({ ...neutralizeCombatControls(state), clock }, config);
  }
  const pilotFresh = isFresh(clock.tick, state.inputs.pilot, config.inputTimeoutTicks);
  const gunnerFresh = isFresh(clock.tick, state.inputs.gunner, config.inputTimeoutTicks);
  const shieldFresh = isFresh(clock.tick, state.inputs.shield, config.inputTimeoutTicks);
  const pilotVector = pilotFresh && state.inputs.pilot !== null ? state.inputs.pilot.vector : ZERO;
  const inputs = {
    pilot:
      pilotFresh || state.inputs.pilot === null
        ? state.inputs.pilot
        : { ...state.inputs.pilot, vector: ZERO },
    gunner:
      gunnerFresh || state.inputs.gunner === null
        ? state.inputs.gunner
        : { ...state.inputs.gunner, firing: false },
    shield: state.inputs.shield
  };
  const secondsPerStep = config.fixedStepMs / 1000;
  const targetVelocity = {
    x: pilotVector.x * config.castleSpeedPerSecond * state.roleModifiers.pilot.speedMultiplier,
    y: pilotVector.y * config.castleSpeedPerSecond * state.roleModifiers.pilot.speedMultiplier
  };
  const velocityDelta =
    pilotVector.x === 0 && pilotVector.y === 0
      ? config.castleBrakingPerSecondSquared * secondsPerStep
      : config.castleAccelerationPerSecondSquared *
        state.roleModifiers.pilot.accelerationMultiplier *
        secondsPerStep;
  const nextVelocity = moveVectorTowards(state.castle.velocity, targetVelocity, velocityDelta);
  const castle = moveCastleWithinWorld(state.castle, nextVelocity, secondsPerStep, config);

  const turretTargetAngle = gunnerFresh ? state.turretTargetAngle : null;
  const shieldTargetAngle = shieldFresh ? state.shieldTargetAngle : null;
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
  const movedProjectiles = moveProjectiles(state.projectiles, clock.tick, config);
  const canFire =
    (state.queuedFire || (gunnerFresh && state.inputs.gunner?.firing === true)) &&
    (state.lastFiredTick === null ||
      clock.tick - state.lastFiredTick >=
        Math.max(
          1,
          Math.ceil(config.fireCooldownTicks * state.roleModifiers.gunner.cooldownMultiplier)
        ));

  if (!canFire) {
    const baseState: FlyingCastleState = {
      ...state,
      clock,
      castle,
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
      projectiles: movedProjectiles
    };
    return advanceCombatInFlyingCastle(baseState, config);
  }

  const canCreateFriendlyProjectile =
    movedProjectiles.length < config.caps.friendlyProjectiles &&
    dynamicEntityCount({ ...state, projectiles: movedProjectiles }) < config.caps.dynamicEntities;
  if (!canCreateFriendlyProjectile) {
    const baseState: FlyingCastleState = {
      ...state,
      clock,
      castle,
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
      projectiles: movedProjectiles,
      lastFiredTick: clock.tick,
      queuedFire: false
    };
    return advanceCombatInFlyingCastle(baseState, config);
  }

  const direction = {
    x: Math.cos(turretTraverse.angle),
    y: Math.sin(turretTraverse.angle)
  };
  const projectile: ProjectileState = {
    id: `projectile-${String(state.nextProjectileSequence)}`,
    projectileId: `projectile-${String(state.nextProjectileSequence)}`,
    spawnSequence: state.nextSpawnSequence,
    previousX: castle.x + direction.x * (config.castleRadius + config.projectileRadius),
    previousY: castle.y + direction.y * (config.castleRadius + config.projectileRadius),
    x: castle.x + direction.x * (config.castleRadius + config.projectileRadius),
    y: castle.y + direction.y * (config.castleRadius + config.projectileRadius),
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
    spawnedTick: clock.tick
  };

  const baseState: FlyingCastleState = {
    ...state,
    clock,
    castle,
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
    projectiles: [...movedProjectiles, projectile],
    nextSpawnSequence: state.nextSpawnSequence + 1,
    nextProjectileSequence: state.nextProjectileSequence + 1,
    lastFiredTick: clock.tick,
    queuedFire: false
  };
  return advanceCombatInFlyingCastle(baseState, config);
}

function advanceCombatInFlyingCastle(
  state: FlyingCastleState,
  config: FlyingCastleConfig
): FlyingCastleState {
  if (state.encounterPhase === "intermission") {
    const neutral = neutralizeCombatControls(state);
    const recharged = {
      ...neutral,
      shieldEnergy: clamp(
        neutral.shieldEnergy +
          config.shieldRechargePerSecond *
            neutral.roleModifiers.shield.rechargeMultiplier *
            (config.fixedStepMs / 1000),
        0,
        config.shieldCapacity + neutral.roleModifiers.shield.capacityBonus
      )
    };
    const result = advanceCombat(rechargedForCombat(recharged, config), config);
    return {
      ...recharged,
      ...result,
      projectiles: result.projectiles as readonly ProjectileState[]
    };
  }
  const result = advanceCombat(rechargedForCombat(state, config), config);
  const next: FlyingCastleState = {
    ...state,
    ...result,
    projectiles: result.projectiles as readonly ProjectileState[]
  };
  return result.encounterPhase === "intermission" ? neutralizeCombatControls(next) : next;
}

function rechargedForCombat(state: FlyingCastleState, config: FlyingCastleConfig) {
  return {
    ...state,
    castle: {
      ...state.castle,
      previousX: state.castle.previousX ?? state.castle.x,
      previousY: state.castle.previousY ?? state.castle.y,
      radius: config.castleRadius
    }
  };
}

function neutralizeCombatControls(state: FlyingCastleState): FlyingCastleState {
  return {
    ...state,
    turretTargetAngle: null,
    shieldTargetAngle: null,
    shieldActive: false,
    queuedFire: false,
    inputs: {
      pilot: state.inputs.pilot === null ? null : { ...state.inputs.pilot, vector: { x: 0, y: 0 } },
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

function moveCastleWithinWorld(
  castle: CastleState,
  velocity: Vector2,
  secondsPerStep: number,
  config: FlyingCastleConfig
): CastleState {
  const minimum = config.castleRadius;
  const maximumX = config.worldWidth - config.castleRadius;
  const maximumY = config.worldHeight - config.castleRadius;
  const candidateX = castle.x + velocity.x * secondsPerStep;
  const candidateY = castle.y + velocity.y * secondsPerStep;
  const x = clamp(candidateX, minimum, maximumX);
  const y = clamp(candidateY, minimum, maximumY);

  return {
    x,
    y,
    previousX: castle.x,
    previousY: castle.y,
    velocity: {
      x: (x === minimum && velocity.x < 0) || (x === maximumX && velocity.x > 0) ? 0 : velocity.x,
      y: (y === minimum && velocity.y < 0) || (y === maximumY && velocity.y > 0) ? 0 : velocity.y
    }
  };
}

function moveProjectiles(
  projectiles: readonly ProjectileState[],
  nextTick: number,
  config: FlyingCastleConfig
): readonly ProjectileState[] {
  const secondsPerStep = config.fixedStepMs / 1000;

  return projectiles
    .filter(
      (projectile) =>
        (nextTick - projectile.spawnedTick) * config.fixedStepMs < config.projectileLifetimeMs
    )
    .map((projectile) => ({
      ...projectile,
      previousX: projectile.x,
      previousY: projectile.y,
      x: projectile.x + projectile.velocity.x * secondsPerStep,
      y: projectile.y + projectile.velocity.y * secondsPerStep
    }))
    .filter(
      (projectile) =>
        projectile.x >= -config.projectileRadius &&
        projectile.x <= config.worldWidth + config.projectileRadius &&
        projectile.y >= -config.projectileRadius &&
        projectile.y <= config.worldHeight + config.projectileRadius
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

function assertReceivedTick(state: FlyingCastleState, receivedTick: number): void {
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
