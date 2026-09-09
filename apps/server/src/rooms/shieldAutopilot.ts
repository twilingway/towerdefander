/**
 * Keep this file free of runtime relative imports — `import type` only.
 *
 * The headless balance harness (`apps/server/scripts/balance-run.mjs`) imports
 * `nextShieldIntent` from plain node to reproduce a crew that has no shield
 * seat. Node strips types but does not rewrite a `.js` specifier to `.ts`, so
 * one ordinary `./neighbour.js` import here would make every crew-1 and crew-2
 * measurement fail to load. The crew-size case in
 * `scripts/autopilot-stats.node-test.mjs` is what catches it.
 */
import type {
  SpaceshipSimulationConfig,
  SpaceshipSimulationState,
  TrustedShieldInput
} from "@spaceship-defender/game-core";

/** How early the sector goes up before a threat reaches the shield. */
const RAISE_WITHIN_SECONDS = 0.9;
/**
 * How near something has to stay for a sector already committed to stay up.
 *
 * The raise window alone made the sector blink. It is a per-tick decision with
 * no memory, so in a firefight - where the gap between two shells is routinely
 * longer than 0.9 s - the shield dropped the moment nothing was inside that
 * window, with most of the bank still full. Worse, the drop is not free: the
 * machine spends a second cooling and half a second raising again, so every
 * needless drop buys a second and a half of exposure to save a third of a
 * second of drain.
 *
 * Two windows instead of one, wide enough to cover the pause between shots of a
 * burst and between enemies taking turns: the sector goes up for something
 * close, and stays up while anything is still coming. In a real lull it still
 * drops and the bank still refills, which is the economy this policy is for -
 * and the energy floor below is untouched, so a sustained fight still cycles on
 * charge rather than on geometry.
 */
const HOLD_WITHIN_SECONDS = 2.5;
/**
 * The shield drains twice as fast as it recharges, so the autopilot stops
 * spending below this share of the bank and lets it refill. Dropping the sector
 * is also what clears the rearm latch after a depletion.
 */
const MIN_ACTIVATION_ENERGY_FRACTION = 0.1;

interface Threat {
  readonly x: number;
  readonly y: number;
  readonly velocity: { readonly x: number; readonly y: number };
  readonly radius: number;
}

/**
 * The shield intent for a room with no shield operator. Pure: same state and
 * config always yield the same intent, so the room stays deterministic and the
 * policy is testable without a client.
 */
export function nextShieldIntent(
  state: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig
): TrustedShieldInput {
  const reach = config.shieldRadius;
  // Raising counts as committed: dropping the intent mid-ramp throws away the
  // half second already spent and puts the sector up later than the shot.
  const committed = state.shieldPhase === "raising" || state.shieldPhase === "up";
  const nearest = findNearestThreat(
    state,
    reach,
    committed ? HOLD_WITHIN_SECONDS : RAISE_WITHIN_SECONDS
  );
  const capacity = state.ship.shieldCapacity;
  const hasEnergy = state.shieldEnergy >= capacity * MIN_ACTIVATION_ENERGY_FRACTION;
  const active = nearest !== undefined && hasEnergy;
  return {
    // A zero vector keeps the sector where it already points, so an idle tick
    // does not swing the shield back to a stale bearing.
    vector: nearest?.bearing ?? { x: 0, y: 0 },
    active,
    receivedTick: state.clock.tick
  };
}

function findNearestThreat(
  state: SpaceshipSimulationState,
  reach: number,
  withinSeconds: number
): { readonly bearing: { x: number; y: number } } | undefined {
  let bestSeconds = Number.POSITIVE_INFINITY;
  let bearing: { x: number; y: number } | undefined;
  for (const threat of threatsOf(state)) {
    const seconds = secondsToReach(state, threat, reach);
    if (seconds === undefined || seconds > withinSeconds || seconds >= bestSeconds) continue;
    bestSeconds = seconds;
    bearing = aimAt(state, threat, seconds);
  }
  return bearing === undefined ? undefined : { bearing };
}

function* threatsOf(state: SpaceshipSimulationState): Generator<Threat> {
  yield* state.homingMissiles;
  yield* state.hostileProjectiles;
  yield* state.asteroids;
}

/**
 * Seconds until the threat touches the shield ring, from the current relative
 * velocity. Undefined when it never closes, which is the common case for a rock
 * drifting past.
 */
function secondsToReach(
  state: SpaceshipSimulationState,
  threat: Threat,
  reach: number
): number | undefined {
  const relativeX = threat.x - state.spaceship.x;
  const relativeY = threat.y - state.spaceship.y;
  const velocityX = threat.velocity.x - state.spaceship.velocity.x;
  const velocityY = threat.velocity.y - state.spaceship.velocity.y;
  const radius = reach + threat.radius;
  const c = relativeX * relativeX + relativeY * relativeY - radius * radius;
  if (c <= 0) return 0;
  const a = velocityX * velocityX + velocityY * velocityY;
  if (a === 0) return undefined;
  const b = 2 * (relativeX * velocityX + relativeY * velocityY);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return undefined;
  const root = Math.sqrt(discriminant);
  const first = (-b - root) / (2 * a);
  if (first >= 0) return first;
  const second = (-b + root) / (2 * a);
  return second >= 0 ? second : undefined;
}

/** Where the threat will be when it arrives, so the sector leads it. */
function aimAt(
  state: SpaceshipSimulationState,
  threat: Threat,
  seconds: number
): { x: number; y: number } {
  const x = threat.x + threat.velocity.x * seconds - state.spaceship.x;
  const y = threat.y + threat.velocity.y * seconds - state.spaceship.y;
  const length = Math.hypot(x, y);
  if (length === 0) return { x: 1, y: 0 };
  return { x: x / length, y: y / length };
}
