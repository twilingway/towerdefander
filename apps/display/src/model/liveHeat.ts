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

/** A whole percent is the finest thing either gauge can show. */
function percent(heat: number, capacity: number): number {
  if (!Number.isFinite(capacity) || capacity <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((heat / capacity) * 100)));
}

/** Only the three numbers a gauge is made of; the barrels differ in the rest. */
interface HeatReading {
  readonly heat: number;
  readonly capacity: number;
  readonly overheated: boolean;
}

function writeRow(row: Element | null, weapon: HeatReading): void {
  if (row === null) return;
  const share = percent(weapon.heat, weapon.capacity);
  const overheated = String(weapon.overheated);
  if (row.getAttribute("data-overheated") !== overheated) {
    row.setAttribute("data-overheated", overheated);
    row.classList.toggle("weapon-heat-row--overheated", weapon.overheated);
  }
  row.setAttribute("data-heat", String(weapon.heat));
  const meter = row.querySelector(".hud-energy");
  meter?.setAttribute("aria-valuenow", String(weapon.heat));
  meter?.setAttribute(
    "aria-valuetext",
    `${String(Math.round(weapon.heat))} / ${String(Math.round(weapon.capacity))}`
  );
  const fill = meter?.querySelector("i");
  if (fill instanceof HTMLElement) fill.style.transform = `scaleX(${(share / 100).toFixed(4)})`;
  const label = row.querySelector("small");
  const text = weapon.overheated ? "ПЕРЕГРЕВ" : `${String(share)}%`;
  if (label !== null && label.textContent !== text) label.textContent = text;
}

function writeTrigger(button: Element | null, weapon: HeatReading): void {
  if (button === null) return;
  const overheated = String(weapon.overheated);
  if (button.getAttribute("data-overheated") !== overheated) {
    button.setAttribute("data-overheated", overheated);
  }
  const fill = button.querySelector(".cockpit-trigger__heat");
  if (fill instanceof HTMLElement) {
    fill.style.transform = `scaleY(${(percent(weapon.heat, weapon.capacity) / 100).toFixed(4)})`;
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
