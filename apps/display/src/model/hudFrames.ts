import { HUD_ARTS } from "@spaceship-defender/sprite-assets";

const URLS = new Map<string, string>(HUD_ARTS.map((art) => [art.id, art.url]));

/**
 * Address of a built HUD frame by its asset id. Undefined only in a build that
 * ships without it, and a frame panel then draws its numbers on nothing rather
 * than on a broken image.
 */
export function hudFrameUrl(id: string): string | undefined {
  return URLS.get(id);
}

/** The frames CSS paints as backgrounds, by the custom property each one is handed in. */
const CSS_FRAMES = [
  ["--hud-radar-art", "ui-radar"],
  ["--hud-stick-ring-art", "ui-stick-left"],
  ["--hud-knob-move-art", "ui-knob-move"],
  ["--hud-knob-aim-art", "ui-knob-aim"]
] as const;

/**
 * The same pictures as custom properties for the shell.
 *
 * The radar and the sticks are dressed by the stylesheet rather than by markup
 * of their own, and a stylesheet cannot import a hashed asset URL; the shell
 * hands them down instead, and only under the frame skin.
 */
export const HUD_FRAME_CSS_VARIABLES: Readonly<Record<string, string>> = Object.fromEntries(
  CSS_FRAMES.flatMap(([property, id]) => {
    const url = hudFrameUrl(id);
    return url === undefined ? [] : [[property, `url("${url}")`]];
  })
);
