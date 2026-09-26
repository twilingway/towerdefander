import {
  IDLE_ARENA_INTENT,
  advanceArenaMatch,
  canonicalizeAngle,
  createArenaMatch,
  normalizeVector,
  type ArenaMatchConfig,
  type ArenaMatchState,
  type ArenaShipIntent,
  type SpaceshipSimulationConfig
} from "@spaceship-defender/game-core";
import type { BalanceTuning } from "@spaceship-defender/protocol";

import { ArenaBots } from "./arenaBots.ts";
import { sweepArena, toArenaScanTuning, type ArenaScanTuning } from "./arenaScan.ts";
import { ARENA_PLAYER_SLOT, createArenaSeats, toArenaMatchConfig } from "./arenaSetup.ts";
import { resolveAutopilotProfile } from "./crewPolicy.mjs";
import { createRunSeed } from "./runSeed.ts";

/**
 * A match around the pure step, for whoever is hosting it.
 *
 * The room and a device play the same match: the bots decide the same way, the
 * seated player's frame lands on the same hull, and the sweep reaches the same
 * cells. What stays with each host is only what it alone can mean - a room's
 * queue, timers and sockets, a device's worker and its pause.
 */

/** What the cockpit is holding this step, in the shape both cockpits read it. */
export interface ArenaCockpitFrame {
  readonly vector: { readonly x: number; readonly y: number };
  readonly turn: number | null;
  readonly thrust: number | null;
  readonly mgFiring: boolean;
  readonly aim: { readonly x: number; readonly y: number };
  readonly aimTurn: number | null;
  readonly firing: boolean;
}

/**
 * The bearings the hull and the gun were last told to hold.
 *
 * A released stick sends a zero vector, which names no bearing at all; the
 * campaign's helm keeps the previous one in that case, and the client's own
 * prediction assumes it does. Forgetting it would brake the hull the instant a
 * thumb lifts while the predictor kept turning - the two would disagree every
 * time a player let go.
 */
export interface ArenaHeldTargets {
  readonly heading: number | null;
  readonly turret: number | null;
}

export const NO_HELD_TARGETS: ArenaHeldTargets = { heading: null, turret: null };

/** One cockpit frame as the hull's intent, and the bearings it leaves held. */
export function arenaIntentFromCockpit(
  frame: ArenaCockpitFrame,
  held: ArenaHeldTargets
): { readonly intent: ArenaShipIntent; readonly held: ArenaHeldTargets } {
  const heading = heldTarget(frame.vector, frame.turn, held.heading);
  const turret = heldTarget(frame.aim, frame.aimTurn, held.turret);
  return {
    intent: {
      // Normalised the way the room stores it, so both sides step the same
      // vector rather than one a fraction longer.
      driveVector: normalizeVector(frame.vector),
      turn: frame.turn,
      thrust: frame.thrust,
      headingTargetAngle: heading,
      turretTargetAngle: turret,
      turretTurn: frame.aimTurn,
      firing: frame.firing,
      mgFiring: frame.mgFiring,
      // Filled from the autopilot by the step; the cockpit has no sector.
      shieldTargetAngle: null,
      shieldActive: false
    },
    held: { heading, turret }
  };
}

/** The bots of a match, on the preset's autopilot at the preset's level. */
export function createArenaBots(tuning: BalanceTuning, config: ArenaMatchConfig): ArenaBots {
  return new ArenaBots(
    config,
    resolveAutopilotProfile(tuning.autopilot, tuning.autopilot.level, config.ship.cannonWeaponKind)
  );
}

/**
 * One step of the match: every bot's decision, the seated player's frame over
 * their own hull, and the core's step.
 *
 * `player` is null while nobody holds the seat, which is when the autopilot
 * flies it. A decided match does not move.
 */
export function stepArenaMatch(
  match: ArenaMatchState,
  config: ArenaMatchConfig,
  bots: ArenaBots,
  player: ArenaShipIntent | null
): ArenaMatchState {
  if (match.phase === "result") return match;

  const intents = new Map(bots.intentsFor(match, config));
  const hull = match.ships[ARENA_PLAYER_SLOT];
  // The seated player's own frame wins over whatever the bot wanted for that
  // hull, and an empty seat keeps flying itself.
  if (player !== null && hull !== undefined) {
    const autopilot = intents.get(hull.id) ?? IDLE_ARENA_INTENT;
    intents.set(hull.id, {
      ...player,
      /*
       * The shield stays with the autopilot, because the cockpit has no
       * control for it. A solo seat in the campaign is helm and gun - the
       * sector is a third pair of hands, and an empty crew seat is what the
       * policy layer exists to fill. Taking it away here would simply mean
       * nobody ever raises it.
       */
      shieldTargetAngle: autopilot.shieldTargetAngle,
      shieldActive: autopilot.shieldActive
    });
  }
  return advanceArenaMatch(match, intents, config);
}

export interface ArenaRunOptions {
  readonly tuning: BalanceTuning;
  readonly hull: SpaceshipSimulationConfig;
  /** The first match's seed; a restart draws the next one. */
  readonly seed?: number;
}

/** The sweep as the host holds it between two presses. */
export interface ArenaScanState {
  readonly readyTick: number;
  readonly revealedUntilTick: number;
  readonly revealed: ReadonlySet<string>;
}

/** A training match hosted by a device: the player always holds slot 0. */
export interface ArenaRun {
  readonly config: ArenaMatchConfig;
  readonly state: () => ArenaMatchState;
  readonly scanState: () => ArenaScanState;
  /** Advances one fixed step with the frame the cockpit is holding. */
  readonly step: (frame: ArenaCockpitFrame) => void;
  /** A press of the sweep button; ignored while it is cooling down. */
  readonly scan: () => void;
  readonly restart: () => void;
}

export function createArenaRun(options: ArenaRunOptions): ArenaRun {
  const { tuning, hull } = options;
  const config = toArenaMatchConfig(tuning, hull);
  const scanTuning: ArenaScanTuning = toArenaScanTuning(tuning);

  let match: ArenaMatchState;
  let bots: ArenaBots;
  let held: ArenaHeldTargets;
  let scan: ArenaScanState;
  let previousSeed: number | undefined;

  function start(seed: number): void {
    previousSeed = seed;
    match = createArenaMatch(config, seed, createArenaSeats(config, tuning.autopilot.level));
    bots = createArenaBots(tuning, config);
    held = NO_HELD_TARGETS;
    scan = { readyTick: 0, revealedUntilTick: 0, revealed: new Set() };
  }

  start(options.seed ?? createRunSeed(undefined));

  return {
    config,
    state: () => match,
    scanState: () => scan,

    step(frame) {
      const cockpit = arenaIntentFromCockpit(frame, held);
      held = cockpit.held;
      match = stepArenaMatch(match, config, bots, cockpit.intent);
    },

    scan() {
      const found = sweepArena(match, config, scanTuning, scan.readyTick);
      if (found !== undefined) scan = found;
    },

    restart() {
      start(createRunSeed(previousSeed));
    }
  };
}

/** A stick reading is a direction; the simulation wants the bearing of it. */
function bearingOf(vector: { readonly x: number; readonly y: number }): number | null {
  if (vector.x === 0 && vector.y === 0) return null;
  return Math.atan2(vector.y, vector.x);
}

/**
 * The bearing a stick names, or the one it named last.
 *
 * The client's own replay resolves it exactly this way, and it has to: a rate
 * command names no bearing at all, and a released stick sends a zero vector,
 * which is not "point north" but "keep going where you were pointed".
 */
function heldTarget(
  vector: { readonly x: number; readonly y: number },
  turn: number | null,
  previous: number | null
): number | null {
  if (turn !== null) return null;
  const normalized = normalizeVector(vector);
  const bearing = bearingOf(normalized);
  return bearing === null ? previous : canonicalizeAngle(bearing);
}
