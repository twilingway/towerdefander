import { MAX_START_WAVE } from "@spaceship-defender/protocol";
import { isPreviewMode } from "@spaceship-defender/client-shared";

import { isDiagnosticsRequested } from "./diagnostics.js";
import { isVisibleDemoMode, readShipArchetypeId, readStartWave } from "../visibleDemo.js";

export interface DisplayUrlFlags {
  readonly preview: boolean;
  readonly diagnostics: boolean;
  readonly visibleDemo: boolean;
  /** Development builds only; the server refuses the wave without its own flag. */
  readonly allowStartWave: boolean;
  readonly initialStartWave: number;
  /** Lets a demo or a bookmark open the run on a named hull. */
  readonly shipArchetypeId: string | undefined;
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
    shipArchetypeId: readShipArchetypeId(search)
  };
}

/** The page's own query string, or an empty one where there is no page. */
export function readDisplaySearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}
