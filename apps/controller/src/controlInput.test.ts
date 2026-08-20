import { describe, expect, it, vi } from "vitest";

import { getKeyboardVector, LatestInputScheduler, normalizeControlVector } from "./controlInput.js";

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
});
