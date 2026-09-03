import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MaintenanceNotice, MAINTENANCE_COMBAT_NOTICE_SECONDS } from "./index.js";

describe("MaintenanceNotice", () => {
  it("says nothing when no window is announced", () => {
    const markup = renderToStaticMarkup(
      <MaintenanceNotice active={false} secondsRemaining={0} inCombat={false} />
    );
    expect(markup).toBe("");
  });

  it("shows the countdown where the player is deciding something", () => {
    const markup = renderToStaticMarkup(
      <MaintenanceNotice active secondsRemaining={1_800} inCombat={false} />
    );
    expect(markup).toContain("Технические работы через 30 мин");
    expect(markup).toContain('data-testid="maintenance-notice"');
  });

  it("keeps the panel clean in a fight while there is still time", () => {
    // Nothing a pilot can do about maintenance mid-wave, and the attention the
    // banner costs belongs to the stick.
    const markup = renderToStaticMarkup(
      <MaintenanceNotice
        active
        secondsRemaining={MAINTENANCE_COMBAT_NOTICE_SECONDS + 60}
        inCombat
      />
    );
    expect(markup).toBe("");
  });

  it("speaks up in a fight once the window is close", () => {
    const markup = renderToStaticMarkup(
      <MaintenanceNotice active secondsRemaining={120} inCombat />
    );
    expect(markup).toContain("Технические работы через 2 мин");
  });
});
