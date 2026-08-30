import { type GameplayRole } from "./combatTypes.ts";

export const ROLES: readonly GameplayRole[] = ["pilot", "gunner", "shield"];
export const UINT32_MAX = 0xffff_ffff;
/**
 * World units either side of the preferred range over which an enemy trades
 * closing for circling. Wide enough that the blend is visible rather than a
 * threshold, narrow enough to leave a long approach at full speed.
 */
export const ENEMY_RANGE_BAND = 120;
/** Share of its speed an enemy spends circling once it is on station. */
export const ENEMY_ORBIT_SHARE = 0.35;
/**
 * Share of the legal radius past which the wall starts steering the enemy. The
 * autopilot flips its own orbit at the same fraction.
 */
export const ENEMY_RIM_START = 0.8;
/** Post-clamp speed below this share of the archetype speed counts as pinned. */
export const ENEMY_STALL_SPEED_FRACTION = 0.05;
/**
 * Ticks of neither side landing a hit before enemies have given up their whole
 * stand-off and come to knife range. A range stalemate is the one shape of
 * fight that never resolves itself: a sniper that cannot lead a moving ship
 * and a ship that cannot see past its own camera frame will circle each other
 * until the wave clock runs out. Like the rim unstick, this is correctness
 * rather than difficulty, so it is the same for every skill level.
 */
export const ENEMY_PRESS_TICKS = 200;
/** Share of the fighting distance given up once the press is at full. */
export const ENEMY_PRESS_SHARE = 0.75;
export const SPAWN_DOMAIN = 0x5350_4157;
export const OFFER_DOMAIN = 0x4f46_4652;
export const AMBIENT_ASTEROID_DOMAIN = 0x414d_4254;
export const AIM_DOMAIN = 0x414d_5f41;
export const MAX_PUBLIC_TRANSIENT_PADDING = 256;
export const TEAM_UPGRADE_PRICE = 5 as const;
