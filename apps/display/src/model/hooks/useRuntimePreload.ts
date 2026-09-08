import { useEffect, useState } from "react";

/**
 * Whether the renderer's chunk has arrived.
 *
 * Fetched from the lobby rather than when the battle screen mounts: it is a
 * separate chunk carrying the whole of Phaser, and on a phone it lands about a
 * second into a fight that has already started - a second with no world drawn
 * and, worse, nothing driving the cockpit's input, so the first shots went
 * nowhere and the helm did not answer. The seat cannot be ready before the
 * thing that draws its world is.
 */
export function useRuntimePreload(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import("../../game/SpaceshipRuntime.js").then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
