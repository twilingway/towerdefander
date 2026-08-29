import {
  normalizeVector,
  type SpaceshipSimulationState,
  type TrustedGunnerInput,
  type TrustedPilotInput,
  type TrustedShieldInput
} from "./spaceshipSimulation.ts";
import { ZERO, assertReceivedTick, canonicalizeAngle, isZeroVector } from "./simulationMath.ts";
export function applyPilotInput(
  state: SpaceshipSimulationState,
  input: TrustedPilotInput
): SpaceshipSimulationState {
  assertReceivedTick(state, input.receivedTick);
  const vector = normalizeVector(input.vector);
  const turn = input.turn ?? null;
  const isRisingMgEdge = input.mgFiring && state.inputs.pilot?.mgFiring !== true;
  return {
    ...state,
    queuedMgFire: state.queuedMgFire || isRisingMgEdge,
    // A spin names no bearing, so the remembered one is dropped rather than
    // left behind for the hull to be pulled back to.
    headingTargetAngle:
      turn !== null
        ? null
        : isZeroVector(vector)
          ? state.headingTargetAngle
          : canonicalizeAngle(Math.atan2(vector.y, vector.x)),
    inputs: {
      ...state.inputs,
      pilot: {
        vector,
        mgFiring: input.mgFiring,
        receivedTick: input.receivedTick,
        turn,
        thrust: input.thrust ?? null
      }
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
