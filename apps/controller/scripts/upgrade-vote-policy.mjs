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
 * How attractive a card is before the ship's condition is taken into account,
 * keyed by what its first effect changes rather than by the module's id.
 *
 * Ids stopped being a closed list when the tree moved into the preset: an
 * operator authoring a new module cannot be expected to also teach the bot
 * about it. A target with no row here falls back to 1, so the bot keeps buying
 * something sensible on a tree it has never seen.
 */
const TARGET_WEIGHT = {
  spaceshipMaxHp: 1.4,
  friendlyProjectileDamage: 1.6,
  fireCooldownTicks: 1.3,
  mgDamage: 1.2,
  mgFireCooldownTicks: 1.1,
  shieldCapacity: 1.2,
  shieldRechargePerSecond: 1.1,
  shieldDrainPerSecond: 1,
  shieldArcRadians: 0.8,
  projectileSpeedPerSecond: 0.9,
  spaceshipSpeedPerSecond: 1,
  spaceshipAccelerationPerSecondSquared: 1
};

/** What a card is mainly about: the target of the first effect it carries. */
function primaryTarget(card) {
  return card?.effects?.[0]?.target;
}

/** Which need signal a target answers, so the weights bend with the run. */
const HULL_TARGETS = new Set(["spaceshipMaxHp"]);
const SHIELD_TARGETS = new Set([
  "shieldCapacity",
  "shieldRechargePerSecond",
  "shieldDrainPerSecond",
  "shieldArcRadians"
]);
const GUN_TARGETS = new Set([
  "friendlyProjectileDamage",
  "fireCooldownTicks",
  "mgDamage",
  "mgFireCooldownTicks",
  "cannonHeatCapacity",
  "cannonCoolingPerSecond"
]);

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
function needFor(target, ship) {
  const hurt = clamp01(1 - safeShare(ship.hp, ship.maxHp, 1));
  const shieldStrain = clamp01(1 - safeShare(ship.shieldEnergy, ship.shieldCapacity, 1));
  const slowWave = clamp01((ship.waveSeconds ?? 0) / TARGET_WAVE_SECONDS - 1);
  if (target !== undefined && HULL_TARGETS.has(target)) return 1 + hurt;
  if (target !== undefined && SHIELD_TARGETS.has(target)) return 1 + shieldStrain;
  if (target !== undefined && GUN_TARGETS.has(target)) return 1 + slowWave;
  return 1;
}

function safeShare(value, total, fallback) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return fallback;
  return value / total;
}

function weightOf(card, level, ship) {
  const target = primaryTarget(card);
  const base = (target === undefined ? undefined : TARGET_WEIGHT[target]) ?? 1;
  const sensitivity = NEED_SENSITIVITY[level] ?? 0;
  return Math.max(0.001, base * (1 + sensitivity * (needFor(target, ship) - 1)));
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
