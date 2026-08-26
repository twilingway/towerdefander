import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WeaponHeat } from "./WeaponHeat.js";

const COOL = { heat: 40, capacity: 100, overheated: false } as const;
const OVERHEATED = { heat: 0, capacity: 0, overheated: true } as const;

describe("WeaponHeat", () => {
  it("renders authoritative heat for both weapons in one tile", () => {
    const markup = renderToStaticMarkup(
      <WeaponHeat cannon={{ heat: 62, capacity: 100, overheated: false }} machineGun={COOL} />
    );

    // One tile: a seventh HUD column wrapped the bar onto the radar.
    expect(markup.match(/machine-gun-hud/g)?.length).toBe(1);
    expect(markup).toContain('data-testid="cannon-heat"');
    expect(markup).toContain('data-testid="machine-gun-heat"');
    expect(markup).toContain("62%");
    expect(markup).toContain("40 / 100");
    expect(markup).toContain('style="width:40%"');
  });

  it("warns per weapon without an invalid percentage at zero capacity", () => {
    const markup = renderToStaticMarkup(<WeaponHeat cannon={OVERHEATED} machineGun={COOL} />);

    expect(markup).toContain("ПЕРЕГРЕВ");
    expect(markup).toContain('data-overheated="true"');
    expect(markup).toContain('aria-valuemax="100"');
    expect(markup).toContain('aria-valuetext="0 / 0"');
    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("Infinity");
    // The cool weapon keeps reading normally beside the overheated one.
    expect(markup).toContain("40 / 100");
  });

  it("marks the tile hot when either weapon is out of action", () => {
    const cool = renderToStaticMarkup(<WeaponHeat cannon={COOL} machineGun={COOL} />);
    expect(cool).not.toContain("machine-gun-hud--overheated");

    const hot = renderToStaticMarkup(<WeaponHeat cannon={COOL} machineGun={OVERHEATED} />);
    expect(hot).toContain("machine-gun-hud--overheated");
  });
});
