import { SEED_REVISION } from "./seedRevision.ts";

/**
 * The committed seed, behind its own package entry.
 *
 * Two consumers now read the same file: the release seeds a volume from it, and
 * a client build carries it so a device can play the operator's numbers with no
 * server. It sits behind `./seed` rather than the package index so anything that
 * only wants the revision does not pull a 314 KiB document in to read a number.
 */
export const BALANCE_SEED_REVISION = SEED_REVISION;

/**
 * The document itself, from the one place that reads it.
 *
 * It used to be a dynamic import here, for a chunk of its own - but the two
 * runtimes disagree about how to ask: Node refuses a JSON module without a type
 * attribute, and a dev server refuses one *with* it, because it serves the file
 * as JavaScript. Since the defaults are the seed now, everything that loads
 * this package loads the document anyway, and a second way to fetch it bought
 * nothing but a way to be wrong.
 */
export async function loadBalanceSeed(): Promise<unknown> {
  const { SEED_DOCUMENT } = await import("./defaults.ts");
  return SEED_DOCUMENT;
}
