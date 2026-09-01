import { useEffect, useState } from "react";

/**
 * The display is a landscape instrument: the frame is 16:9 and every crew gets
 * the same slice of arena out of it. In portrait that frame degenerates - a
 * folding phone would be given bars over half its height - so instead of
 * playing badly, the screen asks to be turned and stops taking input.
 */
export function useIsPortrait(): boolean {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const media = globalThis.matchMedia("(orientation: portrait)");
    const update = () => {
      setPortrait(media.matches);
    };
    // Read once on mount rather than in the initial state: the server render has
    // no window to ask, and a mismatch there is a hydration error.
    update();
    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
    };
  }, []);
  return portrait;
}

export function RotateNotice() {
  return (
    <div className="rotate-notice" data-testid="rotate-notice" role="alert">
      <div className="rotate-notice__icon" aria-hidden="true">
        ⟳
      </div>
      <h2>Поверните устройство</h2>
      <p>Поле боя рисуется в ландшафтной ориентации — в портрете виден не весь бой.</p>
    </div>
  );
}
