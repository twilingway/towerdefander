/**
 * Web Crypto rather than `node:crypto`, because a device generates its own run
 * seeds and cannot import a Node builtin. Both runtimes expose the same call.
 *
 * The shape is declared here rather than pulled in from the DOM library: this
 * package stays free of DOM types, and one method is all that is used.
 */
interface RandomSource {
  getRandomValues(array: Uint32Array): Uint32Array;
}

function randomUint32(): number {
  const source = (globalThis as { crypto?: RandomSource }).crypto;
  if (source === undefined) throw new Error("No Web Crypto to draw a run seed from");
  return source.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/** A fresh run seed, never the one the previous run used, and never zero. */
export function createRunSeed(excluded?: number): number {
  let seed = randomUint32();
  while (seed === 0 || seed === excluded) seed = randomUint32();
  return seed;
}
