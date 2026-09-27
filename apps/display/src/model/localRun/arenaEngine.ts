import { toSimulationConfig } from "@spaceship-defender/balance-core";
import {
  ARENA_PLAYER_SLOT,
  PLAIN_ARENA_PROJECTION_FACTORIES,
  createArenaProjectionMemo,
  createArenaRun,
  createLocalMirror,
  projectArenaFixtures,
  projectArenaMatch,
  type LocalMirror
} from "@spaceship-defender/game-runtime";
import type { ArenaShipState } from "@spaceship-defender/game-core";
import type { BalanceTuning } from "@spaceship-defender/protocol";

import type { PredictedPoseFrame } from "../shipPrediction.js";
import type { LocalIntent } from "./engine.js";

/**
 * A training match hosted by this device.
 *
 * The match, its bots, the sweep and the projection are the room's own code
 * from `game-runtime`; what is written here is only what a device host owns -
 * the seat that is always taken, the mirror it draws from, and when the match
 * is over for the person holding the phone.
 */

export interface LocalArenaOptions {
  readonly tuning: BalanceTuning;
  readonly playerName: string;
  /** The first match's seed; a restart draws the next one. */
  readonly seed?: number;
}

export interface LocalArena {
  readonly kind: "arena";
  readonly mirror: LocalMirror;
  /** The match's fixed step, which the host's clock counts in. */
  readonly fixedStepMs: number;
  /** Advances one fixed step with the frame the cockpit is holding. */
  readonly step: (intent: LocalIntent) => void;
  /** Writes the current frame into the mirror; the caller publishes it. */
  readonly project: (stepCostMs: number) => void;
  readonly scan: () => void;
  readonly restart: () => void;
  /** The player's hull as the scene draws it this frame. */
  readonly pose: () => PredictedPoseFrame;
  /** The step that pose belongs to; the clock the page's own shells are born on. */
  readonly tick: () => number;
  /** Over for the player: shot down, or the match decided. Nothing moves after. */
  readonly settled: () => boolean;
}

export function createLocalArena(options: LocalArenaOptions): LocalArena {
  const { tuning, playerName } = options;
  // The server takes no hull for a match, so neither does a device: the
  // preset's default, as the room builds it.
  const hull = toSimulationConfig(tuning, tuning.defaultShipArchetypeId);
  const run = createArenaRun({
    tuning,
    hull,
    ...(options.seed === undefined ? {} : { seed: options.seed })
  });
  const mirror = createLocalMirror();
  let memo = createArenaProjectionMemo();
  let runNumber = 0;

  function start(): void {
    runNumber += 1;
    memo = createArenaProjectionMemo();
    mirror.roomId = "LOCAL";
    mirror.phase = "active";
    mirror.runNumber = runNumber;
    mirror.crewSize = 1;
    mirror.shipArchetypeId = tuning.defaultShipArchetypeId;
    mirror.hasGame = true;
    mirror.players = new Map([
      [
        "local-pilot",
        {
          playerId: "local-pilot",
          playerName,
          role: "pilot" as const,
          ready: true,
          connected: true,
          latencyMs: -1
        }
      ]
    ]);
    // A new match starts from an empty field, not from the last one's wrecks.
    mirror.game.display.arenaShips.clear();
    mirror.game.display.arenaLoot.clear();
    mirror.game.display.friendlyProjectiles.clear();
    mirror.game.display.hostileProjectiles.clear();
    mirror.game.encounter.hasOutcome = false;
    mirror.game.encounter.hasDefeatReason = false;
    projectArenaFixtures(mirror.game, tuning, run.config);
  }

  const player = (): ArenaShipState | undefined => run.state().ships[ARENA_PLAYER_SLOT];

  const settled = (): boolean => {
    const hull = player();
    return run.state().phase === "result" || (hull !== undefined && !hull.alive);
  };

  start();

  return {
    kind: "arena",
    mirror,
    fixedStepMs: run.config.ship.fixedStepMs,

    step(intent) {
      if (settled()) return;
      run.step(intent);
    },

    project(stepCostMs) {
      // Readiness tracks the match, as it does in a local campaign: false once
      // it is over is what puts "Играть ещё" on the result screen.
      const seat = mirror.players.get("local-pilot");
      if (seat !== undefined) seat.ready = !settled();
      projectArenaMatch(
        mirror.game,
        run.state(),
        run.config,
        { seated: true, scan: run.scanState() },
        memo,
        PLAIN_ARENA_PROJECTION_FACTORIES
      );
      mirror.game.display.serverStepMs = stepCostMs;
      mirror.game.display.appliedInputSeq = 0;
    },

    scan() {
      run.scan();
    },

    restart() {
      run.restart();
      start();
    },

    tick: () => run.state().clock.tick,

    pose() {
      const hull = player();
      if (hull === undefined) {
        return {
          x: 0,
          y: 0,
          velocityX: 0,
          velocityY: 0,
          heading: 0,
          turretAngle: 0,
          headingAngularVelocity: 0,
          hasHeadingTarget: false,
          headingTargetAngle: 0,
          turretAngularVelocity: 0,
          hasTurretTarget: false,
          turretTargetAngle: 0
        };
      }
      return {
        x: hull.spaceship.x,
        y: hull.spaceship.y,
        velocityX: hull.spaceship.velocity.x,
        velocityY: hull.spaceship.velocity.y,
        heading: hull.heading,
        turretAngle: hull.turretAngle,
        headingAngularVelocity: hull.headingAngularVelocity,
        hasHeadingTarget: hull.headingTargetAngle !== null,
        headingTargetAngle: hull.headingTargetAngle ?? 0,
        turretAngularVelocity: hull.turretAngularVelocity,
        hasTurretTarget: hull.turretTargetAngle !== null,
        turretTargetAngle: hull.turretTargetAngle ?? 0
      };
    },

    settled
  };
}
