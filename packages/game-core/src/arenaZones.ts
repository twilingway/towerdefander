import { type ArenaMatchConfig, type ArenaShipState } from "./arenaMatchTypes.ts";

/**
 * Where a zone is in its life. The names are the colours a player sees: safe,
 * about to close, closed and killing.
 */
export type ArenaZoneState = "safe" | "warning" | "closed";

export interface ArenaZone {
  readonly id: number;
  /** Grid position, so a display can draw the sheet without re-deriving it. */
  readonly column: number;
  readonly row: number;
  /** The rectangle itself, in arena coordinates. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly state: ArenaZoneState;
  /** Ticks until this zone moves on: to closed from warning, and that is all. */
  readonly ticksRemaining: number;
}

/**
 * The sheet of rectangles a match is played on.
 *
 * Steel Hunter's shape rather than a battle-royale circle: the field is cut
 * into zones, and they close one at a time - a warning first, then damage -
 * instead of one boundary creeping inward. What that buys is a squeeze with a
 * direction: the zone that closes is the one holding the most hulls, so the
 * pressure lands where the fight is rather than evenly on an empty rim.
 *
 * Built once at match creation and then only ever advanced, so the geometry is
 * fixed for the match and every client can draw it from the same numbers.
 */
export function createArenaZones(config: ArenaMatchConfig): readonly ArenaZone[] {
  const { zoneColumns, zoneRows } = config;
  const span = config.arenaRadius * 2;
  const width = span / zoneColumns;
  const height = span / zoneRows;
  // World coordinates, like everything else a hull is compared against: the
  // pose step holds ships inside a circle centred on the middle of the world.
  const centreX = config.ship.worldWidth / 2;
  const centreY = config.ship.worldHeight / 2;
  const zones: ArenaZone[] = [];

  for (let row = 0; row < zoneRows; row += 1) {
    for (let column = 0; column < zoneColumns; column += 1) {
      const x = centreX - config.arenaRadius + column * width;
      const y = centreY - config.arenaRadius + row * height;
      // A rectangle the disc never reaches is not a zone: closing it would be
      // a phase in which nothing happens, and drawing it would be a lie about
      // where the arena is.
      if (!touchesDisc(x - centreX, y - centreY, width, height, config.arenaRadius)) continue;
      zones.push({
        id: zones.length,
        column,
        row,
        x,
        y,
        width,
        height,
        state: "safe",
        ticksRemaining: 0
      });
    }
  }

  return zones;
}

export interface ArenaZoneStep {
  readonly zones: readonly ArenaZone[];
  /** Ticks until the next zone is picked; the caller keeps it in match state. */
  readonly ticksUntilNextClosure: number;
}

/**
 * One tick of the sheet: warnings expire into closures, and every so often the
 * next zone is chosen.
 *
 * The choice is the mechanic. Among the zones still safe, the one holding the
 * most living hulls is picked - a crowd is what the squeeze is for - and ties
 * go to the zone furthest from the centre, so a match collapses inward rather
 * than hollowing out its middle. The last safe zone is never taken: a field
 * with nowhere safe is the closing phase's job, not the sheet's.
 */
export function advanceArenaZones(
  zones: readonly ArenaZone[],
  ships: readonly ArenaShipState[],
  ticksUntilNextClosure: number,
  config: ArenaMatchConfig
): ArenaZoneStep {
  const advanced = zones.map((zone) => {
    if (zone.state !== "warning") return zone;
    const remaining = zone.ticksRemaining - 1;
    return remaining <= 0
      ? { ...zone, state: "closed" as const, ticksRemaining: 0 }
      : { ...zone, ticksRemaining: remaining };
  });

  const countdown = ticksUntilNextClosure - 1;
  if (countdown > 0) return { zones: advanced, ticksUntilNextClosure: countdown };

  const safe = advanced.filter((zone) => zone.state === "safe");
  // One safe zone left is the end of the sheet's work: everything after that is
  // the closing phase, which kills whatever is still alive wherever it stands.
  if (safe.length <= 1) {
    return { zones: advanced, ticksUntilNextClosure: config.zoneIntervalTicks };
  }

  const doomed = pickZoneToClose(safe, advanced, ships, config);
  return {
    zones: advanced.map((zone) =>
      zone.id === doomed.id
        ? { ...zone, state: "warning" as const, ticksRemaining: config.zoneWarningTicks }
        : zone
    ),
    ticksUntilNextClosure: config.zoneIntervalTicks
  };
}

/**
 * One bite of the zone for a hull standing where it stands.
 *
 * Called on the beat rather than every step, and measured against the hull's
 * maximum: a sixth of it each time, so six beats finish a ship that drove in
 * whole and repairs genuinely buy more. A slope would be unreadable; a beat is
 * something a player counts.
 */
export function zoneDamageForBite(
  ship: ArenaShipState,
  zones: readonly ArenaZone[],
  config: ArenaMatchConfig
): number {
  if (!isInClosedZone(ship, zones)) return 0;
  return ship.maxHp * config.zoneDamageShareOfMaxHp;
}

/** Whether this hull is standing in ground that is already killing. */
export function isInClosedZone(ship: ArenaShipState, zones: readonly ArenaZone[]): boolean {
  return zoneAt(zones, ship.spaceship.x, ship.spaceship.y)?.state === "closed";
}

export function zoneAt(zones: readonly ArenaZone[], x: number, y: number): ArenaZone | undefined {
  return zones.find(
    (zone) => x >= zone.x && x < zone.x + zone.width && y >= zone.y && y < zone.y + zone.height
  );
}

/**
 * Which zone goes next.
 *
 * Two rules, in this order. The field closes **from the outside in**: a zone
 * may only be taken if it sits on the edge of the sheet or already touches
 * something closed, so the safe ground stays one connected piece and shrinks
 * toward the middle instead of developing holes nobody can cross. Among those,
 * the one holding the most living hulls goes first - the squeeze is supposed to
 * land on the fight - and a tie is broken by distance from the centre, which
 * keeps the collapse pointed inward.
 */
/** How far a zone's middle is from the middle of the arena. */
function distanceFromArenaCentre(zone: ArenaZone, config: ArenaMatchConfig): number {
  return Math.hypot(
    zone.x + zone.width / 2 - config.ship.worldWidth / 2,
    zone.y + zone.height / 2 - config.ship.worldHeight / 2
  );
}

function pickZoneToClose(
  safe: readonly ArenaZone[],
  all: readonly ArenaZone[],
  ships: readonly ArenaShipState[],
  config: ArenaMatchConfig
): ArenaZone {
  const alive = ships.filter((ship) => ship.alive);
  const frontier = safe.filter((zone) => isOnFrontier(zone, all, config));
  // Every safe zone is interior only when the sheet is one solid block, which
  // is the first closure of a match; the edge rule then picks itself.
  const pool = frontier.length > 0 ? frontier : safe;

  /*
   * Outside first, crowd second.
   *
   * Distance decides the layer - whatever is furthest out goes now, so the
   * field collapses toward the middle and never leaves a corner standing while
   * the centre burns. Within a layer the crowd decides, which is what points
   * the squeeze at the fight instead of at empty ground. A layer is a band
   * rather than an exact distance, because a square grid over a disc has no two
   * rectangles at the same radius.
   */
  const outermost = Math.max(...pool.map((zone) => distanceFromArenaCentre(zone, config)));
  const layer = pool.filter(
    (zone) => distanceFromArenaCentre(zone, config) >= outermost - zone.width * 0.75
  );

  const first = layer[0];
  if (first === undefined) return safe[0] ?? all[0] ?? zoneFallback();
  let best = first;
  let bestCrowd = -1;
  let bestDistance = -1;

  for (const zone of layer) {
    const crowd = alive.filter(
      (ship) => zoneAt([zone], ship.spaceship.x, ship.spaceship.y) !== undefined
    ).length;
    const distance = distanceFromArenaCentre(zone, config);
    if (crowd > bestCrowd || (crowd === bestCrowd && distance > bestDistance)) {
      best = zone;
      bestCrowd = crowd;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Whether a zone is on the frontier: against the sheet's own edge, or next to
 * ground that is already closing. A zone in the middle of safe ground is not,
 * and closing one would leave a hole rather than move the wall.
 */
function isOnFrontier(
  zone: ArenaZone,
  all: readonly ArenaZone[],
  config: ArenaMatchConfig
): boolean {
  const onEdge =
    zone.column === 0 ||
    zone.row === 0 ||
    zone.column === config.zoneColumns - 1 ||
    zone.row === config.zoneRows - 1;
  if (onEdge) return true;
  // A missing neighbour is a rectangle the disc never reached, which is the
  // same thing as an edge as far as the squeeze is concerned.
  return [
    [zone.column - 1, zone.row],
    [zone.column + 1, zone.row],
    [zone.column, zone.row - 1],
    [zone.column, zone.row + 1]
  ].some(([column, row]) => {
    const neighbour = all.find((other) => other.column === column && other.row === row);
    return neighbour?.state !== "safe";
  });
}

/**
 * Never reached: the sheet always has a zone. TypeScript cannot see that, and a
 * `!` would be a claim rather than a check.
 */
function zoneFallback(): never {
  throw new Error("The arena sheet is empty, which createArenaZones cannot produce.");
}

/** Whether a rectangle overlaps the arena disc at all. */
function touchesDisc(x: number, y: number, width: number, height: number, radius: number): boolean {
  // Nearest point of the rectangle to the centre, which is the whole test.
  const nearestX = Math.max(x, Math.min(0, x + width));
  const nearestY = Math.max(y, Math.min(0, y + height));
  return Math.hypot(nearestX, nearestY) < radius;
}
