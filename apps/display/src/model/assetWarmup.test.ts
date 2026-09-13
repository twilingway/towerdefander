import { FX_EFFECTS } from "@spaceship-defender/fx-assets";
import { BACKDROP_ARTS, HUD_ARTS, SPRITE_ARTS } from "@spaceship-defender/sprite-assets";
import { describe, expect, it, vi } from "vitest";

import { fightImageUrls, warmImage } from "./assetWarmup.js";

describe("fight asset warm-up", () => {
  it("covers every picture the fight may draw", () => {
    const urls = fightImageUrls();

    expect(urls).toHaveLength(
      SPRITE_ARTS.length + BACKDROP_ARTS.length + HUD_ARTS.length + FX_EFFECTS.length
    );
    expect(urls).toContain(HUD_ARTS[0]?.url);
    expect(urls).toContain(FX_EFFECTS[0]?.url);
  });

  it("decodes a picture before it counts as warm", async () => {
    const decode = vi.fn(() => Promise.resolve());
    const image = { src: "", decode };

    await warmImage("sprite.webp", () => image);

    expect(image.src).toBe("sprite.webp");
    expect(decode).toHaveBeenCalledOnce();
  });

  it("counts a picture that fails as finished", async () => {
    const image = { src: "", decode: () => Promise.reject(new Error("404")) };

    await expect(warmImage("missing.webp", () => image)).resolves.toBeUndefined();
  });
});
