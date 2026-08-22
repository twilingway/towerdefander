import type { DisplayGameSnapshot } from "@town-defenders/protocol";
import { describe, expect, it, vi } from "vitest";

import type { FlyingCastleRuntime } from "./game/FlyingCastleRuntime.js";
import { prepareRuntimeHydration, shouldUpdateRuntime } from "./FlyingCastleCanvas.js";

describe("FlyingCastleCanvas", () => {
  it("does not restart Phaser interpolation for a telemetry-only patch", () => {
    expect(shouldUpdateRuntime(42, 42)).toBe(false);
    expect(shouldUpdateRuntime(42, 43)).toBe(true);
  });

  it("rehydrates exactly once even when reconnect keeps the defeated snapshot tick", () => {
    const prepareHydration = vi.fn();
    const update = vi.fn();
    const runtime: FlyingCastleRuntime = {
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
});
