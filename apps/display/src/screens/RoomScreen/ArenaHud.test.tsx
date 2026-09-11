import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArenaHud } from "./ArenaHud.js";

const GUN = { heat: 0, capacity: 100, overheated: false };

function hud(overrides: Partial<Parameters<typeof ArenaHud>[0]> = {}) {
  return renderToStaticMarkup(
    <ArenaHud
      alive={12}
      fieldSize={16}
      kills={3}
      place={12}
      hp={780}
      maxHp={1300}
      shield={60}
      shieldCapacity={100}
      shieldActive
      cannon={GUN}
      machineGun={GUN}
      {...overrides}
    />
  );
}

describe("ArenaHud", () => {
  it("counts the field, the kills and the standing", () => {
    const markup = hud();

    expect(markup).toContain("Живых");
    expect(markup).toContain("12");
    expect(markup).toContain("/16");
    expect(markup).toContain("Сбитые");
    expect(markup).toContain("Место");
    // None of the campaign's three: a match has no waves and no economy.
    expect(markup).not.toContain("Волна");
    expect(markup).not.toContain("Кредиты");
  });

  it("turns a low hull red and a cold gun amber", () => {
    // A quarter of the hull left is the case the colour exists for.
    expect(hud({ hp: 300 })).toContain("arena-gauge--danger");
    expect(hud()).toContain("arena-gauge--hull");
    expect(hud()).toContain("arena-gauge--heat");
  });

  it("marks an overheated barrel rather than just emptying it", () => {
    const markup = hud({ cannon: { heat: 100, capacity: 100, overheated: true } });

    expect(markup).toContain("arena-gauge--danger");
  });

  it("dims the sector while it is down", () => {
    expect(hud({ shieldActive: false })).toContain("arena-gauge--shield-down");
    expect(hud()).toContain("arena-gauge--shield");
  });
});
