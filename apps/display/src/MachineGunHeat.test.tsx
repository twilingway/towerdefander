import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MachineGunHeat } from "./MachineGunHeat.js";

describe("MachineGunHeat", () => {
  it("renders authoritative heat as a percentage and exact values", () => {
    const markup = renderToStaticMarkup(
      <MachineGunHeat machineGun={{ heat: 40, capacity: 100, overheated: false }} />
    );

    expect(markup).toContain("40%");
    expect(markup).toContain("40 / 100");
    expect(markup).toContain('style="width:40%"');
  });

  it("renders the overheat warning without an invalid percentage at zero capacity", () => {
    const markup = renderToStaticMarkup(
      <MachineGunHeat machineGun={{ heat: 0, capacity: 0, overheated: true }} />
    );

    expect(markup).toContain("ПЕРЕГРЕВ");
    expect(markup).toContain('data-overheated="true"');
    expect(markup).toContain('style="width:0%"');
    expect(markup).toContain('aria-valuemax="100"');
    expect(markup).toContain('aria-valuetext="0 / 0"');
    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("Infinity");
  });
});
