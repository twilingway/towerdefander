import { describe, expect, it, vi } from "vitest";

import { fullscreenLabel, toggleFullscreen, type FullscreenHost } from "./fullscreen.js";

function host(overrides: Partial<FullscreenHost> = {}): FullscreenHost {
  return {
    isFullscreen: () => false,
    enter: () => Promise.resolve(),
    leave: () => Promise.resolve(),
    subscribe: () => () => undefined,
    ...overrides
  };
}

describe("fullscreen", () => {
  it("says what pressing it will do, not where the window is", () => {
    expect(fullscreenLabel(false)).toBe("Развернуть на весь экран");
    expect(fullscreenLabel(true)).toBe("Свернуть из полного экрана");
  });

  it("switches whichever way the window is", async () => {
    const enter = vi.fn(() => Promise.resolve());
    const leave = vi.fn(() => Promise.resolve());
    await toggleFullscreen(host({ enter, leave }));
    expect(enter).toHaveBeenCalledTimes(1);
    expect(leave).not.toHaveBeenCalled();

    await toggleFullscreen(host({ isFullscreen: () => true, enter, leave }));
    expect(leave).toHaveBeenCalledTimes(1);
    expect(enter).toHaveBeenCalledTimes(1);
  });

  it("swallows a refusal, because the player can do nothing about it", async () => {
    // Browsers reject the request outside a user gesture, and a rejected promise
    // here would surface as an unhandled error on a display nobody is watching.
    await expect(
      toggleFullscreen(
        host({
          enter: () => Promise.reject(new Error("gesture required"))
        })
      )
    ).resolves.toBeUndefined();
  });
});
