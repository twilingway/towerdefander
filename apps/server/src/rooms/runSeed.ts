import { randomInt } from "node:crypto";

const UINT32_EXCLUSIVE_MAX = 0x1_0000_0000;

/** A fresh run seed, never the one the previous run used. */
export function createRunSeed(excluded?: number): number {
  let seed = randomInt(1, UINT32_EXCLUSIVE_MAX);
  while (seed === excluded) seed = randomInt(1, UINT32_EXCLUSIVE_MAX);
  return seed;
}
