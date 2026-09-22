import { describe, expect, it } from "vitest";

import {
  armWaveDeadline,
  extendForSalvage,
  isWaveExpired,
  NO_WAVE_DEADLINE,
  waveSecondsRemaining
} from "./waveDeadline.ts";

const STEP_MS = 1000 / 60;

describe("waveDeadline", () => {
  it("counts a wave's life in ticks of the run", () => {
    const deadline = armWaveDeadline(0, 180, STEP_MS);

    expect(deadline.atTick).toBe(10_800);
    expect(waveSecondsRemaining(deadline, 0, STEP_MS)).toBe(180);
    expect(waveSecondsRemaining(deadline, 5_400, STEP_MS)).toBe(90);
    expect(isWaveExpired(deadline, 10_799)).toBe(false);
    expect(isWaveExpired(deadline, 10_800)).toBe(true);
  });

  /*
   * Zero means "no wave is being timed" to the display, so the last half second
   * has to round up rather than disappear.
   */
  it("never reports zero while a wave is still running", () => {
    const deadline = armWaveDeadline(0, 1, STEP_MS);

    expect(waveSecondsRemaining(deadline, 59, STEP_MS)).toBe(1);
    expect(waveSecondsRemaining(deadline, 60, STEP_MS)).toBe(0);
  });

  it("says nothing when no wave is being timed", () => {
    expect(waveSecondsRemaining(NO_WAVE_DEADLINE, 500, STEP_MS)).toBe(0);
    expect(isWaveExpired(NO_WAVE_DEADLINE, 10_000_000)).toBe(false);
  });

  it("holds the wave open for salvage, and never shortens it", () => {
    const deadline = armWaveDeadline(0, 10, STEP_MS);

    const extended = extendForSalvage(deadline, 500, 900, 60);
    expect(extended.atTick).toBe(1460);

    // Salvage that ends before the deadline leaves it where it was.
    const untouched = extendForSalvage(deadline, 100, 60, 60);
    expect(untouched.atTick).toBe(deadline.atTick);
  });
});
