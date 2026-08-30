import {
  type CombatConfig,
  type CombatStateFields,
  type EntityVisual,
  type FriendlyWeaponSource,
  type TurretVisual
} from "./combatTypes.ts";
import { assertCombatResultInvariant, dynamicEntityCount } from "./combat.ts";
import { advanceClock, type SimulationClock } from "./primitives.ts";
export { createCleanSpaceshipRun, createSpaceshipSimulationState } from "./simulationState.ts";
import {
  advanceCombatInSpaceshipSimulation,
  neutralizeCombatControls
} from "./simulationCombatBridge.ts";
import { advanceFriendlyWeapon } from "./simulationWeapons.ts";
import { addRunStats } from "./runStats.ts";
import { defaultSpaceshipSimulationConfig } from "./defaultSimulationConfig.ts";
import {
  ZERO,
  advanceAngularRate,
  advanceAngularTraverse,
  assertFiniteVector,
  clamp,
  isFresh,
  moveProjectiles,
  moveSpaceshipWithinWorld,
  moveVectorTowards
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
  /**
   * Share of the forward speed available in reverse. Backing up is a manoeuvre,
   * not a second forward gear: at parity a pilot can fly a whole fight in
   * reverse with the nose kept on the target, which is neither intended nor
   * good to watch.
   */
  readonly spaceshipReverseSpeedFactor: number;
  readonly spaceshipRadius: number;
  readonly inputTimeoutTicks: number;
  readonly projectileSpeedPerSecond: number;
  readonly projectileLifetimeMs: number;
  readonly projectileRadius: number;
  readonly fireCooldownTicks: number;
  readonly shieldDrainPerSecond: number;
  readonly shieldRechargePerSecond: number;
  /**
   * Ticks the shield spends coming up, holding, and cooling down. They are what
   * stop the shield from being free to flick: an autopilot with nothing to lose
   * otherwise semaphores it every tick. Zero on all three restores the old
   * instant toggle.
   */
  readonly shieldEngageTicks: number;
  readonly shieldMinimumUpTicks: number;
  readonly shieldCooldownTicks: number;
  /**
   * Energy a drained shield has to win back before it will hold again. It
   * re-arms itself at that mark rather than waiting to be released and pressed:
   * an operator who kept the button down through a depletion was left holding a
   * shield that silently refused, with nothing on the panel saying why.
   *
   * Absolute rather than a share of the battery, so an upgrade that widens the
   * battery shortens the wait instead of lengthening it.
   */
  readonly shieldRearmEnergy: number;
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

export type { FriendlyWeaponSource } from "./combatTypes.ts";

/** Down, coming up, holding, or cooling off. Only `up` blocks damage. */
export type ShieldPhase = "down" | "raising" | "up" | "cooling";

export interface TrustedPilotInput {
  readonly vector: Vector2;
  readonly mgFiring: boolean;
  readonly receivedTick: number;
  /**
   * Tank helm: the requested spin in `[-1, 1]`, and thrust along the nose in
   * the same range. Absent from a stick or absolute-scheme command, which
   * names a bearing through `vector` instead.
   */
  readonly turn?: number | null;
  readonly thrust?: number | null;
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
  /** Where the shield is in its cycle, and how long it has been there. */
  readonly shieldPhase: ShieldPhase;
  readonly shieldPhaseTicks: number;
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
  advanceAngularRate,
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
  const config = { ...defaultSpaceshipSimulationConfig, ...overrides, ...derivedWorld(overrides) };
  validateSpaceshipSimulationConfig(config);
  return config;
}

/**
 * The square world is a consequence of the arena radius, not a second setting.
 * A radius that arrives from a preset would otherwise sit inside the default
 * world and fail validation, and every caller that builds a config would have
 * to remember the relation. An explicitly given world still wins, so a caller
 * may state both.
 */
function derivedWorld(
  overrides: Partial<SpaceshipSimulationConfig>
): Partial<SpaceshipSimulationConfig> {
  if (overrides.arenaRadius === undefined) return {};
  if (overrides.worldWidth !== undefined || overrides.worldHeight !== undefined) return {};
  return { worldWidth: overrides.arenaRadius * 2, worldHeight: overrides.arenaRadius * 2 };
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
  // The tank helm asks for a spin and a push along the nose; a stick still
  // asks for a bearing. Only a fresh input counts, so a dropped pilot coasts
  // to a stop instead of spinning on.
  const pilotTurn = pilotFresh ? (state.inputs.pilot?.turn ?? null) : null;
  const pilotThrust = pilotTurn === null ? null : (state.inputs.pilot?.thrust ?? 0);
  const inputs = {
    pilot:
      pilotFresh || state.inputs.pilot === null
        ? state.inputs.pilot
        : { ...state.inputs.pilot, vector: ZERO, mgFiring: false, turn: null, thrust: null },
    gunner:
      gunnerFresh || state.inputs.gunner === null
        ? state.inputs.gunner
        : { ...state.inputs.gunner, firing: false },
    shield: state.inputs.shield
  };
  const secondsPerStep = config.fixedStepMs / 1000;
  // The ship's own numbers come from the run, never from the config: a stat
  // read off the config is a module that silently does nothing.
  const ship = state.ship;
  const pilotSpeed = ship.spaceshipSpeedPerSecond;
  // With a turn intent the push runs along the nose, so reverse is the same
  // burn with a negative sign and it never turns the hull.
  // Reverse is deliberately the slower gear; see the config field.
  const thrustSpeed =
    pilotThrust !== null && pilotThrust < 0
      ? pilotSpeed * ship.spaceshipReverseSpeedFactor
      : pilotSpeed;
  const targetVelocity =
    pilotThrust === null
      ? { x: pilotVector.x * pilotSpeed, y: pilotVector.y * pilotSpeed }
      : {
          x: Math.cos(state.spaceshipHeading) * thrustSpeed * pilotThrust,
          y: Math.sin(state.spaceshipHeading) * thrustSpeed * pilotThrust
        };
  const coasting =
    pilotThrust === null ? pilotVector.x === 0 && pilotVector.y === 0 : pilotThrust === 0;
  const velocityDelta = coasting
    ? ship.spaceshipBrakingPerSecondSquared * secondsPerStep
    : ship.spaceshipAccelerationPerSecondSquared * secondsPerStep;
  const nextVelocity = moveVectorTowards(state.spaceship.velocity, targetVelocity, velocityDelta);
  const spaceship = moveSpaceshipWithinWorld(
    state.spaceship,
    nextVelocity,
    secondsPerStep,
    config,
    ship
  );

  const turretTargetAngle = gunnerFresh ? state.turretTargetAngle : null;
  const shieldTargetAngle = shieldFresh ? state.shieldTargetAngle : null;
  // A spin remembers no bearing: keeping one would pull the hull back to it
  // the moment the key comes up, which is the swing this helm exists to lose.
  const headingTargetAngle = pilotTurn === null && pilotFresh ? state.headingTargetAngle : null;
  const turretTraverse = advanceAngularTraverse(
    {
      angle: state.turretAngle,
      targetAngle: turretTargetAngle,
      angularVelocity: state.turretAngularVelocity
    },
    {
      maxAngularSpeed: ship.turretMaxAngularSpeedPerSecond,
      angularAcceleration: ship.turretAngularAccelerationPerSecondSquared,
      angularBraking: ship.turretAngularBrakingPerSecondSquared,
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
      maxAngularSpeed: ship.shieldMaxAngularSpeedPerSecond,
      angularAcceleration: ship.shieldAngularAccelerationPerSecondSquared,
      angularBraking: ship.shieldAngularBrakingPerSecondSquared,
      secondsPerStep
    }
  );
  const headingConfig = {
    maxAngularSpeed: ship.headingMaxAngularSpeedPerSecond,
    angularAcceleration: ship.headingAngularAccelerationPerSecondSquared,
    angularBraking: ship.headingAngularBrakingPerSecondSquared,
    secondsPerStep
  };
  const headingTraverse =
    pilotTurn === null
      ? advanceAngularTraverse(
          {
            angle: state.spaceshipHeading,
            targetAngle: headingTargetAngle,
            angularVelocity: state.headingAngularVelocity
          },
          headingConfig
        )
      : advanceAngularRate(
          { angle: state.spaceshipHeading, angularVelocity: state.headingAngularVelocity },
          pilotTurn,
          headingConfig
        );
  const shieldDesiredActive = state.inputs.shield?.active === true;
  const shieldCanActivate = !state.shieldRearmRequired && state.shieldEnergy > 0;
  // Sequential rather than switched, so that zero-length phases cascade inside
  // one tick and the old instant toggle survives as a tuning value.
  let shieldPhase = state.shieldPhase;
  let shieldPhaseTicks = state.shieldPhaseTicks + 1;
  if (shieldPhase === "down" && shieldDesiredActive && shieldCanActivate) {
    shieldPhase = "raising";
    shieldPhaseTicks = 0;
  }
  if (shieldPhase === "raising" && shieldPhaseTicks >= ship.shieldEngageTicks) {
    shieldPhase = "up";
    shieldPhaseTicks = 0;
  }
  // The hold is what the operator cannot cut short; letting go earlier is
  // remembered by the request, not by the phase.
  if (
    shieldPhase === "up" &&
    !shieldDesiredActive &&
    shieldPhaseTicks >= ship.shieldMinimumUpTicks
  ) {
    shieldPhase = "cooling";
    shieldPhaseTicks = 0;
  }
  if (shieldPhase === "cooling" && shieldPhaseTicks >= ship.shieldCooldownTicks) {
    shieldPhase = "down";
    shieldPhaseTicks = 0;
  }
  const shieldHolding = shieldPhase === "up";
  const shieldCapacity = ship.shieldCapacity;
  const shieldEnergy = shieldHolding
    ? clamp(state.shieldEnergy - ship.shieldDrainPerSecond * secondsPerStep, 0, shieldCapacity)
    : clamp(state.shieldEnergy + ship.shieldRechargePerSecond * secondsPerStep, 0, shieldCapacity);
  const shieldDepleted = shieldHolding && shieldEnergy === 0;
  // A drained shield drops whatever the hold says: the cooldown starts here.
  if (shieldDepleted) {
    shieldPhase = "cooling";
    shieldPhaseTicks = 0;
  }
  const shieldActive = shieldHolding && !shieldDepleted;
  // Locked out by the battery, not by the button: draining to nothing sets it,
  // and winning back the mark clears it with no further input.
  const shieldRearmRequired = shieldDepleted
    ? true
    : state.shieldRearmRequired && shieldEnergy < ship.shieldRearmEnergy;
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

  // Whole ticks and a floor of one are the stat rule now, not this call site.
  const gunnerCooldownTicks = ship.fireCooldownTicks;
  const gunnerEligible =
    !state.cannonOverheated &&
    (state.queuedFire || (gunnerFresh && state.inputs.gunner?.firing === true)) &&
    (state.lastFiredTick === null || clock.tick - state.lastFiredTick >= gunnerCooldownTicks);

  const cannonShot = advanceFriendlyWeapon({
    eligible: gunnerEligible,
    canSpawn: canCreateFriendlyProjectile(projectiles),
    origin: spaceship,
    angle: turretTraverse.angle,
    muzzleOffset: ship.spaceshipRadius + ship.projectileRadius,
    speed: ship.projectileSpeedPerSecond,
    damage: ship.friendlyProjectileDamage,
    radius: ship.projectileRadius,
    source: "cannon",
    projectileSequence: nextProjectileSequence,
    spawnSequence: nextSpawnSequence,
    tick: clock.tick,
    secondsPerStep,
    heat: cannonHeat,
    overheated: state.cannonOverheated,
    heatTuning: {
      capacity: ship.cannonHeatCapacity,
      perShot: ship.cannonHeatPerShot,
      coolingPerSecond: ship.cannonCoolingPerSecond,
      rearmThreshold: ship.cannonRearmThreshold
    }
  });
  if (cannonShot.projectile !== null) {
    projectiles.push(cannonShot.projectile);
    nextProjectileSequence += 1;
    nextSpawnSequence += 1;
  }
  if (cannonShot.triggered) {
    lastFiredTick = clock.tick;
    queuedFire = false;
  }
  cannonHeat = cannonShot.heat;
  const cannonOverheated = cannonShot.overheated;

  const mgCooldownTicks = Math.max(1, ship.mgFireCooldownTicks);
  const mgEligible =
    !state.mgOverheated &&
    (state.queuedMgFire || (pilotFresh && state.inputs.pilot?.mgFiring === true)) &&
    (state.lastMgFiredTick === null || clock.tick - state.lastMgFiredTick >= mgCooldownTicks);

  const mgShot = advanceFriendlyWeapon({
    eligible: mgEligible,
    canSpawn: canCreateFriendlyProjectile(projectiles),
    origin: spaceship,
    angle: headingTraverse.angle,
    muzzleOffset: ship.spaceshipRadius + ship.mgProjectileRadius,
    speed: ship.mgProjectileSpeedPerSecond,
    damage: ship.mgDamage,
    radius: ship.mgProjectileRadius,
    source: "machineGun",
    projectileSequence: nextProjectileSequence,
    spawnSequence: nextSpawnSequence,
    tick: clock.tick,
    secondsPerStep,
    heat: mgHeat,
    overheated: state.mgOverheated,
    heatTuning: {
      capacity: ship.mgHeatCapacity,
      perShot: ship.mgHeatPerShot,
      coolingPerSecond: ship.mgCoolingPerSecond,
      rearmThreshold: ship.mgRearmThreshold
    }
  });
  if (mgShot.projectile !== null) {
    projectiles.push(mgShot.projectile);
    nextProjectileSequence += 1;
    nextSpawnSequence += 1;
  }
  if (mgShot.triggered) {
    lastMgFiredTick = clock.tick;
    queuedMgFire = false;
  }
  mgHeat = mgShot.heat;
  const mgOverheated = mgShot.overheated;

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
    shieldPhase,
    shieldPhaseTicks,
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
    lastMgFiredTick,
    // Counted here rather than by watching the projectile list, because a
    // point-blank shot is created and resolved inside the same step.
    runStats: addRunStats(state.runStats, {
      shotsByCannon: cannonShot.projectile === null ? 0 : 1,
      shotsByMachineGun: mgShot.projectile === null ? 0 : 1
    })
  };
  return advanceCombatInSpaceshipSimulation(baseState, config);
}
