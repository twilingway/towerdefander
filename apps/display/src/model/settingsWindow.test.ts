import { afterEach, describe, expect, it, vi } from "vitest";

describe("the settings window", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("is closed at first, and announces only real changes", async () => {
    const store = await import("./settingsWindow.js");
    const heard = vi.fn();
    store.subscribeToSettingsWindow(heard);
    expect(store.settingsOpen()).toBe(false);
    store.setSettingsOpen(true);
    store.setSettingsOpen(true);
    expect(store.settingsOpen()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
