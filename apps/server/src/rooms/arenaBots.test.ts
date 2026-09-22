import {
  createArenaMatch,
  defaultArenaMatchConfig,
  type ArenaMatchConfig,
  type ArenaMatchState,
  type ArenaShipSeat
} from "@spaceship-defender/game-core";
import { describe, expect, it } from "vitest";

import { ArenaBots } from "./arenaBots.js";
import { getBalanceStore } from "../balance/index.js";
import { resolveAutopilotProfile } from "@spaceship-defender/game-runtime/crewPolicy.mjs";
import type { AutopilotProfile } from "@spaceship-defender/protocol";

/** A match on the operator's own numbers, which is what the room builds. */
function match(): { state: ArenaMatchState; config: ArenaMatchConfig; profile: AutopilotProfile } {
  const balance = getBalanceStore();
  const tuning = balance.getActiveTuning();
  const hull = balance.getActiveSimulationConfig(tuning.defaultShipArchetypeId);
  const radius = tuning.arena.fieldRadius;
  const config: ArenaMatchConfig = {
    ...defaultArenaMatchConfig,
    ship: { ...hull, arenaRadius: radius, worldWidth: radius * 2, worldHeight: radius * 2 },
    arenaRadius: radius,
    spawnRadius: radius - 160
  };
  const seats: readonly ArenaShipSeat[] = Array.from({ length: config.shipCount }, () => ({
    control: "bot" as const,
    botLevel: tuning.autopilot.level
  }));
  const profile = resolveAutopilotProfile(
    tuning.autopilot,
    tuning.autopilot.level,
    config.ship.cannonWeaponKind
  );
  if (profile === undefined) throw new Error("the console has no autopilot profile");
  return { state: createArenaMatch(config, 7, seats), config, profile };
}

describe("ArenaBots", () => {
  /**
   * A rival close enough to shoot is a reason to hold the sector, with nothing
   * yet in the air.
   *
   * The campaign answers "is anything armed in reach" from the enemy
   * catalogue; a match has none, and with the console's default of zero the
   * policy found no reason at all - so the sector only came up for a shot
   * already inside the lead window. That is a shield that holds a machine-gun
   * stream and lets a single shell through.
   */
  it("holds the sector against a rival inside gun range", () => {
    const { state, config, profile } = match();
    const me = state.ships[0];
    const rival = state.ships[1];
    if (me === undefined || rival === undefined) throw new Error("the match seated nobody");

    const here = { x: config.arenaRadius, y: config.arenaRadius };
    const reach = (config.ship.projectileSpeedPerSecond * config.ship.projectileLifetimeMs) / 1_000;
    const staged: ArenaMatchState = {
      ...state,
      // No shot in the air: the sector has to be raised on the rival alone.
      projectiles: [],
      ships: [
        { ...me, heading: 0, spaceship: { ...me.spaceship, ...here } },
        {
          ...rival,
          spaceship: { ...rival.spaceship, x: here.x - reach * 0.6, y: here.y }
        }
      ]
    };

    const intents = new ArenaBots(config, profile).intentsFor(staged, config);
    const mine = intents.get(me.id);
    expect(mine?.shieldActive).toBe(true);
    // And pointed at the rival, which is behind us: the hull is flying east.
    expect(mine?.shieldTargetAngle ?? 0).toBeCloseTo(Math.PI, 2);
  });
});
