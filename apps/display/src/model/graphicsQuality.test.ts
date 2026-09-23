import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These tests run without a DOM, so the storage is supplied, and the module is
 * loaded fresh for each one: it reads the saved choice once, lazily.
 */
function installStorage(): Map<string, string> {
  const entries = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    }
  };
  return entries;
}

describe("the graphics quality store", () => {
  let entries: Map<string, string>;

  beforeEach(() => {
    vi.resetModules();
    entries = installStorage();
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("starts automatic, and keeps what the player picks on the device", async () => {
    const store = await import("./graphicsQuality.js");
    expect(store.qualityChoice()).toBe("auto");
    const heard = vi.fn();
    store.subscribeToQuality(heard);
    store.setQualityChoice("low");
    expect(store.qualityChoice()).toBe("low");
    expect(entries.get("spaceship-defender:quality")).toBe("low");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("reads a saved choice back on the next page", async () => {
    entries.set("spaceship-defender:quality", "mid");
    const store = await import("./graphicsQuality.js");
    expect(store.qualityChoice()).toBe("mid");
  });

  it("announces the level in force only when it changes", async () => {
    const store = await import("./graphicsQuality.js");
    const heard = vi.fn();
    store.subscribeToQuality(heard);
    store.setActiveQuality("high");
    store.setActiveQuality("high");
    store.setActiveQuality("mid");
    expect(store.activeQuality()).toBe("mid");
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
