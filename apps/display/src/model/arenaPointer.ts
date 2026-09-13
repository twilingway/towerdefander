/**
 * Whether a pointer event is commanding the ship, or merely working the page.
 *
 * The cockpit's mouse listeners sit on the window, because a gun has to keep
 * tracking while the cursor leaves any particular element. The cost of that is
 * every click on the page arriving here too - the sticks, the triggers, the
 * assist box, the close button - and each one used to be a shot. Dragging a
 * stick with a mouse was the worst case: the pointer capture retargets the moves
 * to the stick and they still reach the window, so the hull fired at the very
 * cursor that was steering it.
 *
 * The arena host answers it rather than a list of things to exclude, because the
 * cockpit overlay and every panel are its siblings and not its children: inside
 * the shell means on the world, and nothing else does.
 *
 * Typed structurally rather than against `Element` so the rule can be tested
 * without a DOM.
 */
/*
 * The host the world is drawn in, not the one it is described in.
 *
 * This named `.battlefield-shell` for a long time, which is the text twin a
 * browser test and the demo bot read - a sibling of the canvas, not its parent.
 * Nothing a mouse ever touched was inside it, so every pointer event over the
 * battlefield was judged to be off it: the turret did not follow the cursor and
 * the left button did not fire, while the keyboard worked perfectly.
 */
export const ARENA_HOST_SELECTOR = ".battlefield-canvas";

export function isArenaTarget(
  target: { closest?: (selector: string) => unknown } | null | undefined
): boolean {
  if (target == null || typeof target.closest !== "function") return false;
  return target.closest(ARENA_HOST_SELECTOR) != null;
}

/** The narrow part of a document the centre is read from, so it can be tested without one. */
export interface ArenaRoot {
  querySelector(selector: string): {
    getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  } | null;
}

/**
 * The middle of the arena on screen: where the ship is drawn, and so where the
 * mouse's bearing is measured from.
 *
 * Off the canvas host for the same reason as the pointer test above. The text
 * twin `.battlefield-shell` is rendered only by a dev build and the demo, so a
 * release build found nothing here: the turret ignored the mouse in production
 * while both buttons still fired, and every stand, served by a dev server, looked
 * fine.
 */
export function readArenaCentre(
  root: ArenaRoot
): { readonly x: number; readonly y: number } | null {
  const host = root.querySelector(ARENA_HOST_SELECTOR);
  if (host === null) return null;
  const box = host.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}
