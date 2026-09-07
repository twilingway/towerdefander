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
export const ARENA_HOST_SELECTOR = ".battlefield-shell";

export function isArenaTarget(
  target: { closest?: (selector: string) => unknown } | null | undefined
): boolean {
  if (target == null || typeof target.closest !== "function") return false;
  return target.closest(ARENA_HOST_SELECTOR) != null;
}
