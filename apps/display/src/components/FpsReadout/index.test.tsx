import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { fpsClassName, formatFps, FpsReadout, FPS_STRAIN_CEILING } from "./index.js";

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
    const markup = renderToStaticMarkup(<FpsReadout fps={58} />);
    expect(markup).toContain('data-testid="fps-readout"');
    expect(markup).toContain("58");
    expect(markup).toContain("FPS");
  });
});
