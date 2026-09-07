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

  // Milliseconds, not counts: sixty steps a second is 16.666..., so neither the
  // step nor the elapsed total can be whole. The tick beside them still is, and
  // it is what everything in the balance is counted in.
  if (!Number.isFinite(clock.elapsedMs) || clock.elapsedMs < 0) {
    throw new RangeError("clock.elapsedMs must be a non-negative finite number");
  }

  if (!Number.isFinite(stepMs) || stepMs <= 0) {
    throw new RangeError("stepMs must be a positive finite number");
  }

  const nextTick = clock.tick + 1;
  const nextElapsedMs = clock.elapsedMs + stepMs;

  if (!Number.isSafeInteger(nextTick) || !Number.isFinite(nextElapsedMs)) {
    throw new RangeError("simulation clock overflow");
  }

  return {
    tick: nextTick,
    elapsedMs: nextElapsedMs
  };
}
