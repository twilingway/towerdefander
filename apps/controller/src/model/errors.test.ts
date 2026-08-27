import { describe, expect, it } from "vitest";

import { toServerError } from "./errors.js";

describe("toServerError", () => {
  it("explains rejection of a delayed command from an earlier run", () => {
    expect(toServerError("stale_run", "fallback")).toContain("завершённому бою");
  });
});
