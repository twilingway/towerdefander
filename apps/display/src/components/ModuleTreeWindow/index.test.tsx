import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ModuleTreeWindow, summariseGains } from "./index.js";
import { PREVIEW_ENDLESS_TIER, PREVIEW_MODULE_TIERS } from "../../previewMode.js";

const SHIP = { maxHp: 540, shieldCapacity: 125, shieldArcRadians: Math.PI / 2, shieldRadius: 104 };

function markup(purchased: readonly string[]): string {
  return renderToStaticMarkup(
    <ModuleTreeWindow
      tiers={PREVIEW_MODULE_TIERS}
      endlessTier={PREVIEW_ENDLESS_TIER}
      purchased={purchased}
      ship={SHIP}
    />
  );
}

describe("ModuleTreeWindow", () => {
  it("draws every tier of the tree plus the repeatable tail", () => {
    const html = markup([]);

    expect(html.match(/module-tree__tier/gu)).toHaveLength(PREVIEW_MODULE_TIERS.length + 1);
    expect(html).toContain(">I<");
    expect(html).toContain(">X<");
    expect(html).toContain(">∞<");
  });

  it("marks what is bought and opens the tier the purchases reached", () => {
    const html = markup(["hullPlating1", "thrusters1"]);

    expect(html).toContain('class="module-tree__cell is-taken" data-role="pilot"');
    expect(html).toContain("Тир 3 из 10 · куплено 2");
    // The third tier is the open one, so its cards read as offered, not locked.
    expect(html).toContain('class="module-tree__cell is-open" data-role="shield"');
  });

  it("opens expanded and offers a control that hides it", () => {
    const html = markup([]);

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Скрыть дерево");
    expect(html).not.toContain("module-tree--collapsed");
  });

  it("calls the tree spent once every tier is behind the crew", () => {
    const html = markup(PREVIEW_MODULE_TIERS.map((tier) => tier[0]?.id ?? ""));

    expect(html).toContain("Дерево пройдено: 10 модулей, дальше повторяемые");
  });
});

describe("ship stats", () => {
  it("names what the ship is now, in the units a person reads", () => {
    const html = markup([]);

    expect(html).toContain("540 ед.");
    expect(html).toContain("90°");
    expect(html).toContain("ничего не куплено");
  });

  it("sums additions, sums percents and multiplies multipliers", () => {
    // Two hull plates add up; the repeatable hull module counts twice over.
    const gains = summariseGains(PREVIEW_MODULE_TIERS, PREVIEW_ENDLESS_TIER, [
      "hullPlating1",
      "hullPlating2",
      "endlessHull",
      "endlessHull",
      "thrusters1",
      "afterburner",
      "autoloader1",
      "rapidFire"
    ]);
    const byKey = new Map(gains.map((effect) => [`${effect.target}:${effect.op}`, effect.value]));

    expect(byKey.get("spaceshipMaxHp:add")).toBe(160);
    expect(byKey.get("spaceshipSpeedPerSecond:percent")).toBeCloseTo(0.22, 10);
    expect(byKey.get("fireCooldownTicks:multiply")).toBeCloseTo(0.675, 10);
  });

  it("ignores a purchase that is not in this tree", () => {
    expect(summariseGains(PREVIEW_MODULE_TIERS, PREVIEW_ENDLESS_TIER, ["nothingLikeThis"])).toEqual(
      []
    );
  });
});
