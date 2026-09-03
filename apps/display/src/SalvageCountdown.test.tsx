import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SalvageCountdown } from "./SalvageCountdown.js";

describe("SalvageCountdown", () => {
  it("names the seconds the crew has to reach the salvage", () => {
    const markup = renderToStaticMarkup(<SalvageCountdown secondsRemaining={12} />);

    expect(markup).toContain('role="timer"');
    expect(markup).toContain("Сбор трофеев");
    expect(markup).toContain(">12<");
    expect(markup).toContain("wave-countdown--salvage");
  });
});
