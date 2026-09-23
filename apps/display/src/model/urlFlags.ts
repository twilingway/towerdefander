import { MAX_START_WAVE } from "@spaceship-defender/protocol";
import { isPreviewMode } from "@spaceship-defender/client-shared";

import { isDiagnosticsRequested } from "./diagnostics.js";
import { isVisibleDemoMode, readShipArchetypeId, readStartWave } from "./visibleDemo.js";

export interface DisplayUrlFlags {
  readonly preview: boolean;
  readonly diagnostics: boolean;
  readonly visibleDemo: boolean;
  /** Development builds only; the server refuses the wave without its own flag. */
  readonly allowStartWave: boolean;
  readonly initialStartWave: number;
  /** Lets a demo or a bookmark open the run on a named hull. */
  readonly shipArchetypeId: string | undefined;
  /**
   * Play on this device through a server room, the way it worked before the run
   * could be hosted here. Kept as a way back: `tests/e2e/solo-room.spec.ts`
   * covers that path, and an operator reproducing a room-side bug wants it from
   * a bookmark rather than from a rebuild.
   */
  readonly online: boolean;
  /**
   * Opens the shared-screen tiles, which players find switched off while those
   * crews still fly on autopilots; the stands and e2e ask for it with `?shared`.
   */
  readonly sharedScreen: boolean;
}

export interface DisplayUrlEnvironment {
  readonly dev: boolean;
  /** `import.meta.env` is untyped, so the value is narrowed here rather than trusted. */
  readonly visibleDemo: unknown;
}

/**
 * Every switch the address carries, read in one place from one string.
 *
 * The query stays a query: `?dpr` and `?tanks` are read outside React, in the
 * canvas and in the scene, so routing state is never a second source for any of
 * these. The environment arrives as an argument so the module can be read in a
 * plain unit test.
 */
export function readDisplayUrlFlags(
  search: string,
  environment: DisplayUrlEnvironment
): DisplayUrlFlags {
  const allowStartWave = environment.dev;
  return {
    preview: isPreviewMode(search, environment.dev),
    diagnostics: isDiagnosticsRequested(search),
    visibleDemo: isVisibleDemoMode(
      search,
      environment.dev,
      typeof environment.visibleDemo === "string" ? environment.visibleDemo : undefined
    ),
    allowStartWave,
    initialStartWave: allowStartWave ? readStartWave(search, MAX_START_WAVE) : 1,
    shipArchetypeId: readShipArchetypeId(search),
    sharedScreen: new URLSearchParams(search).has("shared"),
    online: new URLSearchParams(search).has("online")
  };
}

/** The page's own query string, or an empty one where there is no page. */
export function readDisplaySearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

/**
 * The current query with the run's own choices written into it.
 *
 * The hull and the wave are read back from the address by the page that plays
 * them, so a local run opened from a link or reloaded mid-session starts on the
 * same ship - and every other switch already in the query survives the move.
 */
export function withRunParameters(
  search: string,
  run: { readonly shipArchetypeId: string | undefined; readonly startWave: number }
): string {
  const parameters = new URLSearchParams(search);
  if (run.shipArchetypeId === undefined) parameters.delete("ship");
  else parameters.set("ship", run.shipArchetypeId);
  if (run.startWave > 1) parameters.set("wave", String(run.startWave));
  else parameters.delete("wave");
  const query = parameters.toString();
  return query.length > 0 ? `?${query}` : "";
}
