import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TimerFrame } from "./TimerFrame.js";

describe("TimerFrame", () => {
  it("says the loot window in words beside its seconds, not only in colour", () => {
    const markup = renderToStaticMarkup(
      <TimerFrame
        value="12"
        caption="Сбор трофеев"
        ariaLabel="Сбор трофеев 12 с"
        tone="salvage"
        frameUrl="timer.webp"
      />
    );

    expect(markup).toContain('role="timer"');
    expect(markup).toContain('aria-label="Сбор трофеев 12 с"');
    expect(markup).toContain("timer-frame--salvage");
    expect(markup).toContain('class="timer-frame__caption">Сбор трофеев<');
    expect(markup).toContain('class="timer-frame__value">12<');
  });
});
