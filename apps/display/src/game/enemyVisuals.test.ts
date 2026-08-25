import {
  ENEMY_SHAPES,
  type PublicEnemyCatalogueEntry,
  type PublicEnemyView
} from "@spaceship-defender/protocol";
import { describe, expect, it, vi } from "vitest";

import {
  drawEnemyBody,
  drawEnemyHealthBar,
  resolveEnemyVisual,
  toColorValue
} from "./SpaceshipRuntime.js";

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

function graphicsSpy() {
  const fillRects: FillRectCall[] = [];
  const calls: string[] = [];
  const ops: DrawOperation[] = [];
  const record = (name: string, args: readonly unknown[]): void => {
    ops.push({ name, args });
  };
  const graphics = {
    clear() {
      calls.push("clear");
      return this;
    },
    fillStyle() {
      return this;
    },
    lineStyle() {
      return this;
    },
    fillRect(x: number, y: number, width: number, height: number) {
      fillRects.push({ x, y, width, height });
      record("fillRect", [x, y, width, height]);
      return this;
    },
    strokeRect(...args: unknown[]) {
      record("strokeRect", args);
      return this;
    },
    fillTriangle(...args: unknown[]) {
      calls.push("fillTriangle");
      record("fillTriangle", args);
      return this;
    },
    strokeTriangle(...args: unknown[]) {
      record("strokeTriangle", args);
      return this;
    },
    fillRoundedRect(...args: unknown[]) {
      calls.push("fillRoundedRect");
      record("fillRoundedRect", args);
      return this;
    },
    strokeRoundedRect(...args: unknown[]) {
      record("strokeRoundedRect", args);
      return this;
    },
    fillPoints(...args: unknown[]) {
      calls.push("fillPoints");
      record("fillPoints", args);
      return this;
    },
    strokePoints(...args: unknown[]) {
      record("strokePoints", args);
      return this;
    },
    strokeCircle(...args: unknown[]) {
      calls.push("strokeCircle");
      record("strokeCircle", args);
      return this;
    }
  };
  return { graphics, fillRects, calls, ops };
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
    shape: "arrowhead",
    color: "#e65f4b",
    outline: "#ffd1b0",
    modelScale: 1,
    showHealthBar: false,
    ...overrides
  };
}

describe("enemy visuals", () => {
  it("draws every shape the protocol can publish", () => {
    for (const shape of ENEMY_SHAPES) {
      const spy = graphicsSpy();
      drawEnemyBody(spy.graphics as never, catalogueEntry({ shape }), 40);
      expect(spy.ops.length, `shape ${shape} drew nothing`).toBeGreaterThan(0);
    }
  });

  it("scales each silhouette with the authoritative radius", () => {
    for (const shape of ENEMY_SHAPES) {
      const small = graphicsSpy();
      const large = graphicsSpy();
      drawEnemyBody(small.graphics as never, catalogueEntry({ shape }), 10);
      drawEnemyBody(large.graphics as never, catalogueEntry({ shape }), 90);
      expect(large.ops.map(({ name }) => name)).toEqual(small.ops.map(({ name }) => name));
      expect(
        large.ops.map(({ args }) => args),
        `shape ${shape} ignores radius`
      ).not.toEqual(small.ops.map(({ args }) => args));
    }
  });

  it("falls back to a generic silhouette for an archetype it has never seen", () => {
    const catalogue = [catalogueEntry()];
    expect(resolveEnemyVisual(catalogue, "gunship").label).toBe("Ганшип");
    const unknown = resolveEnemyVisual(catalogue, "eliteSniper");
    expect(unknown.shape).toBe("arrowhead");
    const spy = graphicsSpy();
    drawEnemyBody(spy.graphics as never, unknown, 30);
    expect(spy.ops.length).toBeGreaterThan(0);
  });

  it("reads colours from catalogue data", () => {
    expect(toColorValue("#22c55e")).toBe(0x22c55e);
    expect(toColorValue("not-a-colour")).toBe(0xffffff);
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
    drawEnemyHealthBar(under.graphics as never, enemy({ hp: -5, maxHp: 100 }));
    expect(under.fillRects[1]?.width).toBe(0);
  });

  it("redraws from a clean slate", () => {
    const spy = graphicsSpy();
    drawEnemyHealthBar(spy.graphics as never, enemy());
    expect(spy.calls[0]).toBe("clear");
  });

  it("sits above the hull it belongs to", () => {
    const spy = graphicsSpy();
    const view = enemy({ radius: 40 });
    drawEnemyHealthBar(spy.graphics as never, view);
    expect(spy.fillRects[0]?.y).toBeLessThan(-view.radius);
  });
});

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
