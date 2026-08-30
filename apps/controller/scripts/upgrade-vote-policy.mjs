/**
 * Which upgrade the autopilot crew buys on an intermission.
 *
 * Lives beside the flying policy rather than inside it: the file is one concern
 * and already long, and the headless stats harness in `apps/server` imports
 * from this directory, so the boundary is paid for. The cost of sitting on the
 * controller side is that `game-core` cannot be imported — hence the local
 * mixer below instead of `deriveDomainSeed`, the same price the flying policy
 * already pays for its own noise stream.
 */

/** Seats in the order a room fills them; mirrors CREW_ROLES on the server. */
export const CREW_ROLES = ["pilot", "gunner", "shield"];

/**
 * How attractive a card is before the ship's condition is taken into account.
 * A missing id falls back to 1, so a new upgrade joins the draw by adding a row
 * here rather than by touching the algorithm.
 */
const BASE_WEIGHT = {
  pilot_speed: 1,
  pilot_acceleration: 1,
  pilot_hull: 1.4,
  gunner_damage: 1.6,
  gunner_cooldown: 1.3,
  gunner_projectile_speed: 0.9,
  shield_capacity: 1.2,
  shield_recharge: 1.1,
  shield_arc: 0.8
};

/**
 * How far the ship's condition is allowed to bend the base weights. A rookie
 * draws flat — it buys whatever came up — while an ace weights by what the run
 * is actually short of. One number per level beats three tables: the levels
 * stay comparable because they differ in degree, not in kind.
 */
const NEED_SENSITIVITY = { rookie: 0, veteran: 0.5, ace: 1 };

/** A wave slower than this reads as "the guns are not enough". */
const TARGET_WAVE_SECONDS = 45;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * A stream of its own, keyed by run seed and wave, rather than the flying
 * policy's `memory.random`. That one is spent on aim jitter, so the number of
 * draws taken before an intermission depends on how the fight went — and a
 * changed aiming constant would then reshuffle every upgrade choice in every
 * run, which is exactly what must not happen when two presets are compared.
 */
function offerRandom(seed, waveNumber) {
  const mixed = Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(waveNumber >>> 0, 0x85ebca6b);
  return mulberry32(mixed >>> 0);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Three signals, each in [0, 1]: how hurt the hull is, how hard the shield is
 * being worked, and how badly the wave is dragging. Resist a fourth without
 * numbers to justify it.
 */
function needFor(upgradeId, ship) {
  const hurt = clamp01(1 - safeShare(ship.hp, ship.maxHp, 1));
  const shieldStrain = clamp01(1 - safeShare(ship.shieldEnergy, ship.shieldCapacity, 1));
  const slowWave = clamp01((ship.waveSeconds ?? 0) / TARGET_WAVE_SECONDS - 1);
  if (upgradeId === "pilot_hull") return 1 + hurt;
  if (upgradeId === "shield_capacity" || upgradeId === "shield_recharge") {
    return 1 + shieldStrain;
  }
  if (upgradeId === "gunner_damage" || upgradeId === "gunner_cooldown") return 1 + slowWave;
  return 1;
}

function safeShare(value, total, fallback) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return fallback;
  return value / total;
}

function weightOf(card, level, ship) {
  const base = BASE_WEIGHT[card.upgradeId] ?? 1;
  const sensitivity = NEED_SENSITIVITY[level] ?? 0;
  return Math.max(0.001, base * (1 + sensitivity * (needFor(card.upgradeId, ship) - 1)));
}

/** Which card the crew agrees on this intermission. */
export function drawUpgradeCard(offer, context) {
  const cards = offer?.cards ?? [];
  if (cards.length === 0) return undefined;
  const ship = context.ship ?? {};
  const random = offerRandom(context.seed ?? 1, context.waveNumber ?? 1);
  const weights = cards.map((card) => weightOf(card, context.level, ship));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let ticket = random() * total;
  for (let index = 0; index < cards.length; index += 1) {
    ticket -= weights[index];
    if (ticket <= 0) return cards[index];
  }
  return cards[cards.length - 1];
}

/**
 * Seats vote as the room would let them: only those the crew size covers, and
 * the last seat dissents in favour of its own role's card. At three seats that
 * is a 2:1 majority for the drawn card; at two it is a tie the core breaks in
 * card order; at one there is nobody to disagree with.
 *
 * The dissent is not decoration. Without it the measurement would only ever
 * exercise a unanimous ballot, and crews of one and two would be the same run.
 */
export function planUpgradeVotes(offer, context) {
  const drawn = drawUpgradeCard(offer, context);
  if (drawn === undefined) return [];
  const crewSize = Math.min(CREW_ROLES.length, Math.max(1, context.crewSize ?? CREW_ROLES.length));
  const seats = CREW_ROLES.slice(0, crewSize);
  const dissenter = crewSize >= 2 ? seats[seats.length - 1] : undefined;
  return seats.map((role) => {
    const own = offer.cards.find((card) => card.role === role);
    const card = role === dissenter && own !== undefined ? own : drawn;
    return { role, upgradeId: card.upgradeId };
  });
}
