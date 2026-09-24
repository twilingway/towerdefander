import { afterEach, describe, expect, it, vi } from "vitest";

describe("the waiting build", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("is offered once a worker is waiting, and switched to only on the player's word", async () => {
    const store = await import("./appUpdate.js");
    const heard = vi.fn();
    store.subscribeToAppUpdate(heard);
    expect(store.appUpdateAvailable()).toBe(false);

    const switchToIt = vi.fn();
    store.offerAppUpdate(switchToIt);
    expect(store.appUpdateAvailable()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(switchToIt).not.toHaveBeenCalled();

    store.applyAppUpdate();
    expect(switchToIt).toHaveBeenCalledTimes(1);
  });

  it("reads the reset flag from the address and nothing else", async () => {
    const { serviceWorkerSwitchedOff } = await import("./appUpdate.js");
    expect(serviceWorkerSwitchedOff("?sw=off")).toBe(true);
    expect(serviceWorkerSwitchedOff("?diag=1&sw=off")).toBe(true);
    expect(serviceWorkerSwitchedOff("?sw=on")).toBe(false);
    expect(serviceWorkerSwitchedOff("")).toBe(false);
  });
});
