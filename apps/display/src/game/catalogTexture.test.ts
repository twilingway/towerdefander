import { describe, expect, it, vi } from "vitest";
import { getVisualAsset, type VisualSpriteAsset } from "@spaceship-defender/protocol";

import {
  asteroidSpinFor,
  bakeCatalogArt,
  spriteFrameFor,
  spriteScale,
  spriteSheetKey,
  type BakeShape
} from "./catalogTexture.js";

describe("asteroid spin", () => {
  it("turns the same rock the same way every time it is asked", () => {
    expect(asteroidSpinFor("asteroid-7")).toEqual(asteroidSpinFor("asteroid-7"));
  });

  it("keeps rates in the reference band and turns rocks both ways", () => {
    const spins = Array.from({ length: 40 }, (_, index) =>
      asteroidSpinFor(`asteroid-${String(index)}`)
    );
    for (const spin of spins) {
      expect(Math.abs(spin.rate)).toBeGreaterThanOrEqual(0.22);
      expect(Math.abs(spin.rate)).toBeLessThanOrEqual(0.84);
      expect(spin.phase).toBeGreaterThanOrEqual(0);
      expect(spin.phase).toBeLessThan(Math.PI * 2);
    }
    expect(spins.some((spin) => spin.rate > 0)).toBe(true);
    expect(spins.some((spin) => spin.rate < 0)).toBe(true);
  });
});

function spriteAsset(id: string): VisualSpriteAsset {
  const asset = getVisualAsset(id);
  if (asset.kind !== "sprite") throw new Error(`${id} is not a sprite`);
  return asset;
}

/** Just enough of a scene for the texture cache to answer and to take a stamp. */
function fakeScene(loaded: readonly string[]) {
  const keys = new Set(loaded);
  const stamps: { key: string; frame: string | number | undefined; config: unknown }[] = [];
  const scene = {
    textures: {
      exists: (key: string) => keys.has(key),
      addDynamicTexture: (key: string, width: number, height: number) => {
        keys.add(key);
        const texture = {
          width,
          height,
          stamp: (
            sheet: string,
            frame: string | number | undefined,
            _x: number,
            _y: number,
            config: unknown
          ) => {
            stamps.push({ key: sheet, frame, config });
            return texture;
          },
          render: () => texture
        };
        return texture;
      }
    }
  };
  return { scene: scene as never, stamps };
}

describe("sprite frames", () => {
  it("gives a single-cell sprite its only cell", () => {
    expect(spriteFrameFor("asteroid-7", 1)).toBe(0);
  });

  it("keeps an entity on the same cell every time it is asked", () => {
    expect(spriteFrameFor("asteroid-7", 3)).toBe(spriteFrameFor("asteroid-7", 3));
  });

  it("spreads a field of rocks over every cell of the sheet", () => {
    const frames = new Set(
      Array.from({ length: 30 }, (_, index) => spriteFrameFor(`asteroid-${String(index)}`, 3))
    );
    expect([...frames].sort()).toEqual([0, 1, 2]);
  });
});

describe("baking catalogue art", () => {
  const drawVector = () => undefined;

  it("bakes a vector asset through the ordinary drawing", () => {
    const { scene, stamps } = fakeScene([]);
    const bake = vi.fn<BakeShape>((key) => key);
    expect(
      bakeCatalogArt(scene, bake, { shape: "ship-dart", worldRadius: 40 }, "k", 60, drawVector)
    ).toBe("k");
    expect(bake).toHaveBeenCalledWith("k", 60, drawVector);
    expect(stamps).toHaveLength(0);
  });

  it("stamps a loaded sprite turned nose-along-x and scaled like geometry", () => {
    const { scene, stamps } = fakeScene([spriteSheetKey("sprite-player")]);
    const bake = vi.fn<BakeShape>((key) => key);
    const key = bakeCatalogArt(
      scene,
      bake,
      { shape: "sprite-player", worldRadius: 40 },
      "hull",
      60,
      drawVector
    );
    expect(key).toBe("hull:sprite:0");
    expect(bake).not.toHaveBeenCalled();
    expect(stamps).toEqual([
      {
        key: spriteSheetKey("sprite-player"),
        frame: 0,
        config: { rotation: Math.PI / 2, scale: spriteScale(spriteAsset("sprite-player"), 40) }
      }
    ]);
  });

  it("normalises a sprite by its radius and hint, as the renderer does geometry", () => {
    const asset = spriteAsset("sprite-player");
    expect(spriteScale(asset, asset.radius)).toBeCloseTo(asset.scaleHint);
  });

  it("gives different rocks of one sheet different stamps", () => {
    const { scene } = fakeScene([spriteSheetKey("sprite-asteroids")]);
    const bake = vi.fn<BakeShape>((key) => key);
    const keys = new Set(
      Array.from({ length: 30 }, (_, index) =>
        bakeCatalogArt(
          scene,
          bake,
          { shape: "sprite-asteroids", worldRadius: 30, seed: `asteroid-${String(index)}` },
          "rock",
          45,
          drawVector
        )
      )
    );
    expect([...keys].sort()).toEqual(["rock:sprite:0", "rock:sprite:1", "rock:sprite:2"]);
  });

  it("draws the fallback when a sprite sheet never loaded", () => {
    const { scene, stamps } = fakeScene([]);
    const bake = vi.fn<BakeShape>((key) => key);
    expect(
      bakeCatalogArt(
        scene,
        bake,
        { shape: "sprite-enemy-orb", worldRadius: 30 },
        "enemy",
        45,
        drawVector
      )
    ).toBe("enemy");
    expect(bake).toHaveBeenCalledWith("enemy", 45, drawVector);
    expect(stamps).toHaveLength(0);
  });
});
