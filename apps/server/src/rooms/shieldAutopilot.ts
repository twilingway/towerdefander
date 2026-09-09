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
 * When to stop spending and when to start again, in **seconds of drain**.
 *
 * Seconds rather than shares of the bank, and that is the whole point. A share
 * looks equivalent and is not: an operator who sets the capacity to 1200 gets a
 * tenth of it - six seconds of shield - held back as an untouchable reserve, and
 * a raise gate at sixty percent that asks for thirty-six seconds of drain, which
 * at ten a second is a full minute with no sector at all. Seconds of drain make
 * the rhythm the same whatever the bank: a big bank buys one long first hold
 * instead of a different policy.
 *
 * The hold has to be worth the ramp. Every raise spends half a second getting
 * up, during which the sector protects nothing, so raising for less than a few
 * seconds of drain is how the blink started.
 */
const DROP_BELOW_SECONDS = 1;
const RAISE_ABOVE_SECONDS = 4;
/**
 * Ceilings for both, as shares of the bank, so a small bank still works.
 *
 * A capacity smaller than a few seconds of drain would otherwise never clear
 * the raise gate and the sector would never go up at all.
 */
const DROP_BELOW_ENERGY_FRACTION = 0.1;
/**
 * How much of the bank has to be back before the sector goes up again.
 *
 * The other half of the blink, and the worse half. With one threshold the
 * policy raised the sector the moment it had the floor back: a headless trace
 * of a ship surrounded by six shells held for 5.4 s out of a full bank, and then
 * degenerated into 1.5 s up against 2.5 s down, forever, taking the bank to
 * zero every cycle. Once the reserve is a second and a half of drain, that is
 * all a cycle can ever be.
 *
 * No threshold can make the sector stay up in a sustained fight: at twenty
 * drained against ten recharged, holding for one second costs two seconds of
 * refilling, so a third of the time is the ceiling whatever the policy does.
 * What a threshold decides is the *rhythm* - and few long holds are worth more
 * than many short ones, because every raise costs half a second of ramp during
 * which the sector is not protecting anything. Measured, the trace turns into
 * roughly three seconds up against six down: the same third of the time, spent
 * in blocks a crew can read.
 */
const RAISE_ABOVE_ENERGY_FRACTION = 0.6;

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
  const incoming = findNearestThreat(
    state,
    reach,
    committed ? HOLD_WITHIN_SECONDS : RAISE_WITHIN_SECONDS
  );
  /*
   * The ships doing the shooting count, not only what is currently in the air.
   *
   * Shots were all this policy could see, and that failed in three ways at
   * once. A crowd does not fire continuously - a gunship reloads for up to
   * three and a half seconds - so between volleys there was nothing to hold
   * for. A shot only counts if it will actually reach the shield ring, so
   * against a ship that is running or circling, where most shots miss, nothing
   * ever qualified and the sector stayed down with enemies all around. And when
   * nothing qualified the intent carried a zero vector, which means "leave the
   * sector where it is" - so it sat pointing at the tail while the fight was
   * ahead.
   *
   * An enemy inside its own weapons' reach answers all three: it is a reason to
   * raise, a reason to keep holding, and a bearing to face.
   */
  const nearest = incoming ?? findNearestArmedEnemy(state, config);
  const capacity = state.ship.shieldCapacity;
  const drain = state.ship.shieldDrainPerSecond;
  // Hysteresis on the bank as well as on the distance: spend a sector down to
  // the floor, then leave it down until there is a hold worth raising for.
  const threshold = committed
    ? Math.min(capacity * DROP_BELOW_ENERGY_FRACTION, drain * DROP_BELOW_SECONDS)
    : Math.min(capacity * RAISE_ABOVE_ENERGY_FRACTION, drain * RAISE_ABOVE_SECONDS);
  const active = nearest !== undefined && state.shieldEnergy >= threshold;
  return {
    // A zero vector keeps the sector where it already points, so an idle tick
    // does not swing the shield back to a stale bearing.
    vector: nearest?.bearing ?? { x: 0, y: 0 },
    active,
    receivedTick: state.clock.tick
  };
}

/**
 * The nearest enemy close enough to be shooting at us, or nothing.
 *
 * Its own archetype's reach, rather than a number picked here: an interceptor
 * that has to close in is not a reason to hold a sector, and a gunship that
 * shells from nine hundred units away is.
 */
function findNearestArmedEnemy(
  state: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig
): { readonly bearing: { x: number; y: number } } | undefined {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bearing: { x: number; y: number } | undefined;
  for (const enemy of state.enemies) {
    const archetype = config.enemyArchetypes[enemy.kind];
    if (archetype === undefined) continue;
    let reach = 0;
    for (const weapon of archetype.weapons) reach = Math.max(reach, weapon.engagementRange);
    if (reach <= 0) continue;
    const x = enemy.x - state.spaceship.x;
    const y = enemy.y - state.spaceship.y;
    const distance = Math.hypot(x, y);
    if (distance > reach || distance >= bestDistance) continue;
    bestDistance = distance;
    bearing = distance === 0 ? { x: 1, y: 0 } : { x: x / distance, y: y / distance };
  }
  return bearing === undefined ? undefined : { bearing };
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
