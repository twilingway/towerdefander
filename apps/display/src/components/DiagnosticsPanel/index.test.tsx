import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DiagnosticsPanel, formatBytes, formatPing, formatStepMs } from "./index.js";
import { createWorkMeter } from "../../model/workMeter.js";
import { createTrafficMeter } from "../../model/trafficMeter.js";

function render(overrides: Partial<Parameters<typeof DiagnosticsPanel>[0]> = {}): string {
  return renderToStaticMarkup(
    <DiagnosticsPanel
      fps={60}
      worstFrameMs={18}
      stutterShare={0.04}
      sceneMsPerSecond={240}
      worstSceneMs={9.3}
      serverStepMs={0.137}
      pingMs={24}
      entityCount={208}
      averageFrameMs={6.1}
      tickHz={60}
      patchHz={30}
      longTasks={{ supported: true, perSecond: 0, worstMs: 0 }}
      liveDrawn={208}
      offscreen={120}
      playbackDelayMs={160}
      patchIntervalMs={62}
      interfaceEnabled={true}
      onToggleInterface={() => undefined}
      traffic={{ ...createTrafficMeter(), inPerSecond: 5_120, outPerSecond: 640, totalIn: 51_200 }}
      snapshot={{ ...createWorkMeter(), msPerSecond: 160, samplesPerSecond: 20, worstMs: 11.4 }}
      commit={{ ...createWorkMeter(), msPerSecond: 320, samplesPerSecond: 16, worstMs: 26.5 }}
      pendingInput={3}
      drift={0.04}
      predictionEnabled
      onTogglePrediction={() => undefined}
      backgroundEnabled
      onToggleBackground={() => undefined}
      glowEnabled
      onToggleGlow={() => undefined}
      vectorsEnabled
      onToggleVectors={() => undefined}
      {...overrides}
    />
  );
}

describe("DiagnosticsPanel", () => {
  it("tells the scene's own frame work apart from the rest of the frame", () => {
    const markup = render();

    expect(markup).toContain("240 мс/с");
    expect(markup).toContain("9.3 мс");
  });

  it("shows the step cost in tenths, where the whole signal is", () => {
    expect(render()).toContain("0.14 мс");
  });

  it("shows both directions of traffic and the session totals", () => {
    const markup = render();

    expect(markup).toContain("5.0 КБ");
    expect(markup).toContain("640 Б");
    expect(markup).toContain("50.0 КБ");
  });

  it("reports what the patches cost the thread, per second and at their worst", () => {
    const markup = render();

    expect(markup).toContain("160 мс/с");
    expect(markup).toContain("20 патч/с");
    expect(markup).toContain("11.4 мс");
  });

  it("reports what React spends committing, from its own profiler", () => {
    const markup = render();

    expect(markup).toContain("320 мс/с");
    expect(markup).toContain("16 коммит/с");
    expect(markup).toContain("26.5 мс");
  });

  it("says the counter never attached rather than showing a zero", () => {
    const markup = render({ traffic: undefined });

    expect(markup).toContain("счётчик не зацепился");
    expect(markup).not.toContain("0 Б");
  });

  it("names the state of the prediction toggle", () => {
    expect(render({ predictionEnabled: true })).toContain('data-prediction="on"');
    expect(render({ predictionEnabled: false })).toContain('data-prediction="off"');
  });

  it("names the state of the background toggle", () => {
    expect(render({ backgroundEnabled: true })).toContain('data-background="on"');
    expect(render({ backgroundEnabled: false })).toContain('data-background="off"');
  });

  it("names the state of the vectors toggle", () => {
    expect(render({ vectorsEnabled: true })).toContain('data-vectors="on"');
    expect(render({ vectorsEnabled: false })).toContain('data-vectors="off"');
  });

  it("names the state of the glow toggle", () => {
    expect(render({ glowEnabled: true })).toContain('data-glow="on"');
    expect(render({ glowEnabled: false })).toContain('data-glow="off"');
  });
});

describe("diagnostics formatting", () => {
  it("switches to kilobytes only once there are kilobytes", () => {
    expect(formatBytes(0)).toBe("0 Б");
    expect(formatBytes(1023)).toBe("1023 Б");
    expect(formatBytes(1024)).toBe("1.0 КБ");
  });

  it("refuses to invent a number it does not have", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatStepMs(0)).toBe("—");
    expect(formatPing(null)).toBe("—");
    expect(formatPing(-1)).toBe("—");
  });
});
