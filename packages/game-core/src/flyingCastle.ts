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
  worldWidth: 2400,
  worldHeight: 1600,
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
  turretMaxAngularSpeedPerSecond: (4 * Math.PI) / 3,
  turretAngularAccelerationPerSecondSquared: (20 * Math.PI) / 3,
  turretAngularBrakingPerSecondSquared: (20 * Math.PI) / 3,
  shieldMaxAngularSpeedPerSecond: (5 * Math.PI) / 3,
  shieldAngularAccelerationPerSecondSquared: (25 * Math.PI) / 3,
  shieldAngularBrakingPerSecondSquared: (25 * Math.PI) / 3
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
    shield: state.inputs.shield
  };
  const secondsPerStep = config.fixedStepMs / 1000;
  const targetVelocity = {
    x: pilotVector.x * config.castleSpeedPerSecond,
    y: pilotVector.y * config.castleSpeedPerSecond
  };
  const velocityDelta =
    pilotVector.x === 0 && pilotVector.y === 0
      ? config.castleBrakingPerSecondSquared * secondsPerStep
      : config.castleAccelerationPerSecondSquared * secondsPerStep;
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
  const shieldEnergy = shieldWasActive
    ? clamp(
        state.shieldEnergy - config.shieldDrainPerSecond * secondsPerStep,
        0,
        config.shieldCapacity
      )
    : clamp(
        state.shieldEnergy + config.shieldRechargePerSecond * secondsPerStep,
        0,
        config.shieldCapacity
      );
  const shieldDepleted = shieldWasActive && shieldEnergy === 0;
  const shieldActive = shieldWasActive && !shieldDepleted;
  const shieldRearmRequired = state.shieldRearmRequired || shieldDepleted;
  const movedProjectiles = moveProjectiles(state.projectiles, clock.tick, config);
  const canFire =
    (state.queuedFire || (gunnerFresh && state.inputs.gunner?.firing === true)) &&
    (state.lastFiredTick === null || clock.tick - state.lastFiredTick >= config.fireCooldownTicks);

  if (!canFire) {
    return {
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
  }

  const direction = {
    x: Math.cos(turretTraverse.angle),
    y: Math.sin(turretTraverse.angle)
  };
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
    nextProjectileSequence: state.nextProjectileSequence + 1,
    lastFiredTick: clock.tick,
    queuedFire: false
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
