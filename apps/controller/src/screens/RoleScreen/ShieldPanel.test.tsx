import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShieldPanel } from "./ShieldPanel.js";

function markup(shield: { active: boolean; rearmRequired: boolean; energy: number }): string {
  return renderToStaticMarkup(
    <ShieldPanel
      shield={{ angle: 0, arcHalfAngle: 0.8, capacity: 100, ...shield }}
      controlsEnabled
      generation="run-1"
      onToggle={() => undefined}
    />
  );
}

describe("shield panel", () => {
  it("offers the shield when the battery is behind it", () => {
    const ready = markup({ active: false, rearmRequired: false, energy: 60 });
    expect(ready).toContain("ВКЛЮЧИТЬ ЩИТ");
    expect(ready).not.toContain("disabled");
  });

  it("locks the button while a drained shield wins its charge back", () => {
    // The whole point of the lockout being visible: the old rule let the
    // operator press a button that silently did nothing.
    const locked = markup({ active: false, rearmRequired: true, energy: 12 });
    expect(locked).toContain("ЩИТ ВОССТАНАВЛИВАЕТСЯ");
    expect(locked).toContain("disabled");
  });

  it("leaves a shield that is already up under the operator's hand", () => {
    // Draining sets the lock on the same tick the shield drops, and a shield
    // still holding must never become unswitchable.
    const holding = markup({ active: true, rearmRequired: true, energy: 4 });
    expect(holding).toContain("ВЫКЛЮЧИТЬ ЩИТ");
    expect(holding).not.toContain("disabled");
  });
});
