import type { ArenaTuning, BalanceTuning } from "@spaceship-defender/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ArenaScreen } from "./index.js";

const ARENA: ArenaTuning = {
  spawnMarks: Array.from({ length: 16 }, (_unused, index) => ({ x: index * 60, y: index * 30 })),
  zoneColumns: 10,
  zoneRows: 10,
  matchTickLimit: 9_000,
  fieldRadius: 2200,
  cameraViewWidth: 2500,
  hullScaling: 2.5,
  shieldHitCostShare: 0.5,
  shieldAutopilotRaiseRange: 0,
  damageScaling: 0.7,
  zonesPerClosure: 1,
  scanRadiusCells: 1,
  scanCooldownTicks: 1800,
  scanRevealTicks: 1800,
  lootFirstSpawnTicks: 900,
  lootIntervalTicks: 3600,
  lootCargoIntervalTicks: 7200,
  zoneIntervalTicks: 900,
  zoneWarningTicks: 900,
  zoneDamageIntervalTicks: 300,
  zoneBitesToKill: 6
};

/**
 * The screen reads one section, a handful of root numbers and the hull a match
 * is flown in - the gun's reach is read off that hull rather than off the flat
 * block, because a hull may override it.
 */
function tuning(arena: ArenaTuning = ARENA): BalanceTuning {
  return {
    arena,
    arenaRadius: 2200,
    spaceshipMaxHp: 520,
    friendlyProjectileDamage: 14,
    mgDamage: 4,
    shieldCapacity: 120,
    cannonWeaponKind: "kinetic",
    cannonLaserRange: 900,
    projectileSpeedPerSecond: 850,
    projectileLifetimeMs: 800,
    defaultShipArchetypeId: "guardian",
    shipArchetypes: {
      // Overrides nothing: the reach is then the flat block's, 850 x 0.8.
      guardian: { overrides: { stats: {}, cannonWeaponKind: null, mgWeaponKind: null } }
    }
  } as unknown as BalanceTuning;
}

describe("ArenaScreen", () => {
  it("prints what the match multipliers do to the ship", () => {
    const markup = renderToStaticMarkup(<ArenaScreen tuning={tuning()} onChange={vi.fn()} />);

    expect(markup).toContain("Корабль в матче");
    // 520 x 2.5, and 14 x 0.7 - the numbers an operator would otherwise have to
    // do in their head every time they touch either multiplier.
    expect(markup).toContain("1300");
    expect(markup).toContain("9.8");
    // A whole hull at that damage: 1300 / 9.8, rounded up.
    expect(markup).toContain("133");
  });

  /**
   * The arena's own raise range, and what its zero is worth.
   *
   * The campaign reads the same zero as the enemy archetype's weapon range,
   * which a match has no archetypes to ask - so the console has to say which
   * distance this one actually means, in units, on the hull the match is flown
   * in.
   */
  it("says what the arena's own zero raise range is worth", () => {
    const markup = renderToStaticMarkup(<ArenaScreen tuning={tuning()} onChange={vi.fn()} />);

    expect(markup).toContain("Дальность подъёма щита");
    // 850 units a second for 800 ms: the reach of the hull's own gun.
    expect(markup).toContain("680");
  });

  it("says how long the whole field takes to redden against the match clock", () => {
    const markup = renderToStaticMarkup(<ArenaScreen tuning={tuning()} onChange={vi.fn()} />);

    // A ten by ten sheet over the disc is 88 rectangles and 87 closures; at one
    // every fifteen seconds that is far longer than a two-and-a-half minute
    // match, which is exactly what the operator has to be able to see.
    expect(markup).toContain("88");
    expect(markup).toContain("87");
  });
});
