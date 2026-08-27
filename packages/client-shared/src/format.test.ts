import { describe, expect, it } from "vitest";

import { readStringEnvironment } from "./environment.js";
import { formatLatency, roleLabel } from "./format.js";

describe("formatLatency", () => {
  it("renders a measured round trip in milliseconds", () => {
    expect(formatLatency(42)).toBe("42 мс");
  });

  it("falls back to a dash while no probe has answered", () => {
    expect(formatLatency(null)).toBe("—");
    expect(formatLatency(undefined)).toBe("—");
  });
});

describe("roleLabel", () => {
  it("names all three crew roles", () => {
    expect([roleLabel("pilot"), roleLabel("gunner"), roleLabel("shield")]).toEqual([
      "Пилот",
      "Наводчик",
      "Оператор щита"
    ]);
  });
});

describe("readStringEnvironment", () => {
  it("keeps a configured value", () => {
    expect(readStringEnvironment("ws://example:2567", "fallback")).toBe("ws://example:2567");
  });

  it("falls back for a missing or empty value", () => {
    expect(readStringEnvironment(undefined, "fallback")).toBe("fallback");
    expect(readStringEnvironment("", "fallback")).toBe("fallback");
  });
});
