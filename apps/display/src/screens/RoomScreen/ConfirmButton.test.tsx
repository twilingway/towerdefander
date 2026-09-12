import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ConfirmButton } from "./ConfirmButton.js";

describe("a destructive button", () => {
  /**
   * It asks in the game rather than through the browser's own dialog, which
   * pins the page, is dressed by the operating system and on a phone drops the
   * page out of full screen to show itself.
   */
  it("starts unarmed, showing what it does rather than the question", () => {
    const markup = renderToStaticMarkup(
      <ConfirmButton
        className="settings__leave"
        testId="settings-leave"
        disabled={false}
        label="Закрыть комнату"
        confirmLabel="Закрыть для всех?"
        onConfirm={vi.fn()}
      />
    );

    expect(markup).toContain("Закрыть комнату");
    expect(markup).not.toContain("Закрыть для всех?");
    expect(markup).toContain('data-armed="false"');
  });
});
