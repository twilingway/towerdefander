import { ENEMY_KINDS, type PublicEnemyView } from "@spaceship-defender/protocol";
import { describe, expect, it, vi } from "vitest";

import { ENEMY_VISUALS, drawEnemyHealthBar } from "./SpaceshipRuntime.js";

interface FillRectCall {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function graphicsSpy() {
  const fillRects: FillRectCall[] = [];
  const calls: string[] = [];
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
      return this;
    },
    strokeRect() {
      return this;
    },
    fillTriangle() {
      calls.push("fillTriangle");
      return this;
    },
    strokeTriangle() {
      return this;
    },
    fillRoundedRect() {
      calls.push("fillRoundedRect");
      return this;
    },
    strokeRoundedRect() {
      return this;
    },
    fillPoints() {
      calls.push("fillPoints");
      return this;
    },
    strokePoints() {
      return this;
    },
    strokeCircle() {
      calls.push("strokeCircle");
      return this;
    }
  };
  return { graphics, fillRects, calls };
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

describe("enemy visuals", () => {
  it("describes every published enemy kind", () => {
    expect(Object.keys(ENEMY_VISUALS).sort()).toEqual([...ENEMY_KINDS].sort());
  });

  it("gives each kind its own colour", () => {
    const colors = Object.values(ENEMY_VISUALS).map(({ color }) => color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("shows a health bar only for the boss", () => {
    const withBar = ENEMY_KINDS.filter((kind) => ENEMY_VISUALS[kind].showHealthBar);
    expect(withBar).toEqual(["boss"]);
  });

  it("scales each silhouette with the authoritative radius", () => {
    for (const kind of ENEMY_KINDS) {
      const small = graphicsSpy();
      const large = graphicsSpy();
      ENEMY_VISUALS[kind].draw(small.graphics as never, 10);
      ENEMY_VISUALS[kind].draw(large.graphics as never, 90);
      expect(small.calls.length).toBeGreaterThan(0);
      expect(large.calls).toEqual(small.calls);
    }
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
