import { FX_EFFECTS, getPopulatedFxCategories } from "@spaceship-defender/fx-assets";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EffectsScreen } from "./index.js";

/**
 * The screen reads the generated manifest and nothing else, so these run
 * against the real baked catalogue: a bake that dropped an effect fails here as
 * well as in the atlas contract test.
 */
describe("effects catalogue screen", () => {
  const markup = renderToStaticMarkup(<EffectsScreen />);

  it("puts a card on the grid for every baked effect", () => {
    for (const effect of FX_EFFECTS) {
      expect(markup).toContain(`data-testid="fx-card-${effect.id}"`);
      expect(markup).toContain(effect.title);
    }
  });

  it("offers a chip for every populated category, plus all", () => {
    expect(markup).toContain('data-testid="fx-filter-all"');
    for (const category of getPopulatedFxCategories()) {
      expect(markup).toContain(`data-testid="fx-filter-${category}"`);
    }
  });

  it("opens with the first effect selected and its preview showing", () => {
    const first = FX_EFFECTS[0];
    if (first === undefined) throw new Error("the manifest is empty");
    expect(markup).toContain('data-testid="fx-preview"');
    expect(markup).toContain(`fx-card fx-card--active" data-testid="fx-card-${first.id}"`);
    // The frame window carries the atlas as a scaled background; a missing
    // background-position would show the whole sheet at once.
    expect(markup).toContain("background-position");
    expect(markup).toContain(`1 / ${String(first.meta.frames)}`);
  });

  it("says where the atlases come from, so an operator can re-bake them", () => {
    expect(markup).toContain("pnpm fx:bake");
  });
});
