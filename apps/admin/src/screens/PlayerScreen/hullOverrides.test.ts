import { describe, expect, it } from "vitest";
import type { BalanceTuning, ShipArchetype } from "@spaceship-defender/protocol";

import { hullTuning, overrideCount, withHullEdit } from "./hullOverrides.js";

type Overrides = ShipArchetype["overrides"];

const EMPTY: Overrides = { stats: {}, cannonWeaponKind: null, mgWeaponKind: null };

/** The helpers read the flat block and one hull, so the fixture stays that. */
function tuning(overrides: Overrides): BalanceTuning {
  return {
    spaceshipMaxHp: 500,
    shieldCapacity: 100,
    cannonWeaponKind: "kinetic",
    mgWeaponKind: "kinetic",
    defaultShipArchetypeId: "guardian",
    shipArchetypes: { blade: { label: "Клинок", overrides } }
  } as unknown as BalanceTuning;
}

function hullOf(next: BalanceTuning): ShipArchetype {
  const hull = next.shipArchetypes.blade;
  if (hull === undefined) throw new Error("fixture must carry the hull");
  return hull;
}

describe("hullTuning", () => {
  it("inherits every number the hull does not name", () => {
    const base = tuning(EMPTY);

    expect(hullTuning(base, hullOf(base)).spaceshipMaxHp).toBe(500);
  });

  it("shows the hull number where the hull names one", () => {
    const base = tuning({ ...EMPTY, stats: { spaceshipMaxHp: 400 }, cannonWeaponKind: "laser" });
    const shown = hullTuning(base, hullOf(base));

    expect(shown.spaceshipMaxHp).toBe(400);
    expect(shown.cannonWeaponKind).toBe("laser");
    expect(shown.shieldCapacity).toBe(100);
  });
});

describe("withHullEdit", () => {
  it("writes the edit into the hull diff and leaves the base alone", () => {
    const next = withHullEdit(tuning(EMPTY), "blade", { spaceshipMaxHp: 380 });

    expect(hullOf(next).overrides.stats).toEqual({ spaceshipMaxHp: 380 });
    expect(next.spaceshipMaxHp).toBe(500);
  });

  it("drops the difference once the number is typed back to the base", () => {
    const base = tuning({ ...EMPTY, stats: { spaceshipMaxHp: 380, shieldCapacity: 85 } });
    const next = withHullEdit(base, "blade", { spaceshipMaxHp: 500 });

    expect(hullOf(next).overrides.stats).toEqual({ shieldCapacity: 85 });
  });

  it("treats a weapon kind the same way", () => {
    const chosen = withHullEdit(tuning(EMPTY), "blade", { cannonWeaponKind: "laser" });
    expect(hullOf(chosen).overrides.cannonWeaponKind).toBe("laser");

    const back = withHullEdit(chosen, "blade", { cannonWeaponKind: "kinetic" });
    expect(hullOf(back).overrides.cannonWeaponKind).toBeNull();
  });

  it("keeps the preset untouched when the hull is gone", () => {
    const base = tuning(EMPTY);

    expect(withHullEdit(base, "missing", { spaceshipMaxHp: 380 })).toBe(base);
  });
});

describe("overrideCount", () => {
  it("counts stats and weapon kinds together", () => {
    const base = tuning({
      stats: { spaceshipMaxHp: 400, shieldCapacity: 85 },
      cannonWeaponKind: "laser",
      mgWeaponKind: null
    });

    expect(overrideCount(hullOf(base))).toBe(3);
    expect(overrideCount(hullOf(tuning(EMPTY)))).toBe(0);
  });
});
