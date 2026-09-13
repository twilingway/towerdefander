import { describe, expect, it } from "vitest";

import { SPRITE_ARTS, getSpriteArt } from "./index.ts";

/**
 * The manifest is generated, so these guard the generator rather than a human.
 * Whether the files on disk match it, and whether the protocol names the same
 * sprites, is checked by `scripts/build-sprite-assets.node-test.mjs`, which can
 * read files.
 */
describe("sprite manifest", () => {
  it("carries each sprite once", () => {
    expect(SPRITE_ARTS.length).toBeGreaterThan(0);
    const ids = SPRITE_ARTS.map((art) => art.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("describes a grid that holds its own frames", () => {
    for (const art of SPRITE_ARTS) {
      expect(art.width % art.frameWidth, art.id).toBe(0);
      expect(art.height % art.frameHeight, art.id).toBe(0);
      const cells = (art.width / art.frameWidth) * (art.height / art.frameHeight);
      expect(art.frames, art.id).toBeGreaterThan(0);
      expect(art.frames, art.id).toBeLessThanOrEqual(cells);
      expect(art.url, art.id).not.toBe("");
    }
  });

  it("answers undefined for art that was never built", () => {
    expect(getSpriteArt("no-such-sprite")).toBeUndefined();
  });
});
