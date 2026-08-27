import {
  type CombatConfig,
  type CombatStateFields,
  type EntityVisual,
  type TurretVisual
} from "./combatTypes.ts";
import { validateRunSeed } from "./combatValidation.ts";
import {
  advanceCombat,
  assertCombatResultInvariant,
  createInitialCombatState,
  dynamicEntityCount
} from "./combat.ts";
import { advanceClock, type SimulationClock } from "./primitives.ts";
import { defaultSpaceshipSimulationConfig } from "./defaultSimulationConfig.ts";
import {
  ZERO,
  advanceAngularTraverse,
  assertFiniteVector,
  clamp,
  isFresh,
  moveProjectiles,
  moveSpaceshipWithinWorld,
  moveVectorTowards,
  removeExpiredProjectiles
} from "./simulationMath.ts";
import { validateSpaceshipSimulationConfig } from "./simulationValidation.ts";

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

/** One of the four nebula textures the display ships with. */
export type NebulaPreset = "blue" | "gold" | "purple" | "green";

/** Parallax space background; presentation only, like `cameraViewWidth`. */
export interface BackgroundTuning {
  /** Multiplier of the camera-driven layer shift; zero keeps only the idle drift. */
  readonly parallaxStrength: number;
  /** Idle drift speed in texture pixels per second at full strength. */
  readonly driftSpeed: number;
  /** Opacity of both nebula layers; stars and dust keep their own fixed alpha. */
  readonly nebulaAlpha: number;
  readonly nebulaPreset: NebulaPreset;
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
  /**
   * Presentation only, like `cameraViewWidth`: the parallax space background the
   * display draws under the arena. The simulation never reads it.
   */
  readonly background: BackgroundTuning;
  /**
   * Presentation only, like `cameraViewWidth`: the silhouette the display draws
   * for the player hull. The simulation never reads it.
   */
  readonly spaceshipVisual: EntityVisual | null;
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
  /**
   * The gunner cannon runs hot the way the nose gun does. Without it a shot
   * costs nothing, so firing at everything strictly beats picking targets and
   * no amount of gunnery skill can be worth anything.
   */
  readonly projectileVisual: EntityVisual | null;
  readonly turretVisual: TurretVisual;
  readonly mgProjectileVisual: EntityVisual | null;
  readonly cannonHeatCapacity: number;
  readonly cannonHeatPerShot: number;
  readonly cannonCoolingPerSecond: number;
  readonly cannonRearmThreshold: number;
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
  readonly cannonHeat: number;
  readonly cannonOverheated: boolean;
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

export { validateSpaceshipSimulationConfig } from "./simulationValidation.ts";
export {
  advanceAngularTraverse,
  canonicalizeAngle,
  moveScalarTowards,
  moveVectorTowards,
  shortestAngleDelta
} from "./simulationMath.ts";
export {
  applyGunnerInput,
  applyPilotInput,
  applyShieldInput,
  cancelGunnerControl,
  cancelPilotControl,
  cancelQueuedFire,
  cancelShieldControl,
  deactivateShield
} from "./simulationInputs.ts";

export function createSpaceshipSimulationConfig(
  overrides: Partial<SpaceshipSimulationConfig> = {}
): SpaceshipSimulationConfig {
  const config = { ...defaultSpaceshipSimulationConfig, ...overrides };
  validateSpaceshipSimulationConfig(config);
  return config;
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
    cannonHeat: 0,
    cannonOverheated: false,
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
  let cannonHeat = state.cannonHeat;
  let mgHeat = state.mgHeat;

  const canCreateFriendlyProjectile = (list: readonly ProjectileState[]) =>
    list.length < config.caps.friendlyProjectiles &&
    dynamicEntityCount({ ...state, projectiles: list }) < config.caps.dynamicEntities;

  const gunnerCooldownTicks = Math.max(
    1,
    Math.ceil(config.fireCooldownTicks * state.roleModifiers.gunner.cooldownMultiplier)
  );
  const gunnerEligible =
    !state.cannonOverheated &&
    (state.queuedFire || (gunnerFresh && state.inputs.gunner?.firing === true)) &&
    (state.lastFiredTick === null || clock.tick - state.lastFiredTick >= gunnerCooldownTicks);

  let cannonSpawnedThisTick = false;
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
      cannonHeat = Math.min(config.cannonHeatCapacity, cannonHeat + config.cannonHeatPerShot);
      cannonSpawnedThisTick = true;
    }
    lastFiredTick = clock.tick;
    queuedFire = false;
  }

  if (!cannonSpawnedThisTick) {
    cannonHeat = Math.max(0, cannonHeat - config.cannonCoolingPerSecond * secondsPerStep);
  }
  let cannonOverheated = state.cannonOverheated;
  if (!cannonOverheated && cannonHeat >= config.cannonHeatCapacity) {
    cannonOverheated = true;
  } else if (cannonOverheated && cannonHeat <= config.cannonRearmThreshold) {
    cannonOverheated = false;
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
    cannonHeat,
    cannonOverheated,
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
    const cannonHeat = Math.max(
      0,
      neutral.cannonHeat - config.cannonCoolingPerSecond * secondsPerStep
    );
    let cannonOverheated = neutral.cannonOverheated;
    if (!cannonOverheated && cannonHeat >= config.cannonHeatCapacity) {
      cannonOverheated = true;
    } else if (cannonOverheated && cannonHeat <= config.cannonRearmThreshold) {
      cannonOverheated = false;
    }
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
      cannonHeat,
      cannonOverheated,
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
