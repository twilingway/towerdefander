/**
 * The page running as the installed game rather than in a browser tab.
 *
 * Marked by the address the app is launched at (`start_url` in the manifest,
 * `?app=1`), which every screen carries on, and kept for the session in case a
 * screen ever drops it. Display modes alone are not enough: a tab our own
 * auto-fullscreen expanded stays in full screen across a navigation and then
 * looks exactly like the app - a Redmi 4X's tab showed an exit button that
 * could never work there.
 */
const SESSION_KEY = "spaceship-defender:installed";

function detectInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const launched = new URLSearchParams(window.location.search).get("app") === "1";
  const standalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  try {
    if (launched || standalone) window.sessionStorage.setItem(SESSION_KEY, "1");
    return launched || standalone || window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return launched || standalone;
  }
}

const installed = detectInstalled();

export function runningInstalled(): boolean {
  return installed;
}

/**
 * Closes the installed game.
 *
 * Chrome lets a script close a window only while its history holds one entry,
 * which is why the installed app moves between screens by replacing the entry
 * instead of adding one (see `App.tsx`). In a browser tab it does nothing.
 */
export function closeApp(): void {
  window.close();
}

/** The part of Chromium's `CloseWatcher` this page uses; the DOM types lack it. */
interface CloseWatcherLike {
  onclose: (() => void) | null;
  destroy(): void;
}

/**
 * Turns the system "back" into `onBack` until the returned stop is called,
 * without adding a history entry - one would stop `closeApp` from working.
 * `CloseWatcher` is Chrome's and recent (a Redmi 4X's Chrome 101 has none);
 * without it, back does what it always did.
 */
export function watchBack(onBack: () => void): () => void {
  const Watcher = (globalThis as { CloseWatcher?: new () => CloseWatcherLike }).CloseWatcher;
  if (Watcher === undefined) return () => undefined;
  let watcher: CloseWatcherLike | undefined;
  let stopped = false;
  const arm = (): void => {
    watcher = new Watcher();
    // A watcher is spent by the back it catches; the next one needs its own.
    watcher.onclose = () => {
      if (stopped) return;
      onBack();
      arm();
    };
  };
  arm();
  return () => {
    stopped = true;
    watcher?.destroy();
  };
}
