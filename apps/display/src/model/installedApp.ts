/**
 * The page running as the installed game rather than in a browser tab.
 *
 * Read once, at load. An installed app fills the screen with no element in the
 * browser's full screen; a tab our own auto-fullscreen expanded has one - and
 * after the first tap inside the app that same request makes the two look
 * alike, so asking later would get it wrong.
 */
const installed =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (window.matchMedia("(display-mode: fullscreen)").matches &&
      document.fullscreenElement === null));

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
