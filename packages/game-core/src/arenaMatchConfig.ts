import { type ArenaMatchConfig } from "./arenaMatchTypes.ts";
import { defaultSpaceshipSimulationConfig } from "./defaultSimulationConfig.ts";

export const ARENA_SHIP_COUNT = 16;

/**
 * The sheet a match is played on, and how fast it closes.
 *
 * Four by four over the arena square: sixteen rectangles, the corner ones
 * clipped by the disc to slivers. A closure therefore moves the fight without
 * taking a quarter of the field at once. A zone every thirty seconds with a
 * five-second warning gives a hull time to read the board and drive, and no
 * time to sit.
 */
export const ARENA_ZONE_COLUMNS = 4;
export const ARENA_ZONE_ROWS = 4;
export const ARENA_ZONE_INTERVAL_TICKS = 1_800;
export const ARENA_ZONE_WARNING_TICKS = 300;
/**
 * The beat, and the bite.
 *
 * Five seconds apart and a sixth of the hull each time: six beats kill anyone
 * who stays, five leave them alive, and a hull that heals between beats lives
 * longer than one that does not. Wargaming publishes neither number for Steel
 * Hunter, so these are ours - stated as a share so they mean the same thing to
 * every hull, and as a beat so a player can count them.
 */
export const ARENA_ZONE_DAMAGE_INTERVAL_TICKS = 300;
export const ARENA_ZONE_DAMAGE_SHARE = 1 / 6;

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
  matchTickLimit: 9_000,
  zoneColumns: ARENA_ZONE_COLUMNS,
  zoneRows: ARENA_ZONE_ROWS,
  zoneIntervalTicks: ARENA_ZONE_INTERVAL_TICKS,
  zoneWarningTicks: ARENA_ZONE_WARNING_TICKS,
  zoneDamageIntervalTicks: ARENA_ZONE_DAMAGE_INTERVAL_TICKS,
  zoneDamageShareOfMaxHp: ARENA_ZONE_DAMAGE_SHARE,
  caps: DEFAULT_ARENA_CAPS
};
