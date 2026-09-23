import {
  applyGunnerInput,
  applyPilotInput,
  applyShieldInput,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState
} from "@spaceship-defender/game-core";
import type { AutopilotProfile, CrewRole } from "@spaceship-defender/protocol";

import { planGunner, planPilot, planShield } from "./crewPolicy.mjs";
import type { PolicyMemory, PolicyOptions } from "./crewPolicy.d.mts";
import { buildCrewWorld } from "./crewWorld.ts";

/**
 * One definition of "drive the seats nobody is holding".
 *
 * There used to be two: the room's and the measurement stand's, and they had
 * drifted. The stand drove the pilot and the gunner in any phase while the room
 * drove them only in combat; the stand decided the shield seat by its own
 * condition while the room asked who owned the input; and the stand handed the
 * policy an explicit `nowMs` where the room left it to the world's own stamp. A
 * rule fixed in one was therefore not fixed in the game, which is exactly what
 * `AGENTS.md` warns about.
 *
 * Both hosts already agree on the clock -- `POLICY_TICK_MS` is 50 on each, which
 * `crewWorld.ts` explains and keeps until its own change corrects it -- so it
 * rides here as a parameter rather than a constant only because the caller is
 * the one that knows it.
 *
 * Everything they differ in is now an argument named at the call site, and each
 * host passes what it passes today, so this move changes neither the measured
 * numbers nor the game.
 */
export interface CrewAutopilotOptions {
  /** Exactly the seats to drive this step; the host decides what that means. */
  readonly seats: readonly CrewRole[];
  /** What one tick is worth to the policy; 50 ms on both hosts today. */
  readonly policyTickMs: number;
  readonly profile: AutopilotProfile;
  readonly memory: PolicyMemory;
  readonly options?: PolicyOptions;
  /** Set when the host wants the policy's own `nowMs` to differ from the tick. */
  readonly nowMs?: number;
}

export function driveCrewSeats(
  game: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig,
  { seats, policyTickMs, profile, memory, options = {}, nowMs }: CrewAutopilotOptions
): SpaceshipSimulationState {
  if (seats.length === 0) return game;

  const at = nowMs ?? game.clock.tick * policyTickMs;
  const world = buildCrewWorld(game, config, at);
  let next = game;

  if (seats.includes("pilot")) {
    const plan = planPilot(world, profile, memory, options);
    next = applyPilotInput(next, {
      vector: plan.vector,
      turn: plan.turn,
      thrust: plan.thrust,
      mgFiring: plan.mgFiring,
      receivedTick: next.clock.tick
    });
  }
  if (seats.includes("gunner")) {
    const plan = planGunner(world, profile, memory, options);
    next = applyGunnerInput(next, {
      vector: plan.aim,
      firing: plan.firing,
      receivedTick: next.clock.tick
    });
  }
  if (seats.includes("shield")) {
    const plan = planShield(world, profile, memory, options);
    next = applyShieldInput(next, {
      vector: plan.aim,
      active: plan.active,
      receivedTick: next.clock.tick
    });
  }

  return next;
}
