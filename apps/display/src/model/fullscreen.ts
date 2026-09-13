/**
 * The one thing a phone browser will not give a page by itself.
 *
 * A game on a small screen loses a third of it to the browser's own bars, and
 * on a phone those come back at every scroll. Full screen is the only way to
 * keep them away, and it may be asked for only from a real press - which is why
 * this is a function a button calls rather than something the app does on load.
 *
 * Not universally available: iOS Safari grants it to a video element and to
 * nothing else, so a page there has no way in at all. `fullscreenSupported`
 * answers that honestly instead of leaving a button that does nothing.
 */
export function fullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  return document.fullscreenEnabled && "requestFullscreen" in document.documentElement;
}

export function isFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  return document.fullscreenElement !== null;
}

/** Toggles, and swallows a refusal: a browser may say no and it is not an error. */
export function toggleFullscreen(): void {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement !== null) {
    void document.exitFullscreen().catch(() => undefined);
    return;
  }
  void document.documentElement.requestFullscreen().catch(() => undefined);
}

/** Fires whenever the browser enters or leaves it, including by its own gesture. */
export function subscribeToFullscreen(listener: () => void): () => void {
  if (typeof document === "undefined") return () => undefined;
  document.addEventListener("fullscreenchange", listener);
  return () => {
    document.removeEventListener("fullscreenchange", listener);
  };
}

/**
 * Whether a phone should take the whole screen by itself.
 *
 * Its own key rather than a field on the audio settings: this is not sound, and
 * a store called settings for one thing that quietly holds another is how a
 * store stops being findable.
 */
const AUTO_KEY = "spaceship-defender:auto-fullscreen";

const autoListeners = new Set<() => void>();

export function autoFullscreenEnabled(): boolean {
  try {
    const global = globalThis as { localStorage?: Storage };
    // Absent means on: a phone should arrive in full screen without being told.
    return global.localStorage?.getItem(AUTO_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAutoFullscreen(enabled: boolean): void {
  try {
    const global = globalThis as { localStorage?: Storage };
    global.localStorage?.setItem(AUTO_KEY, enabled ? "on" : "off");
  } catch {
    // A listener who cannot save the choice still gets to make it.
  }
  for (const listener of autoListeners) listener();
}

export function subscribeToAutoFullscreen(listener: () => void): () => void {
  autoListeners.add(listener);
  return () => autoListeners.delete(listener);
}

/** Whether this session has ever managed it, so a second try knows to happen. */
let entered = false;

/** Whether a phone wants it, has not had it, and can have it at all. */
function wantsFullscreen(): boolean {
  if (typeof window === "undefined") return false;
  if (entered || isFullscreen() || !autoFullscreenEnabled() || !fullscreenSupported()) return false;
  // A desktop browser would grant it too, and nobody asked their monitor to
  // lose its tabs.
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * One attempt, if a phone wants it and has not had it.
 *
 * Marked as done only when the browser actually says yes. A refusal that
 * counted would be a refusal that switches the whole thing off for the session
 * - which is exactly what a first tap does on a phone, for the reason below.
 */
export async function enterFullscreenIfWanted(): Promise<boolean> {
  if (!wantsFullscreen()) return false;
  return await document.documentElement
    .requestFullscreen()
    .then(() => {
      entered = true;
      return true;
    })
    .catch(() => false);
}

/**
 * Takes the whole screen on a phone, at the first press of the session.
 *
 * `click`, not `pointerdown`. A finger touching the glass is not yet a decision
 * the browser will act on: transient activation arrives with the press being
 * completed - `click`, `touchend` - and a request made on the way down is
 * refused on a phone while being granted on a desktop mouse, which is exactly
 * how this looked when it was wrong.
 *
 * The listeners stay until one of them succeeds rather than firing once: a
 * refusal has to be allowed to try again on the next press, or the first
 * unlucky tap of a session turns the feature off for the rest of it.
 */
export function armAutoFullscreen(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!window.matchMedia("(pointer: coarse)").matches) return;

  const detach = () => {
    document.removeEventListener("click", enter);
    document.removeEventListener("keydown", enter);
  };
  const enter = () => {
    if (!autoFullscreenEnabled()) {
      detach();
      return;
    }
    void enterFullscreenIfWanted().then((done) => {
      if (done) detach();
    });
  };

  document.addEventListener("click", enter);
  document.addEventListener("keydown", enter);
}
