import { validateRunSeed } from "./combatValidation.ts";
import { createInitialCombatState } from "./combat.ts";
import {
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState
} from "./spaceshipSimulation.ts";
import { validateSpaceshipSimulationConfig } from "./simulationValidation.ts";

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
    shieldPhase: "down",
    shieldPhaseTicks: 0,
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
