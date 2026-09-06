import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  formatFrameSpike,
  formatFps,
  formatStutterShare,
  stutterClassName,
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

  it("says nothing about evenness while the picture is even", () => {
    expect(formatStutterShare(0)).toBeUndefined();
    expect(formatStutterShare(0.05)).toBeUndefined();
  });

  it("names the share of frames that ran long once it is worth naming", () => {
    expect(formatStutterShare(0.1)).toBe("10");
    expect(formatStutterShare(0.334)).toBe("33");
  });

  it("alarms only when most of a pan is judder", () => {
    expect(stutterClassName(0.1)).toBe("frame-stutter");
    expect(stutterClassName(0.25)).toContain("frame-stutter--alarming");
  });

  it("draws the badge beside the frame rate", () => {
    const markup = renderToStaticMarkup(
      <FpsReadout fps={58} worstFrameMs={0} stutterShare={0.3} />
    );

    // The two answer different questions: 58 frames a second is healthy, and a
    // third of them arriving late is what the eye actually complains about.
    expect(markup).toContain('data-testid="frame-stutter"');
    expect(markup).toContain("30");
  });
});
