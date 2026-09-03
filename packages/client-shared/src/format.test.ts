import { describe, expect, it } from "vitest";

import { readStringEnvironment } from "./environment.js";
import { formatLatency, formatMaintenanceCountdown, roleLabel } from "./format.js";

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

describe("formatMaintenanceCountdown", () => {
  it("rounds up so a crew is never told less time than it has", () => {
    expect(formatMaintenanceCountdown(3_600)).toContain("60 мин");
    expect(formatMaintenanceCountdown(61)).toContain("2 мин");
  });

  it("drops to words under a minute rather than showing '1 мин'", () => {
    expect(formatMaintenanceCountdown(45)).toContain("меньше чем через минуту");
  });

  it("reads as open, not as expired, at zero", () => {
    // The server keeps the flag after the countdown ends; a run in progress is
    // still allowed to finish, and the wording has to say so.
    expect(formatMaintenanceCountdown(0)).toContain("можно доиграть");
  });
});
