import type { SpaceshipSimulationState } from "@spaceship-defender/game-core";

/**
 * A run with everything that thinks switched off.
 *
 * Not a game mode - a stand. Judder is hard to attribute while forty hulls,
 * their shells, drifting rocks, a wave clock and an autopilot all move at once:
 * any of them could be the frame that was missed. Here the arena holds a
 * handful of bodies crossing it at a constant speed and nothing else - no
 * enemies, no steering, no shield autopilot, no ambient drift - so a picture
 * that still moves in jerks is the stream or the drawing, and one that does not
 * points at what was taken away.
 *
 * The bodies are the game's own drifting rocks rather than a new kind of
 * entity: adding one to look at would change the renderer being measured, and
 * what matters is that they move in a straight line at a steady speed, which is
 * what the reference prototype's hulls do while nobody is steering them.
 *
 * The room turns it on from an environment variable, like the late-wave aid
 * beside it, and it never runs on a server nobody asked.
 */

/** Far enough out that no ambient rock arrives during a measurement. */
const NEVER_TICK = 2_147_483_647;
/** Big enough to be unmistakable on screen, small enough not to fill it. */
const DRIFTER_RADIUS = 46;
/** Units a second. Fast enough that a held frame is visible, slow enough to follow. */
const DRIFTER_SPEED = 260;
/** They exist to be watched, not fought: nothing removes one and nothing is hurt by it. */
const DRIFTER_HP = 1_000_000;

function drifter(
  index: number,
  count: number,
  state: SpaceshipSimulationState,
  arenaRadius: number
): SpaceshipSimulationState["asteroids"][number] {
  // Spread around the rim and sent across the middle, so every one of them
  // crosses the camera and none of them shadows another.
  const angle = (index / count) * Math.PI * 2;
  const start = arenaRadius * 0.8;
  const x = state.spaceship.x + Math.cos(angle) * start;
  const y = state.spaceship.y + Math.sin(angle) * start;
  return {
    id: `stand-${String(index)}`,
    origin: "wave",
    spawnSequence: state.nextSpawnSequence + index,
    spawnedTick: state.encounterTick,
    previousX: x,
    previousY: y,
    x,
    y,
    velocity: { x: -Math.cos(angle) * DRIFTER_SPEED, y: -Math.sin(angle) * DRIFTER_SPEED },
    radius: DRIFTER_RADIUS,
    hp: DRIFTER_HP,
    maxHp: DRIFTER_HP,
    damage: 0
  };
}

/** Strips a fresh run down to the stand: bodies crossing an empty arena. */
export function openSparringStand(
  state: SpaceshipSimulationState,
  wanted: number,
  arenaRadius: number
): SpaceshipSimulationState {
  return {
    ...state,
    pendingSpawns: [],
    enemies: [],
    asteroids: Array.from({ length: wanted }, (_unused, index) =>
      drifter(index, wanted, state, arenaRadius)
    ),
    ambientAsteroidSpawnDueTick: NEVER_TICK
  };
}

/**
 * Holds the stand still: the campaign never advances and the field never
 * empties.
 *
 * Both halves are needed, and the second one is not obvious. An arena with no
 * enemies counts as a cleared wave, so the encounter walks into the salvage
 * intermission and on to the next wave - and the display's own contract forbids
 * publishing moving entities during an intermission, so every patch then failed
 * to parse and the world stopped on screen while the ship flew on. A stand that
 * ends its own measurement after twenty-five seconds is worse than no stand.
 */
export function holdSparringStand(
  state: SpaceshipSimulationState,
  wanted: number,
  arenaRadius: number
): SpaceshipSimulationState {
  const bodies =
    state.asteroids.length >= wanted
      ? state.asteroids
      : [
          ...state.asteroids,
          ...Array.from({ length: wanted - state.asteroids.length }, (_unused, index) =>
            drifter(state.encounterTick + index, wanted, state, arenaRadius)
          )
        ];
  if (
    bodies === state.asteroids &&
    state.encounterPhase === "combat" &&
    state.enemies.length === 0 &&
    state.pendingSpawns.length === 0 &&
    state.teamUpgradeOffer === null
  ) {
    return state;
  }
  return {
    ...state,
    asteroids: bodies,
    enemies: [],
    pendingSpawns: [],
    encounterPhase: "combat",
    outcome: null,
    defeatReason: null,
    lootWindowTicksRemaining: 0,
    stalemateTicks: 0,
    waveNumber: 1,
    // The offer belongs to an intermission, and the stand does not have one.
    // Left standing beside a pinned combat it is a state the display's contract
    // refuses, and a refused patch stops the world exactly like a lost one.
    teamUpgradeOffer: null,
    teamUpgradeVotes: { pilot: null, gunner: null, shield: null },
    teamUpgradeSelection: null
  };
}
