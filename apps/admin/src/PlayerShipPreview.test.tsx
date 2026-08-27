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
      <PlayerShipPreview
        tuning={tuning({
          shape: "weapon-gatling",
          modelScale: 1,
          mountX: 0,
          mountY: 0,
          pivotX: 0,
          pivotY: 0
        })}
      />
    );

    // Counted, not compared: the caption alone changes whether or not the gun
    // is actually drawn, and a preview that only names the choice is the bug.
    expect(countShapes(armed)).toBeGreaterThan(countShapes(bare));
    expect(armed).toContain("орудие");
    expect(bare).not.toContain("орудие");
  });

  it("names the gun in the accessible label beside the hull", () => {
    const markup = renderToStaticMarkup(
      <PlayerShipPreview
        tuning={tuning({
          shape: "weapon-gatling",
          modelScale: 1,
          mountX: 0,
          mountY: 0,
          pivotX: 0,
          pivotY: 0
        })}
      />
    );

    expect(markup).toContain("Корпус игрока:");
    expect(markup).toContain("орудие:");
  });

  it("scales the gun by its own model scale", () => {
    const small = renderToStaticMarkup(
      <PlayerShipPreview
        tuning={tuning({
          shape: "weapon-gatling",
          modelScale: 0.5,
          mountX: 0,
          mountY: 0,
          pivotX: 0,
          pivotY: 0
        })}
      />
    );
    const large = renderToStaticMarkup(
      <PlayerShipPreview
        tuning={tuning({
          shape: "weapon-gatling",
          modelScale: 2,
          mountX: 0,
          mountY: 0,
          pivotX: 0,
          pivotY: 0
        })}
      />
    );

    expect(small).not.toEqual(large);
  });
});

describe("PlayerShipPreview turret pivot", () => {
  const gun = {
    shape: "weapon-gatling",
    modelScale: 1,
    mountX: 0,
    mountY: 0,
    pivotX: 0,
    pivotY: 0
  } as const;

  it("moves the gun by its pivot so the mount can be brought onto the centre", () => {
    // The catalogue draws each asset around its own origin, which is rarely the
    // mount, so without this the gun swings about a point beside itself.
    const centred = renderToStaticMarkup(<PlayerShipPreview tuning={tuning(gun)} />);
    const nudged = renderToStaticMarkup(
      <PlayerShipPreview tuning={tuning({ ...gun, pivotY: -0.4 })} />
    );

    expect(nudged).not.toEqual(centred);
    // The offset lands as a translation, not as a different silhouette.
    expect(countShapes(nudged)).toBe(countShapes(centred));
  });

  it("leaves the hull alone when only the gun is nudged", () => {
    const nudged = renderToStaticMarkup(
      <PlayerShipPreview tuning={tuning({ ...gun, pivotX: 0.5 })} />
    );

    // The hitbox ring marks the ship centre and must not move with the gun.
    expect(nudged).toContain('cx="74"');
  });
});

describe("PlayerShipPreview turret mount", () => {
  const gun = {
    shape: "weapon-gatling",
    modelScale: 1,
    mountX: 0,
    mountY: 0,
    pivotX: 0,
    pivotY: 0
  } as const;

  it("moves the mount marker with the mount, not with the nudge", () => {
    // The marker shows where the weapon is bolted, which is the point it turns
    // about; the nudge only slides the drawing around that point.
    const centred = renderToStaticMarkup(<PlayerShipPreview tuning={tuning(gun)} />);
    expect(centred).toContain('cx="74"');

    const onTheWing = renderToStaticMarkup(
      <PlayerShipPreview tuning={tuning({ ...gun, mountX: 0.5 })} />
    );
    expect(onTheWing).not.toContain('cx="74" cy="74" r="2"');

    // A nudge alone leaves the marker where it was.
    const nudged = renderToStaticMarkup(
      <PlayerShipPreview tuning={tuning({ ...gun, pivotX: 0.5 })} />
    );
    expect(nudged).toContain('cx="74" cy="74" r="2"');
  });

  it("carries the gun to its mount as well as the marker", () => {
    // Asserted on the gun's own transform, not on the whole markup: the marker
    // moves on its own, so comparing the documents proves nothing about where
    // the weapon ended up.
    const centred = renderToStaticMarkup(<PlayerShipPreview tuning={tuning(gun)} />);
    expect(centred).toContain("translate(0 0)");

    const onTheWing = renderToStaticMarkup(
      <PlayerShipPreview tuning={tuning({ ...gun, mountY: -0.6 })} />
    );
    expect(onTheWing).not.toContain("translate(0 0)");
    expect(countShapes(onTheWing)).toBe(countShapes(centred));
  });
});
