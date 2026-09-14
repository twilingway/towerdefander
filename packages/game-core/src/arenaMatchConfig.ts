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
/**
 * How many rectangles a beat takes. Ten of eighty-eight is about a ring of the
 * sheet, which is a wall a pilot can watch move; one was a tile nobody noticed.
 */
export const ARENA_ZONES_PER_CLOSURE = 10;

/**
 * The field's supply run, after Steel Hunter's.
 *
 * A drop a minute of each common kind, a heavy one every two, and nothing at
 * all for the first quarter minute - a drop that arrives with the first shot is
 * picked up on the way past rather than crossed for. The caps are what keep the
 * board readable while nobody is collecting: sixteen of each kind, and
 * thirty-two on the field altogether.
 */
export const ARENA_LOOT_FIRST_SPAWN_TICKS = 900;
export const ARENA_LOOT_INTERVAL_TICKS = 3_600;
export const ARENA_LOOT_CARGO_INTERVAL_TICKS = 7_200;
export const ARENA_LOOT_CAP_PER_KIND = 16;
export const ARENA_LOOT_SCENE_CAP = 32;
/**
 * The hold: five seconds of standing still, in a circle two hulls wide.
 *
 * Long enough that a crate is a commitment rather than a detour, and wide
 * enough that holding it is a position rather than a pixel - a hull parked in
 * the middle can still turn to face whoever comes for it.
 */
/** Half of what the shell carries, which is the ratio the campaign's own guns use. */
export const ARENA_SHIELD_HIT_COST_SHARE = 0.5;
/**
 * Zero, meaning "as far as our own gun reaches".
 *
 * The campaign's field of the same name reads zero as the enemy archetype's own
 * weapon range; a match has no archetypes, so the equivalent is the hull every
 * rival is a copy of. Stating it as zero rather than as a distance is what
 * keeps the sector's reason to come up tied to the cannon after it is retuned.
 */
export const ARENA_SHIELD_RAISE_RANGE = 0;

export const ARENA_LOOT_CAPTURE_TICKS = 300;
export const ARENA_LOOT_CAPTURE_RADIUS_HULLS = 2;

/**
 * The radar sweep, as Steel Hunter plays it: a pilot presses for a look around,
 * waits out a cooldown, and what the sweep found stays on the dial for a while
 * after it has moved. It reaches one cell of the zone sheet - the grid that
 * closes on the timer - so the reach is read off the board a pilot plans on, and
 * a later upgrade can buy more cells.
 */
export const ARENA_SCAN_RADIUS_CELLS = 1;
export const ARENA_SCAN_COOLDOWN_TICKS = 1_800;
export const ARENA_SCAN_REVEAL_TICKS = 1_800;
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
 * What a match does to the campaign's ship, measured rather than guessed: at
 * 1x/1x sixteen bots finished each other in 16-21 seconds and the field never
 * closed once. See `pnpm arena:match`.
 */
export const ARENA_HULL_SCALING = 2.5;
export const ARENA_DAMAGE_SCALING = 0.7;

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
  shipScaling: { hull: ARENA_HULL_SCALING, damage: ARENA_DAMAGE_SCALING },
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
  zonesPerClosure: ARENA_ZONES_PER_CLOSURE,
  lootFirstSpawnTicks: ARENA_LOOT_FIRST_SPAWN_TICKS,
  lootIntervalTicks: ARENA_LOOT_INTERVAL_TICKS,
  lootCargoIntervalTicks: ARENA_LOOT_CARGO_INTERVAL_TICKS,
  lootCapPerKind: ARENA_LOOT_CAP_PER_KIND,
  lootSceneCap: ARENA_LOOT_SCENE_CAP,
  shieldHitCostShare: ARENA_SHIELD_HIT_COST_SHARE,
  lootCaptureTicks: ARENA_LOOT_CAPTURE_TICKS,
  lootCaptureRadiusHulls: ARENA_LOOT_CAPTURE_RADIUS_HULLS,
  zoneWarningTicks: ARENA_ZONE_WARNING_TICKS,
  zoneDamageIntervalTicks: ARENA_ZONE_DAMAGE_INTERVAL_TICKS,
  zoneDamageShareOfMaxHp: ARENA_ZONE_DAMAGE_SHARE,
  caps: DEFAULT_ARENA_CAPS
};
