import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShieldEffectSlots, withShipEffect } from "./ShieldEffectSlots.js";

describe("choosing a hull's shield effects", () => {
  it("keeps the slot that was not touched", () => {
    expect(withShipEffect({ shieldBand: "shield-band" }, "shieldImpact", "shield-impact")).toEqual({
      shieldBand: "shield-band",
      shieldImpact: "shield-impact"
    });
  });

  it("drops the block entirely when the last choice is reset", () => {
    // Not an empty object: a hull with no choice in it must carry no block at
    // all, or an untouched preset stops being byte-identical after a save.
    expect(withShipEffect({ shieldBand: "shield-band" }, "shieldBand", "")).toBeUndefined();
    expect(
      withShipEffect({ shieldBand: "shield-band", shieldImpact: "shield-impact" }, "shieldBand", "")
    ).toEqual({ shieldImpact: "shield-impact" });
  });

  it("refuses a loop in the impact slot and a one-shot in the barrier slot", () => {
    /*
     * The reason there are two lists rather than one. A loop hung on an impact
     * would never end, and a one-shot stretched over a raised sector would play
     * once and leave the shield bare for the rest of the run - and neither
     * mistake is visible in the console, only in the game.
     */
    expect(withShipEffect(undefined, "shieldImpact", "shield-band")).toBeUndefined();
    expect(withShipEffect(undefined, "shieldBand", "shield-impact")).toBeUndefined();
    expect(withShipEffect(undefined, "shieldBand", "plasma-exhaust")).toEqual({
      shieldBand: "plasma-exhaust"
    });
  });

  it("ignores an id this build does not know", () => {
    // A preset written by a newer build, or a hand-edited file: the slot reads
    // as "not chosen" rather than travelling into the balance schema.
    expect(withShipEffect(undefined, "shieldBand", "shield-band-mk2")).toBeUndefined();
  });

  it("offers both slots, and only loops in the barrier one", () => {
    const markup = renderToStaticMarkup(
      <ShieldEffectSlots
        effects={{ shieldBand: "shield-band" }}
        onChange={() => {
          // The markup is what this asserts; the handler is exercised elsewhere.
        }}
      />
    );
    expect(markup).toContain('data-testid="ship-effect-shieldBand"');
    expect(markup).toContain('data-testid="ship-effect-shieldImpact"');
    expect(markup).toContain('data-testid="ship-effect-thumb-shieldBand"');
    // A one-shot must not be offered as a barrier.
    const barrier = markup.slice(0, markup.indexOf("ship-effect-shieldImpact"));
    expect(barrier).not.toContain("debris-burst");
    expect(barrier).toContain("shield-band");
  });

  it("says what an empty slot means", () => {
    const markup = renderToStaticMarkup(
      <ShieldEffectSlots
        effects={undefined}
        onChange={() => {
          // As above.
        }}
      />
    );
    expect(markup).toContain("как сейчас");
    expect(markup).toContain("запечённый барьер дисплея");
    expect(markup).toContain("запечённая вспышка дисплея");
  });
});
