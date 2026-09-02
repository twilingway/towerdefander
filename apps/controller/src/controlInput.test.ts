import { describe, expect, it, vi } from "vitest";

import {
  AIM_COMMIT_SHARE,
  commitAim,
  getFireReleaseDelay,
  getKeyboardVector,
  getNextShieldDesiredActive,
  LatestInputScheduler,
  normalizeControlVector,
  PointerCycle
} from "./controlInput.js";

describe("aim commitment", () => {
  it("names a bearing only past the threshold", () => {
    // Half a stick is a nudge; the barrel keeps what it was given.
    expect(commitAim({ x: 0.5, y: 0 })).toBeNull();
    expect(commitAim({ x: 0, y: -0.59 })).toBeNull();
    expect(commitAim({ x: 0, y: -0.61 })).toEqual({ x: 0, y: -0.61 });
  });

  it("measures the push, not the axis", () => {
    // Two axes at 0.45 are 0.64 of a stick, which is a push.
    const diagonal = commitAim({ x: 0.45, y: 0.45 });
    expect(diagonal).not.toBeNull();
    expect(Math.hypot(diagonal?.x ?? 0, diagonal?.y ?? 0)).toBeGreaterThan(AIM_COMMIT_SHARE);
  });

  it("keeps a stick pushed to the rim at unit length", () => {
    const rim = commitAim({ x: 3, y: 4 });
    expect(Math.hypot(rim?.x ?? 0, rim?.y ?? 0)).toBeCloseTo(1, 12);
  });
});

describe("controller input", () => {
  it("normalizes diagonals and rejects non-finite components", () => {
    const diagonal = normalizeControlVector({ x: 1, y: 1 });
    expect(diagonal.x).toBeCloseTo(Math.SQRT1_2);
    expect(diagonal.y).toBeCloseTo(Math.SQRT1_2);
    expect(normalizeControlVector({ x: Number.NaN, y: Number.POSITIVE_INFINITY })).toEqual({
      x: 0,
      y: 0
    });
  });

  it("maps WASD and arrows to the same vector", () => {
    expect(getKeyboardVector(new Set(["KeyW", "KeyD"]))).toEqual(
      getKeyboardVector(new Set(["ArrowUp", "ArrowRight"]))
    );
  });

  it("keeps a short fire click alive through the next send slot", () => {
    expect(getFireReleaseDelay(100, 110)).toBe(50);
    expect(getFireReleaseDelay(100, 170)).toBe(0);
    expect(getFireReleaseDelay(undefined, 170)).toBe(0);
  });

  it("toggles the latest shield intent and blocks ON at zero energy", () => {
    expect(getNextShieldDesiredActive(false, 100)).toBe(true);
    expect(getNextShieldDesiredActive(true, 100)).toBe(false);
    expect(getNextShieldDesiredActive(false, 0)).toBe(false);
  });

  it("lets the stick and action zone own independent pointer ids", () => {
    const stick = new PointerCycle();
    const action = new PointerCycle();

    expect(stick.claim(1, 0)).toBe(true);
    expect(action.claim(2, 0)).toBe(true);
    expect(stick.owns(1)).toBe(true);
    expect(action.owns(2)).toBe(true);
    expect(action.complete(2)).toBe(true);
    expect(stick.owns(1)).toBe(true);
  });

  it("ignores foreign pointers and safely cancels only the owned cycle", () => {
    const cycle = new PointerCycle();

    expect(cycle.claim(7, 0)).toBe(true);
    expect(cycle.claim(8, 0)).toBe(false);
    expect(cycle.complete(8)).toBe(false);
    expect(cycle.cancel(8)).toBe(false);
    expect(cycle.owns(7)).toBe(true);
    expect(cycle.cancel(7)).toBe(true);
    expect(cycle.current()).toBeUndefined();
  });

  it("rejects non-primary mouse buttons without relying on touch isPrimary", () => {
    const cycle = new PointerCycle();

    expect(cycle.claim(2, 1)).toBe(false);
    expect(cycle.claim(2, 0)).toBe(true);
  });

  it("coalesces pointer flood and prioritizes latest release", () => {
    const send = vi.fn();
    const scheduler = new LatestInputScheduler({ x: 0, y: 0 }, send);
    scheduler.update({ x: 1, y: 0 }, 0);
    scheduler.update({ x: 0.5, y: 0 }, 10);
    scheduler.update({ x: 0, y: 0 }, 20);
    scheduler.flush(49);
    expect(send).toHaveBeenCalledTimes(1);
    scheduler.flush(50);
    expect(send).toHaveBeenLastCalledWith({ sequence: 2, value: { x: 0, y: 0 } });
  });

  it("heartbeats only after 100 ms without another send", () => {
    const send = vi.fn();
    const scheduler = new LatestInputScheduler({ active: false }, send);
    scheduler.flush(0);
    scheduler.flush(99);
    expect(send).toHaveBeenCalledTimes(1);
    scheduler.flush(100);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh sequence generation after reconnect", () => {
    const send = vi.fn();
    const scheduler = new LatestInputScheduler({ x: 0 }, send);
    scheduler.update({ x: 1 }, 0);
    scheduler.update({ x: 0 }, 50);
    scheduler.setEnabled(false);
    scheduler.startGeneration({ x: -1 }, 60);
    expect(send).toHaveBeenLastCalledWith({ sequence: 1, value: { x: -1 } });
  });

  it("does not send while reconnecting and starts the next generation at sequence one", () => {
    const send = vi.fn();
    const scheduler = new LatestInputScheduler({ x: 0 }, send);
    scheduler.update({ x: 1 }, 0);
    scheduler.setEnabled(false);
    scheduler.update({ x: -1 }, 50);
    scheduler.flush(200);
    expect(send).toHaveBeenCalledTimes(1);

    scheduler.startGeneration({ x: 0 }, 201);
    expect(send).toHaveBeenLastCalledWith({ sequence: 1, value: { x: 0 } });
  });

  it("pauses between waves and resumes without resetting the continuous sequence", () => {
    const send = vi.fn();
    const scheduler = new LatestInputScheduler({ x: 0 }, send);
    scheduler.update({ x: 1 }, 0);
    scheduler.setEnabled(false);
    scheduler.update({ x: -1 }, 50);
    scheduler.flush(200);
    scheduler.resumeWith({ x: 0 }, 201);
    expect(send).toHaveBeenLastCalledWith({ sequence: 2, value: { x: 0 } });
  });

  it("can hydrate a paused reconnect generation without sending an invalid phase input", () => {
    const send = vi.fn();
    const scheduler = new LatestInputScheduler({ x: 0 }, send);
    scheduler.resetGeneration({ x: 0 }, 100, false);
    expect(send).not.toHaveBeenCalled();
    scheduler.resumeWith({ x: 0 }, 200);
    expect(send).toHaveBeenCalledWith({ sequence: 1, value: { x: 0 } });
  });
});
