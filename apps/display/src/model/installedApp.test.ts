import { afterEach, describe, expect, it, vi } from "vitest";

describe("the system back in the installed app", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("does nothing where the browser has no CloseWatcher", async () => {
    vi.stubGlobal("CloseWatcher", undefined);
    const { watchBack } = await import("./installedApp.js");
    const onBack = vi.fn();
    const stop = watchBack(onBack);
    stop();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("catches every back, re-arming after each, until stopped", async () => {
    const made: { onclose: (() => void) | null; destroyed: boolean }[] = [];
    vi.stubGlobal(
      "CloseWatcher",
      class {
        onclose: (() => void) | null = null;
        destroyed = false;
        constructor() {
          made.push(this);
        }
        destroy() {
          this.destroyed = true;
        }
      }
    );
    const { watchBack } = await import("./installedApp.js");
    const onBack = vi.fn();
    const stop = watchBack(onBack);
    made.at(-1)?.onclose?.();
    made.at(-1)?.onclose?.();
    expect(onBack).toHaveBeenCalledTimes(2);
    expect(made).toHaveLength(3);
    stop();
    expect(made.at(-1)?.destroyed).toBe(true);
  });
});
