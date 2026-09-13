import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScanFrame } from "./ScanFrame.js";

describe("ScanFrame", () => {
  it("shows the wait while the sweep cools, and cannot be pressed", () => {
    const markup = renderToStaticMarkup(
      <ScanFrame readySeconds={18} revealSecondsRemaining={0} onScan={() => undefined} />
    );

    expect(markup).toContain('data-testid="arena-scan"');
    expect(markup).toContain("disabled");
    expect(markup).toContain("18 с");
  });

  it("says it is ready once the wait is over", () => {
    const markup = renderToStaticMarkup(
      <ScanFrame readySeconds={0} revealSecondsRemaining={0} onScan={() => undefined} />
    );

    expect(markup).toContain("готов");
    expect(markup).not.toContain("disabled");
  });
});
