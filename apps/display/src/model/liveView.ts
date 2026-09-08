import type { DisplayRoomView } from "@spaceship-defender/protocol";

/**
 * The last view the room published, held outside React.
 *
 * A module value rather than a ref, because its writer and its readers sit on
 * opposite sides of the component boundary: the patch handler writes it, and
 * the scene, the heat gauges and the instrument panel all read it - none of
 * them rendering the page to do so.
 */
let current: DisplayRoomView | undefined;

export function setLiveView(view: DisplayRoomView | undefined): void {
  current = view;
}

export function readLiveView(): DisplayRoomView | undefined {
  return current;
}

export function readLiveGame(): NonNullable<DisplayRoomView["game"]> | undefined {
  return current?.game ?? undefined;
}
