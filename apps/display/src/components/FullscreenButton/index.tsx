import { useEffect, useState } from "react";

import { fullscreenLabel, readFullscreenHost, toggleFullscreen } from "../../fullscreen.js";

/**
 * The switch into fullscreen, offered in the lobby: that is where a room is set
 * up and the one moment nobody is flying, and the browser only grants the
 * request from a click anyway.
 *
 * Rendered as nothing where there is no fullscreen to enter - iOS Safari, an
 * embedded view - rather than as a button that does nothing when pressed.
 */
export function FullscreenButton() {
  const [host] = useState(readFullscreenHost);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (host === undefined) return;
    const sync = () => {
      setActive(host.isFullscreen());
    };
    sync();
    return host.subscribe(sync);
  }, [host]);

  if (host === undefined) return null;
  return (
    <button
      type="button"
      className="fullscreen-button"
      data-testid="fullscreen-button"
      aria-pressed={active}
      onClick={() => void toggleFullscreen(host)}
    >
      {fullscreenLabel(active)}
    </button>
  );
}
