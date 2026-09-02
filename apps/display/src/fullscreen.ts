/**
 * The browser's fullscreen switch, read defensively.
 *
 * Every API here is optional at runtime: iOS Safari has no fullscreen for
 * anything but a video, and a request outside a user gesture is refused. A
 * missing API and a refusal land in the same place - the display keeps playing
 * in the window it has - so the button is simply not offered when there is
 * nothing behind it.
 *
 * The controller has its own immersive helper, which enters fullscreen and
 * locks the phone to landscape and never leaves. This is the other shape: a
 * switch, on a screen nobody rotates.
 */

export interface FullscreenHost {
  readonly isFullscreen: () => boolean;
  readonly enter: () => Promise<void>;
  readonly leave: () => Promise<void>;
  readonly subscribe: (listener: () => void) => () => void;
}

interface FullscreenCapableElement {
  readonly requestFullscreen?: () => Promise<void>;
}

interface FullscreenCapableDocument {
  readonly fullscreenElement?: Element | null;
  readonly exitFullscreen?: () => Promise<void>;
  readonly documentElement: FullscreenCapableElement;
  readonly addEventListener: (type: string, listener: () => void) => void;
  readonly removeEventListener: (type: string, listener: () => void) => void;
}

export function readFullscreenHost(): FullscreenHost | undefined {
  if (typeof document === "undefined") return undefined;
  const host: FullscreenCapableDocument = document;
  const element = host.documentElement;
  const request = element.requestFullscreen;
  const exit = host.exitFullscreen;
  if (request === undefined || exit === undefined) return undefined;
  return {
    isFullscreen: () => (host.fullscreenElement ?? null) !== null,
    enter: async () => {
      await request.call(element);
    },
    leave: async () => {
      await exit.call(host);
    },
    subscribe: (listener) => {
      host.addEventListener("fullscreenchange", listener);
      return () => {
        host.removeEventListener("fullscreenchange", listener);
      };
    }
  };
}

/** What the button says, which is what it will do rather than where it is. */
export function fullscreenLabel(active: boolean): string {
  return active ? "Свернуть из полного экрана" : "Развернуть на весь экран";
}

/**
 * Toggling is one call either way, and a refusal is not an error the player can
 * do anything about: the browser simply stays as it was.
 */
export async function toggleFullscreen(host: FullscreenHost): Promise<void> {
  try {
    await (host.isFullscreen() ? host.leave() : host.enter());
  } catch {
    // Refused, or the document lost the gesture that allowed it.
  }
}
