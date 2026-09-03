import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MaintenanceNotice } from "./index.js";

describe("MaintenanceNotice", () => {
  it("says nothing when no window is announced", () => {
    expect(renderToStaticMarkup(<MaintenanceNotice active={false} secondsRemaining={0} />)).toBe(
      ""
    );
  });

  it("shows the countdown, in every phase, because the crew decides here", () => {
    const markup = renderToStaticMarkup(<MaintenanceNotice active secondsRemaining={3_600} />);
    expect(markup).toContain("Технические работы через 60 мин");
  });

  it("says the window is open once the countdown has run out", () => {
    const markup = renderToStaticMarkup(<MaintenanceNotice active secondsRemaining={0} />);
    expect(markup).toContain("Технические работы начинаются");
    expect(markup).toContain("текущий можно доиграть");
  });
});
