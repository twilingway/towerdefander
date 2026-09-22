import { SEED_REVISION } from "./seedRevision.ts";

/**
 * The committed seed, behind its own package entry.
 *
 * Two consumers now read the same file: the release seeds a volume from it, and
 * a client build carries it so a device can play the operator's numbers with no
 * server. It sits behind `./seed` rather than the package index so anything that
 * only wants the code -- the room, the console, the measuring stand -- does not
 * pull a 314 KiB document into its bundle.
 *
 * The document itself is loaded on demand for the same reason: a dynamic import
 * is what makes a bundler emit it as its own chunk instead of folding it into
 * the entry.
 */
export const BALANCE_SEED_REVISION = SEED_REVISION;

export async function loadBalanceSeed(): Promise<unknown> {
  /*
   * No `with { type: "json" }`, deliberately.
   *
   * A bundler serves this file as a JavaScript module - that is how it gets a
   * hashed chunk and a tree-shaken shape - and an import that insists on a JSON
   * media type is then refused by the browser as a type mismatch. The failure
   * arrives as "failed to fetch dynamically imported module" on a request that
   * answered 200, which reads like a missing file and is not one: the run
   * quietly fell back to the code's defaults and played a different game.
   */
  const module = (await import("../presets/production.json")) as { default?: unknown };
  return module.default ?? module;
}
