import { type ArenaMatchConfig } from "./arenaMatchTypes.ts";
import { defaultSpaceshipSimulationConfig } from "./defaultSimulationConfig.ts";

export const ARENA_SHIP_COUNT = 16;

/**
 * Five minutes, five phases.
 *
 * The shape is the arena GDD's - hold, then three squeezes, then a pen nobody
 * can hide in - on half its clock, because a prototype is judged by how many
 * matches fit in an evening. Every number here is a starting guess: the first
 * bot-only batch is what turns them into balance.
 */
export const DEFAULT_ARENA_RING_PHASES = [
  { radius: 2200, durationTicks: 3600, damagePerSecond: 30 },
  { radius: 1500, durationTicks: 3600, damagePerSecond: 30 },
  { radius: 900, durationTicks: 3600, damagePerSecond: 40 },
  { radius: 400, durationTicks: 3600, damagePerSecond: 50 },
  { radius: 150, durationTicks: 3600, damagePerSecond: 70 }
] as const satisfies ArenaMatchConfig["ringPhases"];

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
  arenaRadius: defaultSpaceshipSimulationConfig.arenaRadius,
  // Inside the wall by a hull's length and change: sixteen ships on the rim
  // itself would spawn already scraping it.
  spawnRadius: defaultSpaceshipSimulationConfig.arenaRadius - 400,
  shipCount: ARENA_SHIP_COUNT,
  matchTickLimit: 18_000,
  ringPhases: DEFAULT_ARENA_RING_PHASES,
  caps: DEFAULT_ARENA_CAPS
};
