import { type ArenaMatchConfig } from "./arenaMatchTypes.ts";
import { type ArenaZone } from "./arenaZones.ts";
import { nextUint32 } from "./rng.ts";

/**
 * What a drop is, by what it is worth.
 *
 * Three kinds rather than Steel Hunter's four: the fourth is what a wreck
 * leaves behind, and a match has no wrecks to loot until someone decides what a
 * kill pays. These three are the ones the field puts out on a timer.
 */
export type ArenaLootKind = "ammo" | "gear" | "cargo";

export interface ArenaLootState {
  readonly id: string;
  readonly kind: ArenaLootKind;
  /** World coordinates, like everything else a hull is measured against. */
  readonly x: number;
  readonly y: number;
  /** The rectangle it was put in; one drop per rectangle is the whole rule. */
  readonly zoneId: number;
  readonly spawnedTick: number;
  /**
   * Who is standing in it right now, and how long they have held it.
   *
   * A drop is taken by staying, not by touching: the hull that entered has to
   * sit still in the circle while the timer runs, which turns every crate into
   * a place worth ambushing. The hold is dropped the moment that hull leaves or
   * is hit - progress a fight cannot interrupt is not a decision.
   */
  readonly captureShipId: string | null;
  readonly captureTicks: number;
}

export interface ArenaLootStep {
  readonly loot: readonly ArenaLootState[];
  /** Drops taken this tick, in the order they were taken; the reward is not decided yet. */
  readonly taken: readonly { readonly drop: ArenaLootState; readonly shipId: string }[];
  readonly ticksUntilLoot: number;
  readonly ticksUntilCargo: number;
  readonly nextLootSequence: number;
  readonly rngState: number;
}

/**
 * The field's own supply run.
 *
 * Two clocks, because the two are different promises: the common drops come
 * often and fill the board, the cargo is rare and worth crossing the field for.
 * Both are the operator's numbers.
 *
 * Three rules decide where a drop may land, and all three are about the same
 * thing - a drop has to be somewhere a pilot can still go and worth going to.
 * Never in ground that is already killing; never in a rectangle that already
 * holds one, because a pile in one corner is one trip rather than many; and
 * never past the caps, which is what keeps the field readable when nobody is
 * collecting.
 */
export function advanceArenaLoot(
  loot: readonly ArenaLootState[],
  zones: readonly ArenaZone[],
  /** Where every hull is after this tick's movement, and who was hit in it. */
  ships: readonly {
    readonly id: string;
    readonly alive: boolean;
    readonly spaceship: { readonly x: number; readonly y: number };
  }[],
  hurt: ReadonlySet<string>,
  clock: { readonly tick: number },
  ticksUntilLoot: number,
  ticksUntilCargo: number,
  nextLootSequence: number,
  rngState: number,
  config: ArenaMatchConfig
): ArenaLootStep {
  const held = advanceCaptures(loot, ships, hurt, config);

  /*
   * The opening quiet is the first countdown, not a gate in front of it.
   *
   * Held as a separate test it delayed the first drop by the hold-off *and*
   * then a full interval - a field told "first loot after fifteen seconds, then
   * one a minute" put nothing out for seventy-five. The match starts both
   * clocks at the hold-off instead, so the field's own numbers mean what they
   * say and the count-down is the only mechanism.
   */
  const commonDue = ticksUntilLoot <= 1;
  const cargoDue = ticksUntilCargo <= 1;
  if (!commonDue && !cargoDue) {
    return {
      loot: held.loot,
      taken: held.taken,
      ticksUntilLoot: ticksUntilLoot - 1,
      ticksUntilCargo: ticksUntilCargo - 1,
      nextLootSequence,
      rngState
    };
  }

  let seed = rngState;
  let dropped = [...held.loot];
  let sequence = nextLootSequence;

  /*
   * A beat fills the board rather than adding to it.
   *
   * The field is meant to be stocked: as many drops as the caps allow, wherever
   * there is open ground for them, and the interval is how often what has been
   * taken or swallowed is put back. One a beat left a nearly empty board for
   * most of a match, which is a supply line nobody plans around.
   */
  const wanted: ArenaLootKind[] = [];
  // The heavy one first, and outside the board's cap.
  //
  // The cap is the common two - sixteen of each - and the cargo is the rare
  // exception everybody is crossing the field for. Queued behind a full board
  // it never landed at all, which is the one drop that must always land.
  if (cargoDue) wanted.push("cargo");
  if (commonDue) {
    for (let index = 0; index < config.lootCapPerKind; index += 1) wanted.push("ammo", "gear");
  }

  for (const kind of wanted) {
    const free = openZones(dropped, zones, kind, config);
    if (free.length === 0) break;
    if (kind !== "cargo" && countOf(dropped, kind) >= config.lootCapPerKind) continue;
    if (kind !== "cargo" && commonCount(dropped) >= config.lootSceneCap) continue;
    // The stream the campaign's salvage rolls on: a state in, a state out, so
    // the same seed replays the same supply run.
    const [nextSeed, roll] = nextUint32(seed);
    seed = nextSeed;
    const zone = free[roll % free.length];
    if (zone === undefined) break;
    dropped.push({
      id: `loot-${String(sequence)}`,
      kind,
      // The middle of the rectangle: a drop is a place on the map, and a pilot
      // reads the rectangle long before they read the dot inside it.
      x: zone.x + zone.width / 2,
      y: zone.y + zone.height / 2,
      zoneId: zone.id,
      spawnedTick: clock.tick,
      captureShipId: null,
      captureTicks: 0
    });
    sequence += 1;
  }

  // Whatever the closing field has swallowed goes with it: a drop under a red
  // rectangle is bait no one may take.
  dropped = dropped.filter((drop) => zoneOf(zones, drop.zoneId)?.state !== "closed");

  return {
    loot: dropped,
    taken: held.taken,
    ticksUntilLoot: commonDue ? config.lootIntervalTicks : ticksUntilLoot - 1,
    ticksUntilCargo: cargoDue ? config.lootCargoIntervalTicks : ticksUntilCargo - 1,
    nextLootSequence: sequence,
    rngState: seed
  };
}

/**
 * One tick of every hold on the field.
 *
 * A hull holds a drop by standing in its circle. The hold survives only while
 * the same hull is still inside and was not hit this tick - leaving or being
 * shot puts the timer back to nothing, which is what makes a crate a place to
 * fight over rather than a thing to drive through. When several hulls are in
 * the circle the one already holding it keeps it; a contested circle is decided
 * by guns, not by arithmetic.
 */
function advanceCaptures(
  loot: readonly ArenaLootState[],
  ships: readonly {
    readonly id: string;
    readonly alive: boolean;
    readonly spaceship: { readonly x: number; readonly y: number };
  }[],
  hurt: ReadonlySet<string>,
  config: ArenaMatchConfig
): {
  readonly loot: readonly ArenaLootState[];
  readonly taken: readonly { readonly drop: ArenaLootState; readonly shipId: string }[];
} {
  const radius = config.ship.spaceshipRadius * config.lootCaptureRadiusHulls;
  const taken: { drop: ArenaLootState; shipId: string }[] = [];
  const held: ArenaLootState[] = [];

  for (const drop of loot) {
    const inside = ships.filter(
      (ship) =>
        ship.alive && Math.hypot(ship.spaceship.x - drop.x, ship.spaceship.y - drop.y) <= radius
    );
    const holder =
      drop.captureShipId !== null && inside.some((ship) => ship.id === drop.captureShipId)
        ? drop.captureShipId
        : (inside[0]?.id ?? null);

    if (holder === null || hurt.has(holder)) {
      held.push({ ...drop, captureShipId: null, captureTicks: 0 });
      continue;
    }

    const ticks = holder === drop.captureShipId ? drop.captureTicks + 1 : 1;
    if (ticks >= config.lootCaptureTicks) {
      taken.push({ drop, shipId: holder });
      continue;
    }
    held.push({ ...drop, captureShipId: holder, captureTicks: ticks });
  }

  return { loot: held, taken };
}

/**
 * Where a drop of this kind may land.
 *
 * The common two take any ground that is not already killing and not already
 * holding something. The heavy one is choosier on both counts: never in a
 * rectangle that has started to close - a prize worth crossing the field for
 * must not expire while somebody is crossing - and drawn from the half nearest
 * the middle, so the thing everybody wants is where the field is herding them
 * anyway rather than out on a rim they are being pushed off.
 */
function openZones(
  loot: readonly ArenaLootState[],
  zones: readonly ArenaZone[],
  kind: ArenaLootKind,
  config: ArenaMatchConfig
): readonly ArenaZone[] {
  const taken = new Set(loot.map((drop) => drop.zoneId));
  const free = zones.filter((zone) => zone.state !== "closed" && !taken.has(zone.id));
  if (kind !== "cargo") return free;

  const settled = free.filter((zone) => zone.state === "safe");
  if (settled.length <= 2) return settled;
  const centreX = config.ship.worldWidth / 2;
  const centreY = config.ship.worldHeight / 2;
  const byDistance = [...settled].sort(
    (left, right) =>
      distanceFromCentre(left, centreX, centreY) - distanceFromCentre(right, centreX, centreY)
  );
  return byDistance.slice(0, Math.max(1, Math.ceil(byDistance.length / 2)));
}

function distanceFromCentre(zone: ArenaZone, centreX: number, centreY: number): number {
  return Math.hypot(zone.x + zone.width / 2 - centreX, zone.y + zone.height / 2 - centreY);
}

/** The board's own cap counts the common two; the cargo is beside it. */
function commonCount(loot: readonly ArenaLootState[]): number {
  return loot.filter((drop) => drop.kind !== "cargo").length;
}

function countOf(loot: readonly ArenaLootState[], kind: ArenaLootKind): number {
  return loot.filter((drop) => drop.kind === kind).length;
}

function zoneOf(zones: readonly ArenaZone[], zoneId: number): ArenaZone | undefined {
  return zones.find((zone) => zone.id === zoneId);
}
