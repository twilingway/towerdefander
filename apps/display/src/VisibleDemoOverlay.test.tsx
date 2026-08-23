import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VisibleDemoOverlay } from "./VisibleDemoOverlay.js";

describe("VisibleDemoOverlay", () => {
  it("renders offline status, safe pause guidance, and all manual controls", () => {
    const markup = renderToStaticMarkup(
      <VisibleDemoOverlay
        connectionStatus="connected"
        phase="combat"
        waveNumber={2}
        snapshotTick={42}
      />
    );

    expect(markup).toContain('data-testid="visible-demo-overlay"');
    expect(markup).toContain("offline");
    expect(markup).toContain("combat");
    expect(markup).toContain("Пауза автопилота");
    expect(markup).toContain("симуляция продолжает работать");
    expect(markup).toContain("Продолжить");
    expect(markup).toContain("Stop");
    expect(markup).toContain("0 FPS");
    expect(markup).toContain("0 Hz");
  });
});
