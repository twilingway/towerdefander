import type { ShipStats } from "./shipStats.ts";
import {
  applyArenaCushion,
  constrainMovingCircleToArena,
  isWithinCircularEnvelope
} from "./arenaGeometry.ts";
import {
  type ProjectileState,
  type SpaceshipKinematics,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState,
  type Vector2
} from "./spaceshipSimulation.ts";
export const ZERO: Vector2 = { x: 0, y: 0 };

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

export function advanceAngularTraverse(
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

/**
 * Rate control for the hull: the pilot asks for a spin, not for a bearing.
 * Nothing here remembers a target angle, and that is the point - a released
 * turn decays to a stop wherever it stops, instead of being pulled back to
 * the last angle anybody named.
 */
export function advanceAngularRate(
  state: { readonly angle: number; readonly angularVelocity: number },
  turn: number,
  config: AngularTraverseConfig
): AngularTraverseState {
  const desiredVelocity = clampToUnit(turn) * config.maxAngularSpeed;
  const accelerating =
    desiredVelocity !== 0 &&
    (state.angularVelocity === 0 ||
      (Math.sign(state.angularVelocity) === Math.sign(desiredVelocity) &&
        Math.abs(desiredVelocity) > Math.abs(state.angularVelocity)));
  const velocityRate = accelerating ? config.angularAcceleration : config.angularBraking;
  const angularVelocity = moveScalarTowards(
    state.angularVelocity,
    desiredVelocity,
    velocityRate * config.secondsPerStep
  );
  return {
    angle: canonicalizeAngle(state.angle + angularVelocity * config.secondsPerStep),
    targetAngle: null,
    angularVelocity
  };
}

function clampToUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function moveSpaceshipWithinWorld(
  spaceship: SpaceshipKinematics,
  velocity: Vector2,
  secondsPerStep: number,
  config: SpaceshipSimulationConfig,
  ship: ShipStats
): SpaceshipKinematics {
  const arena = {
    centerX: config.worldWidth / 2,
    centerY: config.worldHeight / 2,
    radius: config.arenaRadius
  };
  // The rim pushes back before it holds, so the hull spends its outward speed
  // across several steps instead of losing all of it against the circle in one.
  const cushioned = applyArenaCushion(
    { x: spaceship.x, y: spaceship.y, radius: ship.spaceshipRadius, velocity },
    arena,
    secondsPerStep
  );
  const candidateX = spaceship.x + cushioned.x * secondsPerStep;
  const candidateY = spaceship.y + cushioned.y * secondsPerStep;
  const constrained = constrainMovingCircleToArena(
    {
      x: candidateX,
      y: candidateY,
      radius: ship.spaceshipRadius,
      velocity: cushioned
    },
    arena
  );

  return {
    x: constrained.x,
    y: constrained.y,
    previousX: spaceship.x,
    previousY: spaceship.y,
    velocity: constrained.velocity
  };
}

export function moveProjectiles(
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

export function removeExpiredProjectiles(
  projectiles: readonly ProjectileState[],
  currentTick: number,
  config: SpaceshipSimulationConfig,
  ship: ShipStats
): readonly ProjectileState[] {
  return projectiles.filter(
    (projectile) =>
      (currentTick - projectile.spawnedTick) * config.fixedStepMs < ship.projectileLifetimeMs &&
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

export function isFresh(
  currentTick: number,
  input: { readonly receivedTick: number } | null,
  timeoutTicks: number
): boolean {
  return input !== null && currentTick - input.receivedTick < timeoutTicks;
}

export function isZeroVector(vector: Vector2): boolean {
  return vector.x === 0 && vector.y === 0;
}

export function assertFiniteVector(vector: Vector2): void {
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y)) {
    throw new RangeError("vector coordinates must be finite numbers");
  }
}

export function assertReceivedTick(state: SpaceshipSimulationState, receivedTick: number): void {
  if (!Number.isSafeInteger(receivedTick) || receivedTick < 0) {
    throw new RangeError("receivedTick must be a non-negative safe integer");
  }
  if (receivedTick > state.clock.tick) {
    throw new RangeError("receivedTick cannot be in the future");
  }
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

const TAU = Math.PI * 2;
const ANGLE_EPSILON = Number.EPSILON * 8 * Math.PI;
