import { describe, expect, it } from "vitest";

import { ARENA_HOST_SELECTOR, isArenaTarget } from "./arenaPointer.js";

/** Stands in for an element that knows which ancestors it has. */
function target(...ancestors: string[]) {
  return {
    closest: (selector: string) => (ancestors.includes(selector) ? { selector } : null)
  };
}

describe("isArenaTarget", () => {
  it("lets a pointer on the world command the ship", () => {
    expect(isArenaTarget(target(ARENA_HOST_SELECTOR))).toBe(true);
  });

  it("refuses a pointer that landed on the cockpit overlay", () => {
    // The overlay is a sibling of the arena host, so a stick has no arena
    // ancestor at all - which is exactly what used to fire the cannon.
    expect(isArenaTarget(target(".solo-cockpit"))).toBe(false);
  });

  it("refuses a pointer on a panel or a button", () => {
    expect(isArenaTarget(target(".diagnostics-panel"))).toBe(false);
    expect(isArenaTarget(target())).toBe(false);
  });

  it("refuses anything that is not an element", () => {
    expect(isArenaTarget(null)).toBe(false);
    expect(isArenaTarget(undefined)).toBe(false);
    expect(isArenaTarget({})).toBe(false);
  });
});
