import { type ArenaMatchConfig } from "./arenaMatchTypes.ts";
import { defaultSpaceshipSimulationConfig } from "./defaultSimulationConfig.ts";

export const ARENA_SHIP_COUNT = 16;

/**
 * Two and a half minutes, five phases of thirty seconds.
 *
 * The shape is the arena GDD's - hold, then three squeezes, then a pen nobody
 * can hide in - on a quarter of its clock, because the first bot-only batch
 * finished matches in twenty seconds flat and a ring that never moves is not a
 * mechanic. These numbers are a hypothesis the next batch either keeps or
 * moves.
 */
export const DEFAULT_ARENA_RING_PHASES = [
  { radius: 2200, durationTicks: 1800, damagePerSecond: 30 },
  { radius: 1500, durationTicks: 1800, damagePerSecond: 30 },
  { radius: 900, durationTicks: 1800, damagePerSecond: 40 },
  { radius: 400, durationTicks: 1800, damagePerSecond: 50 },
  { radius: 150, durationTicks: 1800, damagePerSecond: 70 }
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
  // Measured, not guessed: at 1x/1x sixteen bots finished each other in 16-21
  // seconds and the ring never closed once. See `pnpm arena:match`.
  shipScaling: { hull: 2.5, damage: 0.7 },
  arenaRadius: defaultSpaceshipSimulationConfig.arenaRadius,
  // The spawn disc, not a spawn ring: hulls are scattered anywhere inside it,
  // held off the wall by enough room to turn.
  spawnRadius: defaultSpaceshipSimulationConfig.arenaRadius - 160,
  shipCount: ARENA_SHIP_COUNT,
  matchTickLimit: 9_000,
  ringPhases: DEFAULT_ARENA_RING_PHASES,
  caps: DEFAULT_ARENA_CAPS
};
