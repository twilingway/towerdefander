import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** Which way a D-pad press wants to move, in screen terms. */
type Direction = "up" | "down" | "left" | "right";

const DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right"
};

/** Back on a TV remote arrives under several names, depending on the box. */
const BACK_KEYS = new Set(["Escape", "Backspace", "BrowserBack", "GoBack"]);

interface RemoteNavigationOptions {
  /** Where Back goes. Absent on the first screen, which has nowhere to go. */
  readonly onBack?: (() => void) | undefined;
  /** Whether to put the focus somewhere on mount, so a remote works at once. */
  readonly autoFocus?: boolean;
}

/**
 * A television remote, on a page built for a mouse.
 *
 * A TV has no pointer: the arrows have to move the focus and OK has to press
 * what is focused. The browser only does that for Tab, and Tab order is
 * document order, which walks a grid in rows and never sideways. So the arrows
 * are answered here geometrically - the nearest control in the direction asked
 * for, by how far it is along that axis and how far it strays off it.
 *
 * Text fields are left alone: inside one, the arrows belong to the caret.
 */
export function useRemoteNavigation(
  container: RefObject<HTMLElement | null>,
  { onBack, autoFocus = true }: RemoteNavigationOptions = {}
): void {
  useEffect(() => {
    const root = container.current;
    if (root === null) return;

    if (autoFocus) {
      const first = root.querySelector<HTMLElement>(FOCUSABLE);
      // Only when nothing inside is focused yet: re-grabbing it on every render
      // would fight the person pressing the buttons.
      if (first !== null && !root.contains(document.activeElement)) first.focus();
    }

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (BACK_KEYS.has(event.key) && onBack !== undefined) {
        event.preventDefault();
        onBack();
        return;
      }

      const direction = DIRECTIONS[event.key];
      if (direction === undefined) return;

      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.type === "text") return;

      const candidates = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (candidates.length === 0) return;

      const from =
        active instanceof HTMLElement && root.contains(active)
          ? active.getBoundingClientRect()
          : undefined;
      const next =
        from === undefined ? candidates[0] : nearestInDirection(candidates, from, direction);
      if (next === undefined) return;

      event.preventDefault();
      next.focus();
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [container, onBack, autoFocus]);
}

function nearestInDirection(
  candidates: readonly HTMLElement[],
  from: DOMRect,
  direction: Direction
): HTMLElement | undefined {
  const fromX = from.left + from.width / 2;
  const fromY = from.top + from.height / 2;
  let best: HTMLElement | undefined;
  let bestCost = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const dx = x - fromX;
    const dy = y - fromY;
    const along =
      direction === "up" ? -dy : direction === "down" ? dy : direction === "left" ? -dx : dx;
    // Has to be genuinely in that direction, and by more than a rounding error:
    // two controls on the same row must not answer an "up".
    if (along <= 1) continue;
    const across = direction === "up" || direction === "down" ? Math.abs(dx) : Math.abs(dy);
    // Straying off the axis costs triple, so a press walks the row it is on
    // before it jumps to a neighbouring one.
    const cost = along + across * 3;
    if (cost < bestCost) {
      bestCost = cost;
      best = candidate;
    }
  }

  return best;
}
