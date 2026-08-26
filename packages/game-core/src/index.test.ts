import { describe, expect, it } from "vitest";

import { advanceClock, createSpaceshipSimulationConfig, createSeededRandom } from "./index.ts";

describe("deterministic game core primitives", () => {
  it("generates the same sequence for the same seed", () => {
    const first = createSeededRandom(42);
    const second = createSeededRandom(42);

    expect([first.next(), first.next(), first.next()]).toEqual([
      second.next(),
      second.next(),
      second.next()
    ]);
  });

  it("keeps a stable known sequence", () => {
    const random = createSeededRandom(42);

    expect([random.next(), random.next(), random.next()]).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099
    ]);
  });

  it("advances simulation time explicitly", () => {
    expect(advanceClock({ tick: 0, elapsedMs: 0 }, 50)).toEqual({
      tick: 1,
      elapsedMs: 50
    });
  });

  it("rejects invalid time steps", () => {
    expect(() => advanceClock({ tick: 0, elapsedMs: 0 }, 0)).toThrow(RangeError);
  });

  it("rejects invalid and overflowing clock state", () => {
    expect(() => advanceClock({ tick: -1, elapsedMs: 0 }, 50)).toThrow(RangeError);
    expect(() => advanceClock({ tick: 1, elapsedMs: Number.MAX_SAFE_INTEGER }, 50)).toThrow(
      RangeError
    );
  });

  it("exports the spaceship core from the package entrypoint", () => {
    expect(createSpaceshipSimulationConfig()).toMatchObject({
      fixedStepMs: 50,
      worldWidth: 4400,
      worldHeight: 4400,
      arenaRadius: 2200
    });
  });
});
