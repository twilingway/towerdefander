import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { describe, expect, it, vi } from "vitest";

import type { SpaceshipRuntime } from "./game/SpaceshipRuntime.js";
import {
  prepareRuntimeHydration,
  shouldPrepareRuntimeHydration,
  shouldUpdateRuntime
} from "./SpaceshipCanvas.js";

describe("SpaceshipCanvas", () => {
  it("does not restart Phaser interpolation for a telemetry-only patch", () => {
    expect(shouldUpdateRuntime(42, 42)).toBe(false);
    expect(shouldUpdateRuntime(42, 43)).toBe(true);
  });

  it("rehydrates exactly once even when reconnect keeps the defeated snapshot tick", () => {
    const prepareHydration = vi.fn();
    const update = vi.fn();
    const runtime: SpaceshipRuntime = {
      prepareHydration,
      update,
      destroy: vi.fn()
    };
    const snapshot = { tick: 42 } as DisplayGameSnapshot;

    expect(shouldUpdateRuntime(42, snapshot.tick)).toBe(false);
    prepareRuntimeHydration(runtime, snapshot);

    expect(prepareHydration).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(snapshot);
  });

  it("uses a new run as a hydration boundary even when its first tick repeats", () => {
    expect(shouldPrepareRuntimeHydration(1, 2, 0, 0)).toBe(true);
    expect(shouldPrepareRuntimeHydration(2, 2, 0, 0)).toBe(false);
    expect(shouldUpdateRuntime(0, 0)).toBe(false);
  });

  it("coalesces simultaneous reconnect and run changes into one hydration decision", () => {
    expect(shouldPrepareRuntimeHydration(1, 2, 4, 5)).toBe(true);
  });
});
