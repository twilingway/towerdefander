import {
  createDefaultGameServerUrl,
  readStringEnvironment
} from "@spaceship-defender/client-shared";

/**
 * Read at import time, on purpose. `createDefaultControllerUrl` reads
 * `window.location`, and the render test replaces `window` after importing the
 * app - so the default has to be taken while the real one is still there.
 */
export const GAME_SERVER_URL = readStringEnvironment(
  import.meta.env.VITE_GAME_SERVER_URL,
  createDefaultGameServerUrl()
);

export const CONTROLLER_URL = readStringEnvironment(
  import.meta.env.VITE_CONTROLLER_URL,
  createDefaultControllerUrl()
);

/** A commit cut to the seven characters git itself shortens it to; any other tag as it came. */
export function formatBuildVersion(raw: string): string {
  return /^[0-9a-f]{8,40}$/.test(raw) ? raw.slice(0, 7) : raw;
}

/**
 * The release this bundle was built from, printed under the copyright.
 *
 * A release tags its images with the commit and hands that tag to the build, so
 * a production screen names the commit it runs. Anything built without one, the
 * stand included, says "dev".
 */
export const BUILD_VERSION = formatBuildVersion(
  readStringEnvironment(import.meta.env.VITE_BUILD_VERSION, "dev")
);

function createDefaultControllerUrl(): string {
  if (typeof window === "undefined") return "http://localhost:5174";
  return `${window.location.protocol}//${window.location.hostname}:5174`;
}
