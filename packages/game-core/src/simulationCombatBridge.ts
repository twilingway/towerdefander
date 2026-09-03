import { advanceCombat } from "./combat.ts";
import {
  type ProjectileState,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState
} from "./spaceshipSimulation.ts";
import { clamp, removeExpiredProjectiles } from "./simulationMath.ts";

export function advanceCombatInSpaceshipSimulation(
  state: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig
): SpaceshipSimulationState {
  if (state.encounterPhase === "intermission") {
    const neutral = neutralizeCombatControls(state);
    const secondsPerStep = config.fixedStepMs / 1000;
    const cannonHeat = Math.max(
      0,
      neutral.cannonHeat - neutral.ship.cannonCoolingPerSecond * secondsPerStep
    );
    let cannonOverheated = neutral.cannonOverheated;
    if (!cannonOverheated && cannonHeat >= neutral.ship.cannonHeatCapacity) {
      cannonOverheated = true;
    } else if (cannonOverheated && cannonHeat <= neutral.ship.cannonRearmThreshold) {
      cannonOverheated = false;
    }
    const mgHeat = Math.max(0, neutral.mgHeat - neutral.ship.mgCoolingPerSecond * secondsPerStep);
    let mgOverheated = neutral.mgOverheated;
    if (!mgOverheated && mgHeat >= neutral.ship.mgHeatCapacity) {
      mgOverheated = true;
    } else if (mgOverheated && mgHeat <= neutral.ship.mgRearmThreshold) {
      mgOverheated = false;
    }
    const recharged = {
      ...neutral,
      shieldEnergy: clamp(
        neutral.shieldEnergy + neutral.ship.shieldRechargePerSecond * (config.fixedStepMs / 1000),
        0,
        neutral.ship.shieldCapacity
      ),
      cannonHeat,
      cannonOverheated,
      mgHeat,
      mgOverheated
    };
    const result = advanceCombat(rechargedForCombat(recharged), config);
    return {
      ...recharged,
      ...result,
      projectiles: removeExpiredProjectiles(
        result.projectiles as readonly ProjectileState[],
        recharged.clock.tick,
        config,
        result.ship
      )
    };
  }
  const result = advanceCombat(rechargedForCombat(state), config);
  const next: SpaceshipSimulationState = {
    ...state,
    ...result,
    projectiles: removeExpiredProjectiles(
      result.projectiles as readonly ProjectileState[],
      state.clock.tick,
      config,
      result.ship
    )
  };
  return result.encounterPhase === "intermission" ? neutralizeCombatControls(next) : next;
}

export function rechargedForCombat(state: SpaceshipSimulationState) {
  return {
    ...state,
    spaceship: {
      ...state.spaceship,
      previousX: state.spaceship.previousX ?? state.spaceship.x,
      previousY: state.spaceship.previousY ?? state.spaceship.y,
      radius: state.ship.spaceshipRadius
    }
  };
}

export function neutralizeCombatControls(
  state: SpaceshipSimulationState
): SpaceshipSimulationState {
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
