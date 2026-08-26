import {
  FALLBACK_VISUAL_ASSET_ID,
  VISUAL_ASSETS,
  getVisualAsset,
  type PublicEnemyCatalogueEntry,
  type PublicEnemyView
} from "@spaceship-defender/protocol";
import { describe, expect, it, vi } from "vitest";

import { drawCatalogAsset } from "./catalogRenderer.js";
import { drawEnemyBody, drawEnemyHealthBar, resolveEnemyVisual } from "./SpaceshipRuntime.js";

interface FillRectCall {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface DrawOperation {
  readonly name: string;
  readonly args: readonly unknown[];
}

/**
 * Stands in for Phaser Graphics. Every method the catalogue renderer can reach
 * is recorded, so a layer type that stops drawing shows up as a missing op
 * rather than as a silently empty silhouette.
 */
function graphicsSpy() {
  const fillRects: FillRectCall[] = [];
  const ops: DrawOperation[] = [];
  const record = (name: string, args: readonly unknown[]): void => {
    ops.push({ name, args });
  };
  const passthrough = (name: string) =>
    function (this: unknown, ...args: unknown[]) {
      record(name, args);
      return this;
    };
  const graphics = {
    clear: passthrough("clear"),
    save: passthrough("save"),
    restore: passthrough("restore"),
    scaleCanvas: passthrough("scaleCanvas"),
    rotateCanvas: passthrough("rotateCanvas"),
    translateCanvas: passthrough("translateCanvas"),
    fillStyle: passthrough("fillStyle"),
    lineStyle: passthrough("lineStyle"),
    fillRect(x: number, y: number, width: number, height: number) {
      fillRects.push({ x, y, width, height });
      record("fillRect", [x, y, width, height]);
      return this;
    },
    strokeRect: passthrough("strokeRect"),
    fillPoints: passthrough("fillPoints"),
    strokePoints: passthrough("strokePoints"),
    fillCircle: passthrough("fillCircle"),
    strokeCircle: passthrough("strokeCircle"),
    fillEllipse: passthrough("fillEllipse"),
    strokeEllipse: passthrough("strokeEllipse"),
    lineBetween: passthrough("lineBetween"),
    beginPath: passthrough("beginPath"),
    arc: passthrough("arc"),
    strokePath: passthrough("strokePath")
  };
  return { graphics, fillRects, ops };
}

function enemy(overrides: Partial<PublicEnemyView> = {}): PublicEnemyView {
  return {
    entityId: "enemy-1",
    spawnSequence: 1,
    x: 100,
    y: 100,
    velocityX: 0,
    velocityY: 0,
    radius: 40,
    kind: "boss",
    heading: 0,
    hp: 50,
    maxHp: 100,
    ...overrides
  };
}

function catalogueEntry(
  overrides: Partial<PublicEnemyCatalogueEntry> = {}
): PublicEnemyCatalogueEntry {
  return {
    kind: "gunship",
    label: "Ганшип",
    shape: "ship-delta",
    modelScale: 1,
    showHealthBar: false,
    ...overrides
  };
}

/** Ops that carry geometry, i.e. the ones a missing layer type would remove. */
const GEOMETRY_OPS = new Set([
  "fillRect",
  "strokeRect",
  "fillPoints",
  "strokePoints",
  "fillCircle",
  "strokeCircle",
  "fillEllipse",
  "strokeEllipse",
  "lineBetween",
  "arc"
]);

describe("catalogue rendering", () => {
  it("draws geometry for every asset the catalogue carries", () => {
    for (const asset of VISUAL_ASSETS) {
      const spy = graphicsSpy();
      drawEnemyBody(spy.graphics as never, catalogueEntry({ shape: asset.id }), 40);
      const drawn = spy.ops.filter(({ name }) => GEOMETRY_OPS.has(name));
      expect(drawn.length, `asset ${asset.id} drew nothing`).toBeGreaterThan(0);
    }
  });

  it("normalises the asset to the authoritative radius instead of its own units", () => {
    // The stored geometry is drawn around the asset's own nominal radius, so the
    // only thing that may vary with entity size is the canvas scale.
    const asset = getVisualAsset("boss-dreadnought");
    const spy = graphicsSpy();
    drawCatalogAsset(spy.graphics as never, asset, 120);
    const scale = spy.ops.find(({ name }) => name === "scaleCanvas");
    expect(scale?.args).toEqual([
      (120 / asset.radius) * asset.scaleHint,
      (120 / asset.radius) * asset.scaleHint
    ]);

    const scaled = graphicsSpy();
    drawEnemyBody(
      scaled.graphics as never,
      catalogueEntry({ shape: "boss-dreadnought", modelScale: 2 }),
      120
    );
    // The model scale multiplies the drawn size; the hitbox radius is untouched.
    expect(scaled.ops.find(({ name }) => name === "scaleCanvas")?.args).toEqual([
      (240 / asset.radius) * asset.scaleHint,
      (240 / asset.radius) * asset.scaleHint
    ]);
  });

  it("turns the nose-up catalogue art along the world's +X heading", () => {
    const spy = graphicsSpy();
    drawEnemyBody(spy.graphics as never, catalogueEntry(), 40);
    expect(spy.ops.find(({ name }) => name === "rotateCanvas")?.args).toEqual([Math.PI / 2]);
  });

  it("balances the canvas transform it opens", () => {
    const spy = graphicsSpy();
    drawEnemyBody(spy.graphics as never, catalogueEntry(), 40);
    const names = spy.ops.map(({ name }) => name);
    expect(names[0]).toBe("save");
    expect(names.at(-1)).toBe("restore");
  });

  it("falls back to a generic silhouette for an archetype it has never seen", () => {
    const catalogue = [catalogueEntry()];
    expect(resolveEnemyVisual(catalogue, "gunship").label).toBe("Ганшип");
    const unknown = resolveEnemyVisual(catalogue, "eliteSniper");
    expect(unknown.shape).toBe(FALLBACK_VISUAL_ASSET_ID);
  });

  it("still draws an archetype whose asset id this build does not carry", () => {
    // Asset ids arrive from operator presets, so an unknown one must not blank
    // the entity out.
    const spy = graphicsSpy();
    drawEnemyBody(
      spy.graphics as never,
      {
        ...catalogueEntry(),
        shape: "ship-from-the-future"
      } as unknown as PublicEnemyCatalogueEntry,
      30
    );
    const fallback = graphicsSpy();
    drawCatalogAsset(fallback.graphics as never, getVisualAsset(FALLBACK_VISUAL_ASSET_ID), 30);
    expect(spy.ops).toEqual(fallback.ops);
  });
});

describe("boss health bar", () => {
  it("fills proportionally to remaining hull", () => {
    const spy = graphicsSpy();
    drawEnemyHealthBar(spy.graphics as never, enemy({ hp: 25, maxHp: 100 }));
    const [background, fill] = spy.fillRects;
    expect(background).toBeDefined();
    expect(fill).toBeDefined();
    expect(fill?.width).toBeCloseTo((background?.width ?? 0) * 0.25);
  });

  it("clamps an over-full or negative hull", () => {
    const over = graphicsSpy();
    drawEnemyHealthBar(over.graphics as never, enemy({ hp: 400, maxHp: 100 }));
    expect(over.fillRects[1]?.width).toBe(over.fillRects[0]?.width);

    const under = graphicsSpy();
    drawEnemyHealthBar(under.graphics as never, enemy({ hp: -20, maxHp: 100 }));
    expect(under.fillRects[1]?.width).toBe(0);
  });
});

// Phaser reaches for `window` at import time, so the runtime under test only
// gets the handful of members the catalogue renderer actually touches.
vi.mock("phaser", () => ({
  default: {
    Math: {
      Vector2: class {
        constructor(
          public x: number,
          public y: number
        ) {}
      }
    },
    Scene: function PhaserScene(this: unknown) {
      return this;
    },
    Game: function PhaserGame(this: unknown) {
      return this;
    },
    AUTO: 0,
    Scale: { NONE: 0, CENTER_BOTH: 0 }
  }
}));
