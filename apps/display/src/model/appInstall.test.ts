import { afterEach, describe, expect, it, vi } from "vitest";

describe("the install offer", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("keeps the browser's offer for a press, and spends it once", async () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const store = await import("./appInstall.js");
    store.watchInstallOffer();
    expect(store.installOffered()).toBe(false);

    const prompt = vi.fn(() => Promise.resolve({ outcome: "accepted" as const }));
    const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt });
    target.dispatchEvent(offer);
    // Held rather than shown by the browser.
    expect(offer.defaultPrevented).toBe(true);
    expect(store.installOffered()).toBe(true);

    await store.installApp();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(store.installOffered()).toBe(false);
    await store.installApp();
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("forgets the offer once the game is installed", async () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const store = await import("./appInstall.js");
    store.watchInstallOffer();
    target.dispatchEvent(
      Object.assign(new Event("beforeinstallprompt"), { prompt: () => Promise.resolve() })
    );
    target.dispatchEvent(new Event("appinstalled"));
    expect(store.installOffered()).toBe(false);
  });
});
