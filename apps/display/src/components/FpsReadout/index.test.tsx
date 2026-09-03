import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  formatFrameSpike,
  formatFps,
  fpsClassName,
  frameSpikeClassName,
  FpsReadout,
  FPS_STRAIN_CEILING,
  FREEZE_ALARM_MS,
  FREEZE_VISIBLE_MS
} from "./index.js";

describe("FpsReadout", () => {
  it("shows whole frames and says nothing when there is no scene yet", () => {
    expect(formatFps(59.7)).toBe("60");
    expect(formatFps(0)).toBe("—");
    expect(formatFps(Number.NaN)).toBe("—");
  });

  it("marks a rate the player can see dropping", () => {
    expect(fpsClassName(60)).not.toContain("strained");
    expect(fpsClassName(FPS_STRAIN_CEILING - 1)).toContain("strained");
    // A scene that has not started is not a scene that is struggling.
    expect(fpsClassName(0)).not.toContain("strained");
  });

  it("renders the sample it is given", () => {
    const markup = renderToStaticMarkup(<FpsReadout fps={58} worstFrameMs={20} />);
    expect(markup).toContain('data-testid="fps-readout"');
    expect(markup).toContain("58");
    expect(markup).toContain("FPS");
  });

  it("names the worst frame only when there was one worth naming", () => {
    // A frame the scene was always going to draw is not news; the badge stays a
    // frame counter until the loop actually stalls.
    expect(formatFrameSpike(FREEZE_VISIBLE_MS - 1)).toBeUndefined();
    expect(formatFrameSpike(16.7)).toBeUndefined();
    expect(formatFrameSpike(Number.NaN)).toBeUndefined();
    expect(formatFrameSpike(FREEZE_VISIBLE_MS)).toBe("50");
    expect(formatFrameSpike(183.4)).toBe("183");
  });

  it("marks a stall nobody could miss", () => {
    expect(frameSpikeClassName(FREEZE_ALARM_MS - 1)).not.toContain("alarming");
    expect(frameSpikeClassName(FREEZE_ALARM_MS)).toContain("alarming");
  });

  it("keeps a good second out of the badge and puts a stalled one in it", () => {
    const steady = renderToStaticMarkup(<FpsReadout fps={60} worstFrameMs={18} />);
    expect(steady).not.toContain('data-testid="frame-spike"');
    // A second that averages sixty and still stopped for a fifth of it: the
    // whole point of the second number.
    const stalled = renderToStaticMarkup(<FpsReadout fps={60} worstFrameMs={210} />);
    expect(stalled).toContain('data-testid="frame-spike"');
    expect(stalled).toContain("210");
    expect(stalled).toContain("alarming");
  });
});
