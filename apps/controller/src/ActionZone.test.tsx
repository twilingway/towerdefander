import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActionZone } from "./ActionZone.js";

describe("ActionZone", () => {
  it("renders a circular hold zone with independent pointer feedback", () => {
    const markup = renderToStaticMarkup(
      <ActionZone
        label="ОГОНЬ"
        testId="fire-button"
        className="hold-action--gunner"
        disabled={false}
        mode="hold"
        resetKey="run-1"
      />
    );

    expect(markup).toContain("action-zone");
    expect(markup).toContain('data-testid="fire-button"');
    expect(markup).toContain('data-pressed="false"');
    expect(markup).toContain("ОГОНЬ");
  });

  it("exposes the durable shield state as a toggle", () => {
    const markup = renderToStaticMarkup(
      <ActionZone
        label="ВЫКЛЮЧИТЬ ЩИТ"
        testId="shield-button"
        className="hold-action--shield"
        disabled={false}
        mode="toggle"
        active
        resetKey="run-1"
      />
    );

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("ВЫКЛЮЧИТЬ ЩИТ");
  });
});
