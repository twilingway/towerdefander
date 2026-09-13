import { describe, expect, it } from "vitest";

import {
  STATUS_BARS,
  STATUS_FRAME_HEIGHT,
  STATUS_FRAME_WIDTH,
  litSegments,
  readStatusLit,
  sameStatusLit
} from "./statusFrame.js";

type Reading = Parameters<typeof readStatusLit>[0];

function reading(overrides: Record<string, unknown> = {}): Reading {
  return {
    cannon: { heat: 0, capacity: 100, overheated: false },
    machineGun: { heat: 0, capacity: 100, overheated: false },
    spaceship: { hp: 1300, maxHp: 1300 },
    shield: { energy: 100, capacity: 100 },
    ...overrides
  } as unknown as Reading;
}

describe("status frame cells", () => {
  it("lights nothing on a cold cannon", () => {
    expect(readStatusLit(reading())[0]).toBe(0);
  });

  it("lights five of ten on a hull at half", () => {
    expect(readStatusLit(reading({ spaceship: { hp: 650, maxHp: 1300 } }))[1]).toBe(5);
  });

  it("lights all eleven on a cannon at capacity", () => {
    const hot = reading({ cannon: { heat: 100, capacity: 100, overheated: true } });
    expect(readStatusLit(hot)[0]).toBe(11);
  });

  it("clamps past capacity and survives a capacity of nothing", () => {
    expect(litSegments(150, 100, 10)).toBe(10);
    expect(litSegments(-5, 100, 10)).toBe(0);
    expect(litSegments(5, 0, 10)).toBe(0);
    expect(litSegments(Number.NaN, 100, 10)).toBe(0);
  });

  it("treats heat inside one cell as the same drawing", () => {
    const at = (heat: number) =>
      readStatusLit(reading({ machineGun: { heat, capacity: 100, overheated: false } }));
    // Ten cells: 41 and 44 both round to four, 46 is the fifth.
    expect(sameStatusLit(at(41), at(44))).toBe(true);
    expect(sameStatusLit(at(41), at(46))).toBe(false);
  });

  it("keeps every painted cell inside the picture", () => {
    expect(STATUS_BARS.map((bar) => bar.cells)).toEqual([11, 10, 10, 10]);
    for (const bar of STATUS_BARS) {
      expect(bar.x + (bar.cells - 1) * bar.pitch + bar.width, bar.key).toBeLessThanOrEqual(
        STATUS_FRAME_WIDTH
      );
      expect(bar.y + bar.height, bar.key).toBeLessThanOrEqual(STATUS_FRAME_HEIGHT);
    }
  });
});
