import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { formatWaveCountdown, WaveCountdown } from "./WaveCountdown.js";

describe("WaveCountdown", () => {
  it("formats the authoritative wave deadline as MM:SS", () => {
    expect(formatWaveCountdown(1200)).toBe("20:00");
    expect(formatWaveCountdown(61)).toBe("01:01");
    expect(formatWaveCountdown(-1)).toBe("00:00");
  });

  it("renders a circular warning during the final minute", () => {
    const markup = renderToStaticMarkup(<WaveCountdown secondsRemaining={45} />);

    expect(markup).toContain('role="timer"');
    expect(markup).toContain("00:45");
    expect(markup).toContain("wave-countdown--warning");
  });
});
