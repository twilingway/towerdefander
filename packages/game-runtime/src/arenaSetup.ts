import { CAMERA_VIEW_WIDTH_MAX, type BalanceTuning } from "@spaceship-defender/protocol";
import {
  defaultArenaMatchConfig,
  type ArenaMatchConfig,
  type ArenaShipSeat,
  type SpaceshipSimulationConfig
} from "@spaceship-defender/game-core";

/**
 * What a match is built from, for whoever is hosting it.
 *
 * The room and a device both start a match from the operator's preset, and
 * this is the one place the preset becomes a match: written twice, the two
 * would disagree the first time the arena screen gains a setting.
 */

/** The slot the human takes. It flies on autopilot until a cockpit claims it. */
export const ARENA_PLAYER_SLOT = 0;

/** The preset's arena screen over the chosen hull, as the match core wants it. */
export function toArenaMatchConfig(
  tuning: BalanceTuning,
  hull: SpaceshipSimulationConfig
): ArenaMatchConfig {
  /*
   * The campaign's ship on the arena's field.
   *
   * Everything about the hull comes from the console's player screen, and
   * everything about the ground comes from the arena's own: the two modes
   * shared one radius until now, so a field wide enough for sixteen hulls
   * dragged the campaign onto it. The world is derived from the radius and
   * the core validates that it is, so all three move together.
   */
  const fieldRadius = tuning.arena.fieldRadius;
  const ship = {
    ...hull,
    arenaRadius: fieldRadius,
    worldWidth: fieldRadius * 2,
    worldHeight: fieldRadius * 2,
    /*
     * The frame is the arena's too, because it is what a seat can see.
     *
     * `buildArenaWorld` cuts every hull's slice of the match to this width,
     * and the screen is drawn at `tuning.arena.cameraViewWidth`. Leaving the
     * campaign's number here made those two different frames: the sector the
     * autopilot holds for a seated player stopped tracking a rival that was
     * still plainly on screen, because the policy had already been told the
     * rival was out of sight.
     */
    cameraViewWidth: Math.min(CAMERA_VIEW_WIDTH_MAX, tuning.arena.cameraViewWidth),
    /*
     * And the sector's reason to come up is the match's own number.
     *
     * The campaign's answer to "is anything armed in reach" is the enemy
     * archetype's weapon range, and a match has no archetypes to ask - so
     * the two modes read the same zero differently and needed two settings.
     */
    shieldAutopilotRaiseRange: tuning.arena.shieldAutopilotRaiseRange
  };
  return {
    ...defaultArenaMatchConfig,
    ship,
    arenaRadius: fieldRadius,
    // The spawn disc is the field's, held off the wall by room to turn.
    spawnRadius: fieldRadius - 160,
    // The operator's layout, edited on the console's arena screen. Absent
    // marks would mean the built-in spiral, which is what they started as.
    spawnMarks: tuning.arena.spawnMarks,
    // The sheet is the operator's too: its rectangles are sized from the
    // radius, so a wider arena keeps the same number of closures.
    zoneColumns: tuning.arena.zoneColumns,
    zoneRows: tuning.arena.zoneRows,
    // How long the fight is allowed to last, straight from the console: the
    // sheet and the clock are one setting in two halves, and a match shorter
    // than the sheet ends with ground still safe.
    matchTickLimit: tuning.arena.matchTickLimit,
    // The campaign's ship, stretched for a sixteen-way fight by two numbers
    // the operator owns rather than by constants nobody can reach.
    shipScaling: { hull: tuning.arena.hullScaling, damage: tuning.arena.damageScaling },
    shieldHitCostShare: tuning.arena.shieldHitCostShare,
    zoneIntervalTicks: tuning.arena.zoneIntervalTicks,
    zonesPerClosure: tuning.arena.zonesPerClosure,
    // The supply run's clocks are the operator's; its caps are the code's.
    lootFirstSpawnTicks: tuning.arena.lootFirstSpawnTicks,
    lootIntervalTicks: tuning.arena.lootIntervalTicks,
    lootCargoIntervalTicks: tuning.arena.lootCargoIntervalTicks,
    zoneWarningTicks: tuning.arena.zoneWarningTicks,
    zoneDamageIntervalTicks: tuning.arena.zoneDamageIntervalTicks,
    // The operator decides how many beats a full hull takes; the simulation
    // takes one over that, of the maximum, on each of them.
    zoneDamageShareOfMaxHp: 1 / tuning.arena.zoneBitesToKill
  };
}

/**
 * Every seat of a match, the player's first.
 *
 * The player's slot is marked human at creation; the bot layer skips it, and
 * an empty one is simply a human who never turned up, which the step handles
 * by leaving the hull on its own autopilot.
 */
export function createArenaSeats(
  config: ArenaMatchConfig,
  botLevel: string
): readonly ArenaShipSeat[] {
  return Array.from({ length: config.shipCount }, (_unused, slot): ArenaShipSeat => ({
    control: slot === ARENA_PLAYER_SLOT ? "human" : "bot",
    botLevel
  }));
}
