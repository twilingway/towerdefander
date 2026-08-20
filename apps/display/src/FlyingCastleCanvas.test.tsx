import { describe, expect, it } from "vitest";

import { shouldUpdateRuntime } from "./FlyingCastleCanvas.js";

describe("FlyingCastleCanvas", () => {
  it("does not restart Phaser interpolation for a telemetry-only patch", () => {
    expect(shouldUpdateRuntime(42, 42)).toBe(false);
    expect(shouldUpdateRuntime(42, 43)).toBe(true);
  });
});
