import { describe, expect, it } from "vitest";

import { isDiagnosticsRequested } from "./diagnostics.js";

describe("isDiagnosticsRequested", () => {
  it("opens the panel only on an explicit request", () => {
    expect(isDiagnosticsRequested("?diag=1")).toBe(true);
    expect(isDiagnosticsRequested("?wave=5&diag=1")).toBe(true);
  });

  it("stays shut for everyone else", () => {
    expect(isDiagnosticsRequested("")).toBe(false);
    expect(isDiagnosticsRequested("?diag=0")).toBe(false);
    expect(isDiagnosticsRequested("?diag")).toBe(false);
    expect(isDiagnosticsRequested("?diagnostics=1")).toBe(false);
  });
});
