import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EffectSlots, withEffectSlot } from "./EffectSlots.js";

describe("changing one effect slot", () => {
  it("keeps the slots it was not asked about", () => {
    expect(
      withEffectSlot({ death: "explosion", hit: "muzzle-flash" }, "shot", "debris-burst")
    ).toEqual({ death: "explosion", hit: "muzzle-flash", shot: "debris-burst" });
  });

  it("removes a slot reset to the default instead of storing a blank", () => {
    // An empty string is what the room sends for an unset slot, so the preset
    // must not carry one: the absence is the signal.
    expect(withEffectSlot({ death: "explosion", hit: "muzzle-flash" }, "death", "")).toEqual({
      hit: "muzzle-flash"
    });
  });

  it("drops the whole block once nothing is chosen", () => {
    // What keeps an untouched preset playing exactly as it did before slots
    // existed: no block at all rather than a block of empties.
    expect(withEffectSlot({ death: "explosion" }, "death", "")).toBeUndefined();
    expect(withEffectSlot(undefined, "hit", "")).toBeUndefined();
  });

  it("fills the first slot of an archetype that had none", () => {
    expect(withEffectSlot(undefined, "shot", "muzzle-flash")).toEqual({ shot: "muzzle-flash" });
  });
});

describe("the slots on screen", () => {
  it("offers all three events, defaulting to the built-in behaviour", () => {
    const markup = renderToStaticMarkup(<EffectSlots effects={undefined} onChange={vi.fn()} />);
    for (const slot of ["death", "hit", "shot"]) {
      expect(markup).toContain(`data-testid="enemy-effect-${slot}"`);
    }
    // Three selects, each opening on "as it is now".
    expect(markup.match(/как сейчас/g)).toHaveLength(3);
    // Nothing chosen means no thumbnails.
    expect(markup).not.toContain("enemy-effect-thumb-");
  });

  it("shows a frame of whatever is chosen", () => {
    const markup = renderToStaticMarkup(
      <EffectSlots effects={{ death: "explosion" }} onChange={vi.fn()} />
    );
    expect(markup).toContain('data-testid="enemy-effect-thumb-death"');
    expect(markup).toContain("background-position");
    // The other two are still on the default, so they stay hints.
    expect(markup).not.toContain("enemy-effect-thumb-hit");
  });

  it("does not offer the exhaust, which is a loop", () => {
    // A loop hung on an event would never end; the protocol's event list is what
    // keeps it out, and this is the check that the screen honours that list.
    const markup = renderToStaticMarkup(<EffectSlots effects={undefined} onChange={vi.fn()} />);
    expect(markup).not.toContain("plasma-exhaust");
  });
});
