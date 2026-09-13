import type { BalanceTuning, HudSkin } from "@spaceship-defender/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DirectorScreen } from "./index.js";

/**
 * The screen reads the director, the hazard numbers, the arena and camera sizes,
 * the sky and the HUD skin, and nothing else, so the cast keeps the fixture to
 * those fields.
 */
function tuning(
  background: BalanceTuning["background"],
  hudSkin: HudSkin = "classic"
): BalanceTuning {
  return {
    waveCampaign: {
      director: {
        baseBudget: 10,
        budgetGrowth: 2,
        budgetCap: 60,
        hpGrowth: 0.05,
        hpMultiplierCap: 4,
        tempoGrowth: 0.03,
        tempoMultiplierCap: 2,
        bossWaveInterval: 5
      }
    },
    enemySpawnIntervalTicks: 120,
    intermissionTicks: 1800,
    asteroidLifetimeTicks: 1500,
    ambientAsteroidIntervalMinTicks: 120,
    ambientAsteroidIntervalMaxTicks: 300,
    asteroidHp: 65,
    asteroidDamage: 40,
    asteroidSpeedPerSecond: 190,
    asteroidSpawnCost: 1,
    asteroidVisual: null,
    arenaRadius: 2200,
    cameraViewWidth: 2500,
    background,
    hudSkin
  } as unknown as BalanceTuning;
}

describe("DirectorScreen sky", () => {
  it("offers a picture and a parallax, and none of the old layer knobs", () => {
    const markup = renderToStaticMarkup(
      <DirectorScreen
        tuning={tuning({ image: "deep-nebula", parallaxStrength: 1 })}
        onChange={vi.fn()}
      />
    );

    expect(markup).toContain("Картинка");
    expect(markup).toContain("туманность со звёздами");
    expect(markup).toContain("без фона");
    expect(markup).toContain("Параллакс от камеры");
    // The four numbers described layers that are gone; a knob for them would do nothing.
    expect(markup).not.toContain("Дрейф фона");
    expect(markup).not.toContain("Небулы");
  });

  it("shows the preset's own choice of picture", () => {
    const markup = renderToStaticMarkup(
      <DirectorScreen tuning={tuning({ image: "none", parallaxStrength: 1 })} onChange={vi.fn()} />
    );

    expect(markup).toContain('value="none" selected=""');
    expect(markup).not.toContain('value="deep-nebula" selected=""');
  });
});

describe("DirectorScreen HUD skin", () => {
  it("offers both skins and says the choice waits for the next fight", () => {
    const markup = renderToStaticMarkup(
      <DirectorScreen tuning={tuning({ image: "none", parallaxStrength: 1 })} onChange={vi.fn()} />
    );

    expect(markup).toContain("Оформление HUD");
    expect(markup).toContain(">классика<");
    expect(markup).toContain(">рамки<");
    expect(markup).toContain("со следующего боя");
  });

  it("shows the preset's own skin", () => {
    const markup = renderToStaticMarkup(
      <DirectorScreen
        tuning={tuning({ image: "none", parallaxStrength: 1 }, "frame")}
        onChange={vi.fn()}
      />
    );

    expect(markup).toContain('value="frame" selected=""');
    expect(markup).not.toContain('value="classic" selected=""');
  });
});
