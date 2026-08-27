import { validateRunSeed } from "./combatValidation.ts";

/** Seeded, domain-separated randomness: the simulation never calls Math.random. */
export function deriveDomainSeed(runSeed: number, waveNumber: number, domain: number): number {
  validateRunSeed(runSeed);
  if (!Number.isSafeInteger(waveNumber) || waveNumber <= 0) {
    throw new RangeError("waveNumber must be a positive safe integer");
  }
  let value = (runSeed ^ Math.imul(waveNumber, 0x9e37_79b1) ^ domain) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85eb_ca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2_ae35) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return value === 0 ? 0x6d2b_79f5 : value;
}

export function nextUint32(state: number): readonly [number, number] {
  validateRunSeed(state);
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;
  return [next === 0 ? 0x6d2b_79f5 : next, next >>> 0];
}
