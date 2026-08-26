import type { BalanceTuning } from "@spaceship-defender/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlayerShipPreview } from "./PlayerShipPreview.js";

/**
 * The preview reads five fields and nothing else, so the cast keeps the fixture
 * to what it actually touches instead of restating the whole balance document.
 */
function tuning(turretVisual: BalanceTuning["turretVisual"]): BalanceTuning {
  return {
    spaceshipRadius: 52,
    shieldRadius: 104,
    shieldArcRadians: Math.PI / 2,
    spaceshipVisual: null,
    turretVisual
  } as unknown as BalanceTuning;
}

/** Shapes the catalogue draws with; counting them proves a gun really appears. */
function countShapes(markup: string): number {
  return (markup.match(/<(polygon|rect|circle|ellipse|path|line)[ >]/g) ?? []).length;
}

describe("PlayerShipPreview", () => {
  it("draws the chosen gun over the hull", () => {
    const bare = renderToStaticMarkup(<PlayerShipPreview tuning={tuning(null)} />);
    const armed = renderToStaticMarkup(
      <PlayerShipPreview tuning={tuning({ shape: "weapon-gatling", modelScale: 1 })} />
    );

    // Counted, not compared: the caption alone changes whether or not the gun
    // is actually drawn, and a preview that only names the choice is the bug.
    expect(countShapes(armed)).toBeGreaterThan(countShapes(bare));
    expect(armed).toContain("орудие");
    expect(bare).not.toContain("орудие");
  });

  it("names the gun in the accessible label beside the hull", () => {
    const markup = renderToStaticMarkup(
      <PlayerShipPreview tuning={tuning({ shape: "weapon-gatling", modelScale: 1 })} />
    );

    expect(markup).toContain("Корпус игрока:");
    expect(markup).toContain("орудие:");
  });

  it("scales the gun by its own model scale", () => {
    const small = renderToStaticMarkup(
      <PlayerShipPreview tuning={tuning({ shape: "weapon-gatling", modelScale: 0.5 })} />
    );
    const large = renderToStaticMarkup(
      <PlayerShipPreview tuning={tuning({ shape: "weapon-gatling", modelScale: 2 })} />
    );

    expect(small).not.toEqual(large);
  });
});
