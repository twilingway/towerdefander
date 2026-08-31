import type { SessionStorage } from "./reconnectionSession.js";

export const SOLO_LAYOUT_KEY = "spaceship-defender.solo-layout";

/**
 * Where the two fire zones sit on the solo panel: both over the right stick as
 * a pair, or stretched along the top edge like gamepad triggers. Which one
 * plays better is a question for thumbs, so both ship and the choice stays on
 * the device. The stored id stays `stacked` so an old preference still reads.
 */
export const SOLO_LAYOUTS = ["stacked", "triggers"] as const;
export type SoloLayout = (typeof SOLO_LAYOUTS)[number];
export const DEFAULT_SOLO_LAYOUT: SoloLayout = "stacked";

export function readSoloLayout(storage: SessionStorage): SoloLayout {
  const stored = storage.getItem(SOLO_LAYOUT_KEY);
  return isSoloLayout(stored) ? stored : DEFAULT_SOLO_LAYOUT;
}

export function saveSoloLayout(storage: SessionStorage, layout: SoloLayout): void {
  storage.setItem(SOLO_LAYOUT_KEY, layout);
}

export function soloLayoutLabel(layout: SoloLayout): string {
  return layout === "stacked" ? "Кнопки справа" : "Кнопки по верхнему краю";
}

function isSoloLayout(value: string | null): value is SoloLayout {
  return value !== null && SOLO_LAYOUTS.includes(value as SoloLayout);
}
