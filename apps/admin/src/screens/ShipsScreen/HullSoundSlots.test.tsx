import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { HullSoundSlots, withShipSound } from "./HullSoundSlots.js";

describe("choosing a hull's sounds", () => {
  it("keeps the slot that was not touched", () => {
    expect(withShipSound({ cannonShot: "cannon" }, "mgShot", "machine-gun")).toEqual({
      cannonShot: "cannon",
      mgShot: "machine-gun"
    });
  });

  it("drops the block entirely when the last choice is reset", () => {
    // Not an empty object: a hull with no choice in it must carry no block at
    // all, or an untouched preset stops being byte-identical after a save.
    expect(withShipSound({ cannonShot: "cannon" }, "cannonShot", "")).toBeUndefined();
    expect(withShipSound({ cannonShot: "cannon", hit: "explosion" }, "cannonShot", "")).toEqual({
      hit: "explosion"
    });
  });

  it("refuses an id the catalogue does not carry", () => {
    // A preset written by a newer build, or a reset that arrived as a word:
    // either way the schema would refuse the document on save, and the console
    // is where that has to be caught.
    expect(withShipSound(undefined, "cannonShot", "a-sound-nobody-baked")).toBeUndefined();
  });

  /**
   * The whole reason a sound slot is not an effect slot: a thumbnail answers
   * "which one is that" for a picture, and nothing answers it for a file name
   * except playing the file.
   */
  it("offers a way to hear every sound before one is assigned", () => {
    const markup = renderToStaticMarkup(<HullSoundSlots sounds={undefined} onChange={vi.fn()} />);
    expect(markup).toContain('data-testid="ship-sound-library"');
    expect(markup).toContain("Прослушать:");
    expect(markup).toContain("Пушка");
    expect(markup).toContain("Взрыв боса");
    // And a per-slot button, disabled while the slot names nothing.
    expect(markup).toContain('data-testid="ship-sound-play-cannonShot"');
  });
});
