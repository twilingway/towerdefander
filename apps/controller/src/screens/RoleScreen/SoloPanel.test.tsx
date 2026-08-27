import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SoloPanel } from "./SoloPanel.js";

const heat = { heat: 20, capacity: 100, overheated: false } as const;

function markup(layout: "stacked" | "triggers"): string {
  return renderToStaticMarkup(
    <SoloPanel
      cannon={heat}
      machineGun={heat}
      heading={0}
      encounterPhase="combat"
      connectionDisabled={false}
      generation="run-1"
      layout={layout}
      onLayoutChange={() => undefined}
      onSend={() => undefined}
    />
  );
}

describe("SoloPanel", () => {
  it("carries both sticks, both triggers and both heat meters", () => {
    const html = markup("stacked");

    expect(html).toContain('data-testid="solo-panel"');
    expect(html).toContain("solo-panel--stacked");
    expect(html.match(/data-testid="virtual-stick"/g)).toHaveLength(2);
    expect(html).toContain('data-testid="mg-fire-button"');
    expect(html).toContain('data-testid="fire-button"');
    expect(html).toContain('data-testid="solo-mg-heat"');
    expect(html).toContain('data-testid="solo-cannon-heat"');
  });

  it("renders the trigger layout from the same controls", () => {
    const html = markup("triggers");

    expect(html).toContain("solo-panel--triggers");
    expect(html.match(/data-testid="virtual-stick"/g)).toHaveLength(2);
    expect(html).toContain('data-testid="mg-fire-button"');
    expect(html).toContain('data-testid="fire-button"');
  });

  it("offers the other layout on the toggle", () => {
    expect(markup("stacked")).toContain("Кнопки по верхнему краю");
    expect(markup("triggers")).toContain("Кнопки над стиками");
  });
});
