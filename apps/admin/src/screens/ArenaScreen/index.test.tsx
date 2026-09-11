import type { ArenaTuning, BalanceTuning } from "@spaceship-defender/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ArenaScreen } from "./index.js";

const ARENA: ArenaTuning = {
  spawnMarks: Array.from({ length: 16 }, (_unused, index) => ({ x: index * 60, y: index * 30 })),
  zoneColumns: 10,
  zoneRows: 10,
  matchTickLimit: 9_000,
  hullScaling: 2.5,
  damageScaling: 0.7,
  zoneIntervalTicks: 900,
  zoneWarningTicks: 900,
  zoneDamageIntervalTicks: 300,
  zoneBitesToKill: 6
};

/** The screen reads one section plus four root numbers, so the fixture is those. */
function tuning(arena: ArenaTuning = ARENA): BalanceTuning {
  return {
    arena,
    arenaRadius: 2200,
    spaceshipMaxHp: 520,
    friendlyProjectileDamage: 14,
    mgDamage: 4
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

  it("says how long the whole field takes to redden against the match clock", () => {
    const markup = renderToStaticMarkup(<ArenaScreen tuning={tuning()} onChange={vi.fn()} />);

    // A ten by ten sheet over the disc is 88 rectangles and 87 closures; at one
    // every fifteen seconds that is far longer than a two-and-a-half minute
    // match, which is exactly what the operator has to be able to see.
    expect(markup).toContain("88");
    expect(markup).toContain("87");
  });
});
