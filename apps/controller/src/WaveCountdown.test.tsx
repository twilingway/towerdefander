import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { formatWaveCountdown, WaveCountdown } from "./WaveCountdown.js";

describe("WaveCountdown", () => {
  it("formats the authoritative wave deadline as MM:SS", () => {
    expect(formatWaveCountdown(1200)).toBe("20:00");
    expect(formatWaveCountdown(61)).toBe("01:01");
  });

  it("renders the same countdown for every role controller", () => {
    const markup = renderToStaticMarkup(<WaveCountdown secondsRemaining={599} />);

    expect(markup).toContain('role="timer"');
    expect(markup).toContain("09:59");
  });
});
