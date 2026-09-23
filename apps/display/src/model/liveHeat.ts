import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";

/**
 * The two heat gauges, written straight to their nodes.
 *
 * Heat is the fastest thing on the screen: a held trigger moves it through the
 * whole gauge in a couple of seconds, and the room sends a fresh number sixty
 * times a second. Rendered through React it woke the header and the cockpit on
 * every patch, and every one of those commits was a DOM write inside a frame
 * the arena was drawing - which a trace of the long frames shows as layout and
 * paint that the short frames do not carry.
 *
 * So React draws the gauges once and never again, and this moves them. Nothing
 * here changes the shape of the page: a transform, a couple of attributes and
 * one label, all on nodes that already exist.
 *
 * Found by their test ids inside a host element rather than by refs threaded
 * through four components: the gauges are presentational and their tests render
 * them to static markup, which a ref-carrying prop would have made impossible.
 */

/** Only the three numbers a gauge is made of; the barrels differ in the rest. */
interface HeatReading {
  readonly heat: number;
  readonly capacity: number;
  readonly overheated: boolean;
}

/**
 * The status frame's bar for a barrel: its lit cells are React's, and only the
 * two attributes a test or a stylesheet reads between renders are written here.
 */
function writeRow(row: Element | null, weapon: HeatReading): void {
  if (row === null) return;
  const overheated = String(weapon.overheated);
  if (row.getAttribute("data-overheated") !== overheated) {
    row.setAttribute("data-overheated", overheated);
  }
  row.setAttribute("data-heat", String(weapon.heat));
}

function writeTrigger(button: Element | null, weapon: HeatReading): void {
  if (button === null) return;
  const overheated = String(weapon.overheated);
  if (button.getAttribute("data-overheated") !== overheated) {
    button.setAttribute("data-overheated", overheated);
  }
}

/**
 * One pass over whatever gauges are on the page.
 *
 * Every one of them is optional: the header is gone with the interface off, the
 * cockpit exists only when this page is also the pilot, and neither absence is
 * a fault.
 */
export function writeLiveHeat(root: ParentNode, game: DisplayGameSnapshot): void {
  writeRow(root.querySelector('[data-testid="cannon-heat"]'), game.cannon);
  writeRow(root.querySelector('[data-testid="machine-gun-heat"]'), game.machineGun);
  writeTrigger(root.querySelector('[data-testid="cockpit-trigger-cannon"]'), game.cannon);
  writeTrigger(root.querySelector('[data-testid="cockpit-trigger-mg"]'), game.machineGun);
}
