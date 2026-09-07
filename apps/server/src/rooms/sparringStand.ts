import type { SpaceshipSimulationState } from "@spaceship-defender/game-core";

/**
 * A run with the wave script switched off and a fixed handful of enemies on the
 * field.
 *
 * Not a game mode - a stand. Judder is hard to attribute while forty hulls,
 * their shells, drifting rocks and a wave clock all move at once: any of them
 * could be the one costing the frame. With one hull crossing an empty arena
 * there is nothing else to blame, so a picture that still moves in jerks is the
 * stream or the drawing, and a picture that does not is load.
 *
 * The room turns it on from an environment variable, like the late-wave aid
 * beside it, and it never runs on a server nobody asked.
 */

/** Far enough out that no ambient rock arrives during a measurement. */
const NEVER_TICK = 2_147_483_647;

/**
 * Trims a fresh run down to the stand: the first `wanted` arrivals, all due at
 * once, and no ambient drift behind them.
 */
export function openSparringStand(
  state: SpaceshipSimulationState,
  wanted: number
): SpaceshipSimulationState {
  return {
    ...state,
    pendingSpawns: state.pendingSpawns.slice(0, wanted).map((spawn) => ({ ...spawn, dueTick: 0 })),
    ambientAsteroidSpawnDueTick: NEVER_TICK
  };
}

/**
 * Keeps the field at `wanted` after the crew shoots something.
 *
 * Without this the stand empties, the wave counts as cleared, and the next one
 * arrives in full - which is the noise the stand exists to remove. The refill
 * copies an arrival the wave plan already authored rather than inventing one,
 * so the enemies are the same the game spawns.
 */
export function refillSparringStand(
  state: SpaceshipSimulationState,
  wanted: number,
  template: SpaceshipSimulationState["pendingSpawns"]
): SpaceshipSimulationState {
  const present = state.enemies.length + state.pendingSpawns.length;
  if (present >= wanted) return state;
  const source = template[0];
  if (source === undefined) return state;
  const added = Array.from({ length: wanted - present }, (_unused, index) => ({
    ...source,
    planSequence: state.nextSpawnSequence + index,
    dueTick: state.encounterTick
  }));
  return { ...state, pendingSpawns: [...state.pendingSpawns, ...added] };
}
