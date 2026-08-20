import { advanceClock, type SimulationClock } from "./primitives.js";

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

export interface FlyingCastleConfig {
  readonly fixedStepMs: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly castleSpeedPerSecond: number;
  readonly castleRadius: number;
  readonly inputTimeoutTicks: number;
  readonly projectileSpeedPerSecond: number;
  readonly projectileLifetimeMs: number;
  readonly projectileRadius: number;
  readonly fireCooldownTicks: number;
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
  readonly velocity: Vector2;
}

export interface ProjectileState {
  readonly projectileId: string;
  readonly x: number;
  readonly y: number;
  readonly velocity: Vector2;
  readonly spawnedTick: number;
}

export interface FlyingCastleState {
  readonly clock: SimulationClock;
  readonly castle: CastleState;
  readonly turretAngle: number;
  readonly shieldAngle: number;
  readonly shieldActive: boolean;
  readonly inputs: {
    readonly pilot: TrustedPilotInput | null;
    readonly gunner: TrustedGunnerInput | null;
    readonly shield: TrustedShieldInput | null;
  };
  readonly projectiles: readonly ProjectileState[];
  readonly nextProjectileSequence: number;
  readonly lastFiredTick: number | null;
}

const defaultFlyingCastleConfig: FlyingCastleConfig = {
  fixedStepMs: 50,
  worldWidth: 2400,
  worldHeight: 1600,
  castleSpeedPerSecond: 320,
  castleRadius: 52,
  inputTimeoutTicks: 5,
  projectileSpeedPerSecond: 720,
  projectileLifetimeMs: 1500,
  projectileRadius: 8,
  fireCooldownTicks: 5
};

export function createFlyingCastleConfig(
  overrides: Partial<FlyingCastleConfig> = {}
): FlyingCastleConfig {
  const config = { ...defaultFlyingCastleConfig, ...overrides };
  validateFlyingCastleConfig(config);
  return config;
}

export function validateFlyingCastleConfig(config: FlyingCastleConfig): void {
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
    ["castleRadius", config.castleRadius],
    ["projectileSpeedPerSecond", config.projectileSpeedPerSecond],
    ["projectileRadius", config.projectileRadius]
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

export function createFlyingCastleState(config: FlyingCastleConfig): FlyingCastleState {
  validateFlyingCastleConfig(config);

  return {
    clock: { tick: 0, elapsedMs: 0 },
    castle: {
      x: config.worldWidth / 2,
      y: config.worldHeight / 2,
      velocity: { x: 0, y: 0 }
    },
    turretAngle: 0,
    shieldAngle: 0,
    shieldActive: false,
    inputs: {
      pilot: null,
      gunner: null,
      shield: null
    },
    projectiles: [],
    nextProjectileSequence: 0,
    lastFiredTick: null
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
  return {
    ...state,
    inputs: {
      ...state.inputs,
      gunner: {
        vector: normalizeVector(input.vector),
        firing: input.firing,
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
  return {
    ...state,
    inputs: {
      ...state.inputs,
      shield: {
        vector: normalizeVector(input.vector),
        active: input.active,
        receivedTick: input.receivedTick
      }
    }
  };
}

export function advanceFlyingCastle(
  state: FlyingCastleState,
  config: FlyingCastleConfig
): FlyingCastleState {
  validateFlyingCastleConfig(config);
  const clock = advanceClock(state.clock, config.fixedStepMs);
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
    shield:
      shieldFresh || state.inputs.shield === null
        ? state.inputs.shield
        : { ...state.inputs.shield, active: false }
  };
  const velocity = {
    x: pilotVector.x * config.castleSpeedPerSecond,
    y: pilotVector.y * config.castleSpeedPerSecond
  };
  const secondsPerStep = config.fixedStepMs / 1000;
  const castle = {
    x: clamp(
      state.castle.x + velocity.x * secondsPerStep,
      config.castleRadius,
      config.worldWidth - config.castleRadius
    ),
    y: clamp(
      state.castle.y + velocity.y * secondsPerStep,
      config.castleRadius,
      config.worldHeight - config.castleRadius
    ),
    velocity
  };

  const turretAngle = aimAngleOrPrevious(
    gunnerFresh ? state.inputs.gunner?.vector : null,
    state.turretAngle
  );
  const shieldAngle = aimAngleOrPrevious(
    shieldFresh ? state.inputs.shield?.vector : null,
    state.shieldAngle
  );
  const shieldActive = shieldFresh && state.inputs.shield?.active === true;
  const movedProjectiles = moveProjectiles(state.projectiles, clock.tick, config);
  const canFire =
    gunnerFresh &&
    state.inputs.gunner?.firing === true &&
    (state.lastFiredTick === null || clock.tick - state.lastFiredTick >= config.fireCooldownTicks);

  if (!canFire) {
    return {
      ...state,
      clock,
      castle,
      inputs,
      turretAngle,
      shieldAngle,
      shieldActive,
      projectiles: movedProjectiles
    };
  }

  const direction = { x: Math.cos(turretAngle), y: Math.sin(turretAngle) };
  const projectile: ProjectileState = {
    projectileId: `projectile-${String(state.nextProjectileSequence)}`,
    x: castle.x + direction.x * (config.castleRadius + config.projectileRadius),
    y: castle.y + direction.y * (config.castleRadius + config.projectileRadius),
    velocity: {
      x: direction.x * config.projectileSpeedPerSecond,
      y: direction.y * config.projectileSpeedPerSecond
    },
    spawnedTick: clock.tick
  };

  return {
    ...state,
    clock,
    castle,
    inputs,
    turretAngle,
    shieldAngle,
    shieldActive,
    projectiles: [...movedProjectiles, projectile],
    nextProjectileSequence: state.nextProjectileSequence + 1,
    lastFiredTick: clock.tick
  };
}

const ZERO: Vector2 = { x: 0, y: 0 };

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

function aimAngleOrPrevious(vector: Vector2 | null | undefined, previous: number): number {
  return vector === null || vector === undefined || (vector.x === 0 && vector.y === 0)
    ? previous
    : Math.atan2(vector.y, vector.x);
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
