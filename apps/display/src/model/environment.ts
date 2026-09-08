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

function createDefaultControllerUrl(): string {
  if (typeof window === "undefined") return "http://localhost:5174";
  return `${window.location.protocol}//${window.location.hostname}:5174`;
}
