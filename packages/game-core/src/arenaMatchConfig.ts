import { type ArenaMatchConfig } from "./arenaMatchTypes.ts";
import { defaultSpaceshipSimulationConfig } from "./defaultSimulationConfig.ts";

export const ARENA_SHIP_COUNT = 16;

/**
 * The sheet a match is played on, and how fast it closes.
 *
 * Ten by ten over the arena square, so one closure takes a slice of the field
 * rather than a quarter of it and the squeeze can be steered where the fight
 * is. A zone turns amber every fifteen seconds and starts killing fifteen
 * seconds after that: time to read the board and drive, no time to sit.
 */
export const ARENA_ZONE_COLUMNS = 10;
export const ARENA_ZONE_ROWS = 10;
export const ARENA_ZONE_INTERVAL_TICKS = 900;
export const ARENA_ZONE_WARNING_TICKS = 900;
/**
 * The beat, and the bite.
 *
 * Five seconds apart, a sixth of the hull's maximum each: six beats kill a ship
 * that drove in whole, and a ship that repairs between them lives longer -
 * which is what makes the zone something to fight rather than a verdict.
 * Wargaming publishes neither number for Steel Hunter, so these are ours; a
 * beat rather than a slope, so a player can count them.
 */
export const ARENA_ZONE_DAMAGE_INTERVAL_TICKS = 300;
export const ARENA_ZONE_DAMAGE_SHARE = 1 / 6;

/**
 * How long a match may run before it is called on the clock.
 *
 * Two and a half minutes, which is a fight rather than a full collapse of the
 * sheet: eighty-eight rectangles at one closure every fifteen seconds would
 * take twenty-two. The operator moves both from the console, and the console
 * prints what the pair adds up to.
 */
export const ARENA_MATCH_TICK_LIMIT = 9_000;

/**
 * A kinetic barrel holds `lifetime / cooldown` shots in the air: the turret
 * about 4,5 and the nose about 6,8. Sixteen hulls firing without pause is
 * therefore near 180, and the ceiling is set above that rather than at it, so
 * the cap bites on a pathological tick instead of on an ordinary firefight.
 */
export const DEFAULT_ARENA_CAPS = {
  ships: ARENA_SHIP_COUNT,
  projectiles: 256,
  homingMissiles: 32,
  dynamicEntities: ARENA_SHIP_COUNT + 256 + 32
} as const satisfies ArenaMatchConfig["caps"];

export const defaultArenaMatchConfig: ArenaMatchConfig = {
  ship: defaultSpaceshipSimulationConfig,
  // Measured, not guessed: at 1x/1x sixteen bots finished each other in 16-21
  // seconds and the ring never closed once. See `pnpm arena:match`.
  shipScaling: { hull: 2.5, damage: 0.7 },
  arenaRadius: defaultSpaceshipSimulationConfig.arenaRadius,
  // The spawn disc, not a spawn ring: hulls are scattered anywhere inside it,
  // held off the wall by enough room to turn.
  spawnRadius: defaultSpaceshipSimulationConfig.arenaRadius - 160,
  shipCount: ARENA_SHIP_COUNT,
  spawnMarks: null,
  matchTickLimit: ARENA_MATCH_TICK_LIMIT,
  zoneColumns: ARENA_ZONE_COLUMNS,
  zoneRows: ARENA_ZONE_ROWS,
  zoneIntervalTicks: ARENA_ZONE_INTERVAL_TICKS,
  zoneWarningTicks: ARENA_ZONE_WARNING_TICKS,
  zoneDamageIntervalTicks: ARENA_ZONE_DAMAGE_INTERVAL_TICKS,
  zoneDamageShareOfMaxHp: ARENA_ZONE_DAMAGE_SHARE,
  caps: DEFAULT_ARENA_CAPS
};
