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

/**
 * The request to turn the glass, and - where the browser lets a page do it -
 * a button that turns it. Full screen and an orientation lock are granted only
 * from a press, so the button is the press; without `onTurn` the notice can
 * only ask.
 */
export function RotateNotice({ onTurn }: { readonly onTurn?: () => void }) {
  return (
    <div className="rotate-notice" data-testid="rotate-notice" role="alert">
      <div className="rotate-notice__icon" aria-hidden="true">
        ⟳
      </div>
      <h2>Поверните устройство</h2>
      <p>Поле боя рисуется в ландшафтной ориентации — в портрете виден не весь бой.</p>
      {onTurn !== undefined && (
        <button
          type="button"
          className="rotate-notice__turn"
          data-testid="rotate-notice-turn"
          onClick={onTurn}
        >
          Повернуть экран
        </button>
      )}
    </div>
  );
}
