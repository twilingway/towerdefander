import { DEVICE_PIXEL_RATIO_CAP } from "./spaceshipViewModel.js";

/**
 * How much of the panel's own resolution the scene is allowed to use, and how
 * to notice when that number moves.
 *
 * The arithmetic lives in `spaceshipViewModel.ts` where it can be measured
 * without a browser; this file is only the part that has to touch `window`.
 */

/**
 * A `?dpr=1.5` in the address, for choosing the ceiling on the device that has
 * to live with it: more pixels is sharper and costs the square of itself, and
 * which trade a given phone can afford is a thing to measure with the frame
 * counter rather than to guess here. Anything outside a sane band reads as
 * "use the built-in ceiling", so a stray value never blinds a display.
 */
export function readPixelRatioCap(search: string, fallback = DEVICE_PIXEL_RATIO_CAP): number {
  const raw = Number(new URLSearchParams(search).get("dpr"));
  if (!Number.isFinite(raw) || raw < 1 || raw > 4) return fallback;
  return raw;
}

/**
 * Calls back whenever the panel's pixel density changes - a window dragged to a
 * second monitor, or the browser zoomed.
 *
 * There is no event for it. The way to hear about it is to ask a media query
 * about the density you last saw and re-ask at the new one every time it stops
 * being true, which is what the re-arming below is. Returns the unsubscribe.
 */
export function watchDevicePixelRatio(onChange: (ratio: number) => void): () => void {
  if (typeof globalThis.matchMedia !== "function") return () => undefined;
  let query: MediaQueryList | undefined;
  let stopped = false;

  const listen = (): void => {
    if (stopped) return;
    const ratio = globalThis.devicePixelRatio;
    query = globalThis.matchMedia(`(resolution: ${String(ratio)}dppx)`);
    query.addEventListener("change", handleChange);
  };

  function handleChange(): void {
    query?.removeEventListener("change", handleChange);
    query = undefined;
    listen();
    onChange(globalThis.devicePixelRatio);
  }

  listen();
  return () => {
    stopped = true;
    query?.removeEventListener("change", handleChange);
    query = undefined;
  };
}
