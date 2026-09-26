import type { ArenaMatchConfig, ArenaMatchState } from "@spaceship-defender/game-core";
import type { BalanceTuning } from "@spaceship-defender/protocol";

import { ARENA_PLAYER_SLOT } from "./arenaSetup.ts";

/**
 * The sweep.
 *
 * A match is fought on a field several screens wide, so a pilot with no way to
 * look past their own camera is guessing. The sweep is Steel Hunter's answer:
 * press for a look, wait out a cooldown, and what it found stays on the dial a
 * while after it has moved.
 *
 * Held by the host rather than by the simulation because exactly one seat is
 * human. The moment a match seats sixteen people this has to move into
 * `ArenaShipState` and be published per client - what is revealed is one
 * pilot's knowledge, not the field's.
 */
export interface ArenaScanTuning {
  readonly radiusCells: number;
  readonly cooldownTicks: number;
  readonly revealTicks: number;
}

/** What one sweep found, and the two clocks it set. */
export interface ArenaSweep {
  readonly readyTick: number;
  readonly revealedUntilTick: number;
  readonly revealed: Set<string>;
}

/**
 * The operator's sweep, read once for the match like everything else: a
 * console edit lands on the next one.
 */
export function toArenaScanTuning(tuning: BalanceTuning): ArenaScanTuning {
  return {
    radiusCells: tuning.arena.scanRadiusCells,
    cooldownTicks: tuning.arena.scanCooldownTicks,
    revealTicks: tuning.arena.scanRevealTicks
  };
}

/**
 * One sweep of the dial, or undefined when none is due yet.
 *
 * Everything inside the radius is marked at once and the marks fade together:
 * a sweep is a photograph rather than a tracker, which is what makes it worth
 * spending and worth timing. A hull that has moved since is drawn where it was
 * found, and that is the point of the mechanic.
 */
export function sweepArena(
  match: ArenaMatchState,
  config: ArenaMatchConfig,
  tuning: ArenaScanTuning,
  readyTick: number
): ArenaSweep | undefined {
  const player = match.ships[ARENA_PLAYER_SLOT];
  if (player === undefined) return undefined;
  if (match.clock.tick < readyTick) return undefined;

  // A cell of the zone sheet, the longer side if the grid is not square: the
  // reach is read off the board, and the camera's width has no say in it.
  const span = config.arenaRadius * 2;
  const cell = Math.max(span / config.zoneColumns, span / config.zoneRows);
  const radius = cell * tuning.radiusCells;
  const revealed = new Set<string>();
  for (const ship of match.ships) {
    if (!ship.alive || ship.slot === ARENA_PLAYER_SLOT) continue;
    const distance = Math.hypot(
      ship.spaceship.x - player.spaceship.x,
      ship.spaceship.y - player.spaceship.y
    );
    if (distance <= radius) revealed.add(ship.id);
  }
  /*
   * And what the field has put out within the same reach.
   *
   * A sweep answers one question - what is around me - and a crate is as much
   * a part of that answer as a hull: the route a pilot picks after a sweep is
   * usually toward a drop rather than toward a fight. Same set, because both
   * fade on the same clock.
   */
  for (const drop of match.loot) {
    const distance = Math.hypot(drop.x - player.spaceship.x, drop.y - player.spaceship.y);
    if (distance <= radius) revealed.add(drop.id);
  }
  return {
    readyTick: match.clock.tick + tuning.cooldownTicks,
    revealedUntilTick: match.clock.tick + tuning.revealTicks,
    revealed
  };
}
