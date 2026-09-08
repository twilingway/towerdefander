import { describe, expect, it, vi } from "vitest";

import {
  enterImmersiveMode,
  ScreenWakeLock,
  type ImmersiveHost,
  type WakeLockHandle
} from "./immersiveMode.js";

function createHost(overrides: Partial<ImmersiveHost> = {}): ImmersiveHost {
  return {
    isFullscreen: () => false,
    requestFullscreen: () => Promise.resolve(),
    lockLandscape: () => Promise.resolve(),
    ...overrides
  };
}

describe("enterImmersiveMode", () => {
  it("enters fullscreen and locks landscape", async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const lockLandscape = vi.fn(() => Promise.resolve());

    const outcome = await enterImmersiveMode(createHost({ requestFullscreen, lockLandscape }));

    expect(outcome).toBe("entered");
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(lockLandscape).toHaveBeenCalledTimes(1);
  });

  it("skips the request when the document is already fullscreen", async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());

    const outcome = await enterImmersiveMode(
      createHost({ isFullscreen: () => true, requestFullscreen })
    );

    expect(outcome).toBe("already-active");
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it("reports an unsupported browser without touching orientation", async () => {
    const lockLandscape = vi.fn(() => Promise.resolve());

    const outcome = await enterImmersiveMode(
      createHost({ requestFullscreen: undefined, lockLandscape })
    );

    expect(outcome).toBe("unsupported");
    expect(lockLandscape).not.toHaveBeenCalled();
  });

  it("reports a rejected fullscreen request without locking orientation", async () => {
    const lockLandscape = vi.fn(() => Promise.resolve());

    const outcome = await enterImmersiveMode(
      createHost({
        requestFullscreen: () => Promise.reject(new Error("denied")),
        lockLandscape
      })
    );

    expect(outcome).toBe("rejected");
    expect(lockLandscape).not.toHaveBeenCalled();
  });

  it("keeps fullscreen when the orientation lock is refused", async () => {
    const outcome = await enterImmersiveMode(
      createHost({ lockLandscape: () => Promise.reject(new Error("not supported")) })
    );

    expect(outcome).toBe("entered");
  });

  it("keeps fullscreen when the browser has no orientation lock", async () => {
    const outcome = await enterImmersiveMode(createHost({ lockLandscape: undefined }));

    expect(outcome).toBe("entered");
  });
});

describe("ScreenWakeLock", () => {
  function createHandle(): { handle: WakeLockHandle; release: ReturnType<typeof vi.fn> } {
    const release = vi.fn(() => Promise.resolve());
    return { handle: { release }, release };
  }

  it("requests the lock once while it is held", async () => {
    const { handle } = createHandle();
    const request = vi.fn(() => Promise.resolve(handle));
    const wakeLock = new ScreenWakeLock(request);

    await wakeLock.acquire();
    await wakeLock.acquire();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("releases the held lock and can take it again", async () => {
    const first = createHandle();
    const second = createHandle();
    const request = vi
      .fn<() => Promise<WakeLockHandle>>()
      .mockImplementationOnce(() => Promise.resolve(first.handle))
      .mockImplementationOnce(() => Promise.resolve(second.handle));
    const wakeLock = new ScreenWakeLock(request);

    await wakeLock.acquire();
    await wakeLock.release();
    await wakeLock.acquire();

    expect(first.release).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(second.release).not.toHaveBeenCalled();
  });

  it("releases a lock that arrived after the release call", async () => {
    const { handle, release } = createHandle();
    let resolveRequest: ((value: WakeLockHandle) => void) | undefined;
    const request = vi.fn(
      () =>
        new Promise<WakeLockHandle>((resolve) => {
          resolveRequest = resolve;
        })
    );
    const wakeLock = new ScreenWakeLock(request);

    const acquiring = wakeLock.acquire();
    const releasing = wakeLock.release();
    resolveRequest?.(handle);
    await acquiring;
    await releasing;

    expect(release).toHaveBeenCalledTimes(1);
  });

  it("survives a refused request", async () => {
    const wakeLock = new ScreenWakeLock(() => Promise.reject(new Error("insecure context")));

    await expect(wakeLock.acquire()).resolves.toBeUndefined();
    await expect(wakeLock.release()).resolves.toBeUndefined();
  });

  it("does nothing when the browser has no Wake Lock API", async () => {
    const wakeLock = new ScreenWakeLock(undefined);

    await expect(wakeLock.acquire()).resolves.toBeUndefined();
    await expect(wakeLock.release()).resolves.toBeUndefined();
  });
});
