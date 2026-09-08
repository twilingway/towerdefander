import { useEffect, useRef } from "react";

import { createScreenWakeLock, type ScreenWakeLock } from "../immersiveMode.js";

/**
 * Holds the screen awake while the panel is seated in a room. The browser drops
 * a wake lock whenever the page is hidden and never restores it, so a
 * backgrounded controller has to take it again on the way back.
 */
export function useScreenWakeLock(held: boolean): void {
  const wakeLockReference = useRef<ScreenWakeLock | undefined>(undefined);
  wakeLockReference.current ??= createScreenWakeLock();

  useEffect(() => {
    const wakeLock = wakeLockReference.current;
    if (wakeLock === undefined || !held) return;
    void wakeLock.acquire();
    function reacquire(): void {
      if (document.visibilityState === "visible") void wakeLock?.acquire();
    }
    document.addEventListener("visibilitychange", reacquire);
    return () => {
      document.removeEventListener("visibilitychange", reacquire);
      void wakeLock.release();
    };
  }, [held]);
}
