import { createDefaultTuning, toSimulationConfig } from "@spaceship-defender/balance-core";
import { createArenaMatch, defaultArenaMatchConfig } from "@spaceship-defender/game-core";
import { CAMERA_VIEW_WIDTH_MAX, type BalanceTuning } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import { ARENA_PLAYER_SLOT, createArenaSeats, toArenaMatchConfig } from "./arenaSetup.ts";

/*
 * The seed with every arena number moved off its default, so a field the
 * config quietly took from `defaultArenaMatchConfig` instead of the preset
 * shows up as a mismatch rather than as a coincidence.
 */
function tunedArena(): BalanceTuning {
  const tuning = createDefaultTuning();
  return {
    ...tuning,
    arena: {
      ...tuning.arena,
      fieldRadius: tuning.arena.fieldRadius + 200,
      cameraViewWidth: CAMERA_VIEW_WIDTH_MAX + 500,
      shieldAutopilotRaiseRange: 777,
      zoneColumns: tuning.arena.zoneColumns + 1,
      zoneRows: tuning.arena.zoneRows + 1,
      matchTickLimit: tuning.arena.matchTickLimit + 60,
      hullScaling: tuning.arena.hullScaling + 0.5,
      damageScaling: tuning.arena.damageScaling + 0.25,
      shieldHitCostShare: tuning.arena.shieldHitCostShare / 2,
      zoneIntervalTicks: tuning.arena.zoneIntervalTicks + 7,
      zonesPerClosure: tuning.arena.zonesPerClosure + 1,
      lootFirstSpawnTicks: tuning.arena.lootFirstSpawnTicks + 11,
      lootIntervalTicks: tuning.arena.lootIntervalTicks + 13,
      lootCargoIntervalTicks: tuning.arena.lootCargoIntervalTicks + 17,
      zoneWarningTicks: tuning.arena.zoneWarningTicks + 19,
      zoneDamageIntervalTicks: tuning.arena.zoneDamageIntervalTicks + 23,
      zoneBitesToKill: 4
    }
  };
}

describe("toArenaMatchConfig", () => {
  it("builds the match from the preset's arena screen over the chosen hull", () => {
    const tuning = tunedArena();
    const hull = toSimulationConfig(tuning, tuning.defaultShipArchetypeId);
    const arena = tuning.arena;

    const config = toArenaMatchConfig(tuning, hull);

    expect(config.arenaRadius).toBe(arena.fieldRadius);
    expect(config.spawnRadius).toBe(arena.fieldRadius - 160);
    expect(config.spawnMarks).toBe(arena.spawnMarks);
    expect(config.zoneColumns).toBe(arena.zoneColumns);
    expect(config.zoneRows).toBe(arena.zoneRows);
    expect(config.matchTickLimit).toBe(arena.matchTickLimit);
    expect(config.shipScaling).toEqual({ hull: arena.hullScaling, damage: arena.damageScaling });
    expect(config.shieldHitCostShare).toBe(arena.shieldHitCostShare);
    expect(config.zoneIntervalTicks).toBe(arena.zoneIntervalTicks);
    expect(config.zonesPerClosure).toBe(arena.zonesPerClosure);
    expect(config.lootFirstSpawnTicks).toBe(arena.lootFirstSpawnTicks);
    expect(config.lootIntervalTicks).toBe(arena.lootIntervalTicks);
    expect(config.lootCargoIntervalTicks).toBe(arena.lootCargoIntervalTicks);
    expect(config.zoneWarningTicks).toBe(arena.zoneWarningTicks);
    expect(config.zoneDamageIntervalTicks).toBe(arena.zoneDamageIntervalTicks);
    expect(config.zoneDamageShareOfMaxHp).toBe(0.25);
    // What the preset has no say in stays the core's.
    expect(config.shipCount).toBe(defaultArenaMatchConfig.shipCount);
    expect(config.lootCaptureTicks).toBe(defaultArenaMatchConfig.lootCaptureTicks);

    expect(config.ship).toEqual({
      ...hull,
      arenaRadius: arena.fieldRadius,
      worldWidth: arena.fieldRadius * 2,
      worldHeight: arena.fieldRadius * 2,
      cameraViewWidth: CAMERA_VIEW_WIDTH_MAX,
      shieldAutopilotRaiseRange: 777
    });
  });

  it("builds a match the core accepts from the committed seed", () => {
    const tuning = createDefaultTuning();
    const config = toArenaMatchConfig(
      tuning,
      toSimulationConfig(tuning, tuning.defaultShipArchetypeId)
    );

    const match = createArenaMatch(config, 4242, createArenaSeats(config, "ace"));

    expect(match.ships).toHaveLength(config.shipCount);
  });
});

describe("createArenaSeats", () => {
  it("seats the player first and bots of the preset's level everywhere else", () => {
    const tuning = createDefaultTuning();
    const config = toArenaMatchConfig(
      tuning,
      toSimulationConfig(tuning, tuning.defaultShipArchetypeId)
    );

    const seats = createArenaSeats(config, "veteran");

    expect(seats).toHaveLength(config.shipCount);
    expect(seats[ARENA_PLAYER_SLOT]?.control).toBe("human");
    expect(seats.filter((seat) => seat.control === "bot")).toHaveLength(config.shipCount - 1);
    expect(seats.every((seat) => seat.botLevel === "veteran")).toBe(true);
  });
});
