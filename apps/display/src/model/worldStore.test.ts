import { describe, expect, it, vi } from "vitest";

import type { DisplayRoomView } from "@spaceship-defender/protocol";
import { createSliceCache, publishWorld, readWorld, resetWorld, sameFields } from "./worldStore.js";

/**
 * The point of the store is what does NOT happen: a patch that only moved
 * enemies must leave the panel showing the score exactly as it was. So these
 * assert identity of the returned slice and the number of selector calls - a
 * store that returns the right number and re-selects anyway would pass a value
 * test and fail the reason it exists.
 */

function viewWith(score: number, enemyX: number): DisplayRoomView {
  // Only the two fields under test are real; these selectors read nothing else,
  // and a full fixture would hide which field moved.
  return {
    game: { encounter: { score }, enemyShips: [{ x: enemyX }] }
  } as unknown as DisplayRoomView;
}

const scoreOf = (view: DisplayRoomView | undefined): number => view?.game?.encounter.score ?? 0;

describe("the world store", () => {
  it("hands the published view to a reader outside React", () => {
    const view = viewWith(10, 0);
    publishWorld(view);
    expect(readWorld()).toBe(view);
    resetWorld();
    expect(readWorld()).toBeUndefined();
  });

  it("returns the same slice when a patch did not move it", () => {
    const cache = createSliceCache(scoreOf);
    expect(cache.read(viewWith(10, 0), 1)).toBe(10);
    expect(cache.read(viewWith(10, 400), 2)).toBe(10);
  });

  it("returns the new slice when it did move", () => {
    const cache = createSliceCache(scoreOf);
    expect(cache.read(viewWith(10, 0), 1)).toBe(10);
    expect(cache.read(viewWith(11, 0), 2)).toBe(11);
  });

  it("selects once per patch, however many reads follow", () => {
    const select = vi.fn(scoreOf);
    const cache = createSliceCache(select);
    const view = viewWith(10, 0);
    cache.read(view, 1);
    cache.read(view, 1);
    cache.read(view, 1);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous object when a gathering selector rebuilds an equal one", () => {
    const cache = createSliceCache(
      (view: DisplayRoomView | undefined) => ({ score: scoreOf(view) }),
      sameFields
    );
    const first = cache.read(viewWith(10, 0), 1);
    const second = cache.read(viewWith(10, 900), 2);
    // Identity, not equality: React compares by identity, so a new object with
    // the same fields is a re-render even though nothing on screen changed.
    expect(second).toBe(first);
  });

  it("sees through to a changed field of a gathered slice", () => {
    const cache = createSliceCache(
      (view: DisplayRoomView | undefined) => ({ score: scoreOf(view) }),
      sameFields
    );
    const first = cache.read(viewWith(10, 0), 1);
    const second = cache.read(viewWith(12, 0), 2);
    expect(second).not.toBe(first);
    expect(second.score).toBe(12);
  });
});
