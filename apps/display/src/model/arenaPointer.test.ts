import { describe, expect, it } from "vitest";

import { ARENA_HOST_SELECTOR, isArenaTarget, readArenaCentre } from "./arenaPointer.js";

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

describe("the arena host", () => {
  /**
   * It named the readable twin of the world for a long time - a sibling of the
   * canvas, not its parent - so no pointer event was ever judged to be on the
   * battlefield: the turret did not follow the mouse and the left button did
   * not fire, while the keyboard worked perfectly.
   */
  it("is the element the world is drawn in", () => {
    expect(ARENA_HOST_SELECTOR).toBe(".battlefield-canvas");
  });
});

describe("readArenaCentre", () => {
  /** A document the way a release build renders it: the canvas host, and no readable twin. */
  function releaseDocument(box: { left: number; top: number; width: number; height: number }) {
    return {
      querySelector: (selector: string) =>
        selector === ".battlefield-canvas" ? { getBoundingClientRect: () => box } : null
    };
  }

  /**
   * The centre was read off `.battlefield-shell`, which only a dev build and the
   * demo render. In production it came back empty, and the turret ignored the
   * mouse while both buttons still fired.
   */
  it("finds the ship's middle in a release build, which has no readable twin", () => {
    const centre = readArenaCentre(releaseDocument({ left: 10, top: 20, width: 800, height: 600 }));

    expect(centre).toEqual({ x: 410, y: 320 });
  });

  it("reads nothing before the arena is on the page", () => {
    expect(readArenaCentre({ querySelector: () => null })).toBeNull();
  });
});
