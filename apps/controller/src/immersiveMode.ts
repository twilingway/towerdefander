/**
 * Chrome-only immersive helpers for the phone controller. Every browser API used
 * here is optional at runtime: a missing API and a rejected request lead to the
 * same place — the controller keeps playing in the normal viewport.
 */

export type ImmersiveOutcome = "entered" | "already-active" | "unsupported" | "rejected";

export interface ImmersiveHost {
  readonly isFullscreen: () => boolean;
  readonly requestFullscreen: (() => Promise<void>) | undefined;
  readonly lockLandscape: (() => Promise<void>) | undefined;
}

export interface WakeLockHandle {
  readonly release: () => Promise<void>;
}

interface FullscreenCapableElement {
  readonly requestFullscreen?: () => Promise<void>;
}

interface FullscreenCapableDocument {
  readonly fullscreenElement?: Element | null;
  readonly documentElement: FullscreenCapableElement;
}

interface OrientationCapableScreen {
  readonly orientation?: {
    readonly lock?: (orientation: "landscape") => Promise<void>;
  };
}

interface WakeLockCapableNavigator {
  readonly wakeLock?: {
    readonly request?: (type: "screen") => Promise<WakeLockHandle>;
  };
}

/**
 * Must be called from a user gesture handler: browsers reject fullscreen
 * requested outside one.
 */
export async function enterImmersiveMode(host: ImmersiveHost): Promise<ImmersiveOutcome> {
  if (host.isFullscreen()) return "already-active";
  const { requestFullscreen } = host;
  if (requestFullscreen === undefined) return "unsupported";
  try {
    await requestFullscreen();
  } catch {
    return "rejected";
  }
  await lockLandscapeQuietly(host.lockLandscape);
  return "entered";
}

async function lockLandscapeQuietly(lock: (() => Promise<void>) | undefined): Promise<void> {
  if (lock === undefined) return;
  try {
    await lock();
  } catch {
    // Desktop Chrome has nothing to rotate and rejects the lock. Fullscreen on
    // its own is still the win, so the refusal stays invisible to the player.
  }
}

export function readImmersiveHost(): ImmersiveHost | undefined {
  if (typeof document === "undefined") return undefined;
  const documentHost: FullscreenCapableDocument = document;
  const element = documentHost.documentElement;
  const request = element.requestFullscreen;
  const lock = typeof screen === "undefined" ? undefined : readOrientationLock(screen);
  return {
    isFullscreen: () => (documentHost.fullscreenElement ?? null) !== null,
    requestFullscreen: request === undefined ? undefined : () => request.call(element),
    lockLandscape: lock
  };
}

function readOrientationLock(source: OrientationCapableScreen): (() => Promise<void>) | undefined {
  const { orientation } = source;
  const lock = orientation?.lock;
  if (orientation === undefined || lock === undefined) return undefined;
  return () => lock.call(orientation, "landscape");
}

/**
 * Holds a screen wake lock while the controller is in a room. The browser drops
 * the lock whenever the page is hidden and never restores it, so the caller
 * re-acquires on `visibilitychange`.
 */
export class ScreenWakeLock {
  private handle: WakeLockHandle | undefined;
  private pending: Promise<void> | undefined;
  private wanted = false;

  constructor(private readonly request: (() => Promise<WakeLockHandle>) | undefined) {}

  async acquire(): Promise<void> {
    this.wanted = true;
    const { request } = this;
    if (request === undefined || this.handle !== undefined) return;
    this.pending ??= this.startRequest(request);
    await this.pending;
  }

  async release(): Promise<void> {
    this.wanted = false;
    // A request in flight would otherwise install its handle after this call and
    // keep the screen awake for a player who already left.
    await this.pending;
    const { handle } = this;
    this.handle = undefined;
    if (handle === undefined) return;
    try {
      await handle.release();
    } catch {
      // The lock was already dropped by the browser.
    }
  }

  private async startRequest(request: () => Promise<WakeLockHandle>): Promise<void> {
    try {
      const handle = await request();
      if (this.wanted) {
        this.handle = handle;
      } else {
        await handle.release();
      }
    } catch {
      // Wake Lock needs a secure context and a visible document. Plain http on a
      // LAN address fails here, which is an accepted degradation.
    } finally {
      this.pending = undefined;
    }
  }
}

export function createScreenWakeLock(): ScreenWakeLock {
  return new ScreenWakeLock(readWakeLockRequest());
}

function readWakeLockRequest(): (() => Promise<WakeLockHandle>) | undefined {
  if (typeof navigator === "undefined") return undefined;
  const navigatorHost: WakeLockCapableNavigator = navigator;
  const { wakeLock } = navigatorHost;
  const request = wakeLock?.request;
  if (wakeLock === undefined || request === undefined) return undefined;
  return () => request.call(wakeLock, "screen");
}
