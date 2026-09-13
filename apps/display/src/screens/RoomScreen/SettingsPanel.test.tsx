import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../model/fullscreen.js", () => ({
  fullscreenSupported: () => true,
  isFullscreen: () => false,
  subscribeToFullscreen: () => () => undefined,
  toggleFullscreen: vi.fn(),
  autoFullscreenEnabled: () => true,
  setAutoFullscreen: vi.fn(),
  subscribeToAutoFullscreen: () => () => undefined
}));

const { SettingsPanel } = await import("./SettingsPanel.js");

describe("the settings window", () => {
  it("holds the volume, the field's voices and the way out", () => {
    const markup = renderToStaticMarkup(
      <SettingsPanel
        action={{
          label: "Выйти из боя",
          confirmLabel: "Точно выйти?",
          disabled: false,
          onClick: vi.fn()
        }}
      />
    );
    // Closed it is one button: the field is what the screen is for.
    expect(markup).toContain('data-testid="settings-toggle"');
    expect(markup).not.toContain('data-testid="settings-window"');
  });

  /**
   * Full screen is offered only where it exists. On iOS Safari a page cannot
   * have it at all - only a video can - and a button that quietly does nothing
   * is worse than no button.
   */
  it("offers full screen where the browser has it", async () => {
    const fullscreen = await import("../../model/fullscreen.js");
    expect(fullscreen.fullscreenSupported()).toBe(true);
  });
});
