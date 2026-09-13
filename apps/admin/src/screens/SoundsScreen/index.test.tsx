import { renderToStaticMarkup } from "react-dom/server";
import { SOUND_IDS } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import { SoundsScreen } from "./index.js";

describe("the sound catalogue", () => {
  it("lists every sound the protocol carries, with a way to hear it", () => {
    const markup = renderToStaticMarkup(<SoundsScreen />);
    for (const id of SOUND_IDS) {
      expect(markup).toContain(`data-testid="sound-play-${id}"`);
    }
  });

  it("offers the groups to filter by", () => {
    const markup = renderToStaticMarkup(<SoundsScreen />);
    expect(markup).toContain('data-testid="sound-filter-all"');
    expect(markup).toContain("Оружие");
    expect(markup).toContain("Взрывы");
  });

  /**
   * A burst is not a shot, and the page has to say which is which: it decides
   * whether the display plays the file on every round or once per the rounds
   * inside it.
   */
  it("says what is inside a sample", () => {
    const markup = renderToStaticMarkup(<SoundsScreen />);
    expect(markup).toContain("Одно событие");
    expect(markup).toContain("Очередь: 8 выстрелов");
  });
});
