/**
 * A newer build of the game, waiting for the player's word.
 *
 * The service worker installs it in the background and then only offers it:
 * the start and campaign screens read this and show a button, and the fight
 * does not read it at all - so a release can never reload a page mid-wave.
 */

let activate: (() => void) | undefined;
const listeners = new Set<() => void>();

/** Called by the registration when a new worker is installed and waiting. */
export function offerAppUpdate(switchToIt: () => void): void {
  activate = switchToIt;
  for (const listener of listeners) listener();
}

export function appUpdateAvailable(): boolean {
  return activate !== undefined;
}

export function subscribeToAppUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The player's yes: the waiting build takes over and the page reloads on it. */
export function applyAppUpdate(): void {
  activate?.();
}

/**
 * `?sw=off`: mend a device whose worker went wrong from the address bar - no
 * worker registered, every one of this origin's removed, the caches emptied.
 */
export function serviceWorkerSwitchedOff(search: string): boolean {
  return new URLSearchParams(search).get("sw") === "off";
}
