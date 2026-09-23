/**
 * The browser's offer to install the game, held for a button of our own.
 *
 * Chromium fires `beforeinstallprompt` once the page qualifies as an app; the
 * event is kept instead of letting the browser show its own bar, and spent on
 * the player's press. It is non-standard - Safari and Firefox never fire it -
 * so where it never comes, no button is shown and the browser's menu remains.
 */

/** The part of Chromium's `BeforeInstallPromptEvent` this page uses; the DOM types lack it. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<{ readonly outcome: "accepted" | "dismissed" }>;
}

let offer: InstallPromptEvent | undefined;
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

/** Called once at start-up: the event can fire before any screen is mounted. */
export function watchInstallOffer(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    offer = event as InstallPromptEvent;
    announce();
  });
  window.addEventListener("appinstalled", () => {
    offer = undefined;
    announce();
  });
}

export function installOffered(): boolean {
  return offer !== undefined;
}

export function subscribeToInstallOffer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The player's press. An offer prompts once, so it is spent whatever they answer. */
export async function installApp(): Promise<void> {
  const pending = offer;
  if (pending === undefined) return;
  offer = undefined;
  announce();
  await pending.prompt();
}
