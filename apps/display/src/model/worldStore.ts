import { useCallback, useRef, useSyncExternalStore } from "react";

import type { DisplayRoomView } from "@spaceship-defender/protocol";

/**
 * The world, held outside React.
 *
 * Measured against the reference stand on the same throttled machine, the
 * difference was never how much React we run - it runs four times more of it
 * and drops nothing. The difference is the shape: it hands a small snapshot to
 * leaf panels two hundred times a second at a millisecond each, while a patch
 * here put a fresh object into state and rebuilt the whole tree ten times a
 * second in commits of up to nine milliseconds. A commit that long does not fit
 * in a frame, and a frame that does not fit is the judder.
 *
 * So the snapshot stops being state. It lives here, a patch replaces it and
 * bumps a version, and every panel subscribes to the one slice it draws. A
 * patch that only moved enemies now wakes nobody: each subscriber compares its
 * own slice and stays as it is.
 *
 * `version` is what makes the comparison possible at all - the view object is
 * replaced wholesale on every patch, so its identity says nothing, and without
 * a counter each subscriber would have to re-select on every render instead of
 * only when something actually arrived.
 */

let current: DisplayRoomView | undefined;
let version = 0;
const listeners = new Set<() => void>();

/** The patch path calls this; nothing else should. */
export function publishWorld(next: DisplayRoomView | undefined): void {
  current = next;
  version += 1;
  for (const listener of listeners) listener();
}

/** For readers outside React - the scene, the bot bridge, the instruments. */
export function readWorld(): DisplayRoomView | undefined {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The remembering half of a subscription, on its own so it can be tested.
 *
 * There is no DOM in this package's tests - components are rendered to static
 * markup - so a hook cannot be exercised here at all. The part worth testing is
 * this one anyway: whether a patch that did not move the slice returns the very
 * same value, and whether the selector runs once per patch rather than once per
 * render.
 */
export interface SliceCache<T> {
  read(view: DisplayRoomView | undefined, atVersion: number): T;
}

export function createSliceCache<T>(
  select: (view: DisplayRoomView | undefined) => T,
  isEqual: (left: T, right: T) => boolean = Object.is
): SliceCache<T> {
  let held: { version: number; value: T } | undefined;
  return {
    read(view, atVersion) {
      if (held?.version === atVersion) return held.value;
      const next = select(view);
      if (held !== undefined && isEqual(held.value, next)) {
        // Same slice, new patch: keep the old value so React sees no change,
        // and remember the version so the selector is not run again for it.
        held = { version: atVersion, value: held.value };
        return held.value;
      }
      held = { version: atVersion, value: next };
      return next;
    }
  };
}

/**
 * One slice of the world, and a render only when that slice changes.
 *
 * `select` runs at most once per publish per subscriber, and its result is
 * compared with `isEqual` - so a selector that builds a fresh object still
 * needs an equality that looks inside it, or the panel commits on every patch
 * and this whole exercise buys nothing. For a plain number or string the
 * default identity check is right.
 *
 * The cache is keyed by `version` rather than by the view's identity for the
 * same reason the counter exists: two different objects can carry the same
 * numbers, and re-selecting on every render of an unrelated parent is exactly
 * the cost being removed.
 */
export function useWorldSlice<T>(
  select: (view: DisplayRoomView | undefined) => T,
  isEqual: (left: T, right: T) => boolean = Object.is
): T {
  const selectReference = useRef(select);
  selectReference.current = select;
  const equalReference = useRef(isEqual);
  equalReference.current = isEqual;
  const cache = useRef<SliceCache<T> | undefined>(undefined);
  cache.current ??= createSliceCache<T>(
    (view) => selectReference.current(view),
    (left, right) => equalReference.current(left, right)
  );

  const held = cache.current;
  const getSnapshot = useCallback((): T => held.read(current, version), [held]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Shallow, for selectors that gather a handful of fields into an object. */
export function sameFields<T extends Record<string, unknown>>(left: T, right: T): boolean {
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) {
    if (!Object.is(left[key], right[key])) return false;
  }
  return true;
}

/** A fresh page between runs; the store outlives any one connection. */
export function resetWorld(): void {
  publishWorld(undefined);
}
