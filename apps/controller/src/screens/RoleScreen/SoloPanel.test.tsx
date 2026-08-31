import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SoloPanel } from "./SoloPanel.js";

const heat = { heat: 20, capacity: 100, overheated: false } as const;

function markup(layout: "stacked" | "triggers"): string {
  return renderToStaticMarkup(
    <SoloPanel
      cannon={heat}
      machineGun={heat}
      helm={undefined}
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

  it("names the current layout on the toggle and the other one in its title", () => {
    expect(markup("stacked")).toContain(">Кнопки справа<");
    expect(markup("stacked")).toContain("Переключить на: Кнопки по верхнему краю");
    expect(markup("triggers")).toContain(">Кнопки по верхнему краю<");
    expect(markup("triggers")).toContain("Переключить на: Кнопки справа");
  });
});
