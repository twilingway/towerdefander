export interface RandomSource {
  next(): number;
}

export function createSeededRandom(seed: number): RandomSource {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError("seed must be a safe integer");
  }

  let state = seed >>> 0;

  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    }
  };
}

export interface SimulationClock {
  readonly tick: number;
  readonly elapsedMs: number;
}

export function advanceClock(clock: SimulationClock, stepMs: number): SimulationClock {
  if (!Number.isSafeInteger(clock.tick) || clock.tick < 0) {
    throw new RangeError("clock.tick must be a non-negative safe integer");
  }

  if (!Number.isSafeInteger(clock.elapsedMs) || clock.elapsedMs < 0) {
    throw new RangeError("clock.elapsedMs must be a non-negative safe integer");
  }

  if (!Number.isSafeInteger(stepMs) || stepMs <= 0) {
    throw new RangeError("stepMs must be a positive safe integer");
  }

  const nextTick = clock.tick + 1;
  const nextElapsedMs = clock.elapsedMs + stepMs;

  if (!Number.isSafeInteger(nextTick) || !Number.isSafeInteger(nextElapsedMs)) {
    throw new RangeError("simulation clock overflow");
  }

  return {
    tick: nextTick,
    elapsedMs: nextElapsedMs
  };
}
