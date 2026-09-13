import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { formatWaveCountdown, TimerFrame } from "./TimerFrame.js";

describe("formatWaveCountdown", () => {
  it("reads minutes and seconds, and never below zero", () => {
    expect(formatWaveCountdown(1200)).toBe("20:00");
    expect(formatWaveCountdown(61)).toBe("01:01");
    expect(formatWaveCountdown(-1)).toBe("00:00");
  });
});

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

  it("draws no caption for a clock that has no words", () => {
    const markup = renderToStaticMarkup(
      <TimerFrame
        value="04:30"
        caption={undefined}
        ariaLabel="Осталось 04:30"
        tone="wave"
        frameUrl="timer.webp"
      />
    );

    expect(markup).toContain('class="timer-frame__value">04:30<');
    expect(markup).not.toContain("timer-frame__caption");
  });
});
