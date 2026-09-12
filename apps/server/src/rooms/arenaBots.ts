import {
  IDLE_ARENA_INTENT,
  type ArenaMatchConfig,
  type ArenaMatchState,
  type ArenaShipIntent,
  type ArenaShipState
} from "@spaceship-defender/game-core";
import type { AutopilotProfile } from "@spaceship-defender/protocol";

import { ARENA_POLICY_TICK_MS, buildArenaWorld } from "./arenaWorld.js";
import { createAutopilotMemory, planGunner, planPilot, planShield } from "./crewPolicy.mjs";
import type { PolicyMemory, PolicyOptions } from "./crewPolicy.d.mts";

/**
 * Fifteen bots, each with its own memory and its own tick.
 *
 * The policy is the one the campaign flies - a bot here decides from the same
 * slice of arena a seated player would be looking at. What is new is only that
 * there are many of them, so each carries its own committed target and its own
 * seeded stream, and they think on different ticks: fifteen ranking passes in
 * the same step would be a spike three times a second instead of a flat load.
 */
export class ArenaBots {
  private readonly memories = new Map<string, PolicyMemory>();
  private readonly intents = new Map<string, ArenaShipIntent>();
  private readonly options: PolicyOptions;
  private readonly profile: AutopilotProfile | undefined;
  private readonly stepMs: number;

  constructor(config: ArenaMatchConfig, profile: AutopilotProfile | undefined) {
    this.profile = profile;
    this.stepMs = config.ship.fixedStepMs;
    this.options = {
      shieldRaiseRange: config.ship.shieldAutopilotRaiseRange,
      shieldDrain: config.ship.shieldDrainPerSecond,
      cannonSpeed: config.ship.projectileSpeedPerSecond,
      mgSpeed: config.ship.mgProjectileSpeedPerSecond,
      turretRate: config.ship.turretMaxAngularSpeedPerSecond
    };
  }

  /**
   * What every server-driven hull wants this tick.
   *
   * A hull decides on its own tick and holds that decision until its next one,
   * which is exactly what a player does between two thumb movements.
   */
  intentsFor(
    state: ArenaMatchState,
    config: ArenaMatchConfig
  ): ReadonlyMap<string, ArenaShipIntent> {
    const profile = this.profile;
    if (profile === undefined) return new Map();

    const ticksPerDecision = Math.max(1, Math.round(ARENA_POLICY_TICK_MS / this.stepMs));
    const tick = state.clock.tick;

    for (const ship of state.ships) {
      // Human slots are driven too: a seat nobody claimed has to keep flying,
      // and the room overwrites this hull's intent the moment somebody does.
      if (!ship.alive) {
        this.intents.delete(ship.id);
        continue;
      }
      // Spread across the window by slot, so one hull decides per tick instead
      // of all fifteen landing on the same one.
      if ((tick + ship.slot) % ticksPerDecision !== 0) continue;
      this.intents.set(ship.id, this.decide(ship, state, config, profile, tick));
    }

    return this.intents;
  }

  private decide(
    ship: ArenaShipState,
    state: ArenaMatchState,
    config: ArenaMatchConfig,
    profile: AutopilotProfile,
    tick: number
  ): ArenaShipIntent {
    let memory = this.memories.get(ship.id);
    if (memory === undefined) {
      memory = createAutopilotMemory(ship.botRngState);
      this.memories.set(ship.id, memory);
    }

    // Match time, never the wall clock: that is what keeps a seed replayable.
    const world = buildArenaWorld(state, ship, config, tick * this.stepMs);
    const options = { ...this.options, nowMs: tick * this.stepMs };
    const pilot = planPilot(world, profile, memory, options);
    const gunner = planGunner(world, profile, memory, options);
    const shield = planShield(world, profile, memory, options);

    return {
      ...IDLE_ARENA_INTENT,
      driveVector: pilot.vector,
      turn: pilot.turn,
      thrust: pilot.thrust,
      headingTargetAngle: bearingOf(pilot.vector),
      turretTargetAngle: bearingOf(gunner.aim),
      turretTurn: null,
      firing: gunner.firing,
      mgFiring: pilot.mgFiring,
      shieldTargetAngle: bearingOf(shield.aim),
      shieldActive: shield.active
    };
  }
}

/** A stick reading is a direction; the simulation wants the bearing of it. */
function bearingOf(vector: { readonly x: number; readonly y: number }): number | null {
  if (vector.x === 0 && vector.y === 0) return null;
  return Math.atan2(vector.y, vector.x);
}
