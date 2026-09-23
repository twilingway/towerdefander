import {
  readQualityChoice,
  readStoredQuality,
  storeQuality,
  type QualityChoice,
  type QualityLevel
} from "../game/quality.js";

/**
 * The graphics quality the player picked, and the level actually in force.
 *
 * Two values because `auto` is a choice, not a level: the settings row says
 * what automatic has settled on, and the canvas needs both - the choice to know
 * whether it may step down on its own, the level to apply. Held outside React
 * for the same reason the audio settings are: the canvas samples on its own
 * clock and the panel only reads.
 */
let choice: QualityChoice | undefined;
let active: QualityLevel | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function qualityChoice(): QualityChoice {
  choice ??= readQualityChoice(
    (globalThis as { location?: { search?: string } }).location?.search ?? "",
    readStoredQuality()
  );
  return choice;
}

export function setQualityChoice(next: QualityChoice): void {
  choice = next;
  storeQuality(next);
  emit();
}

/** The level the scene is drawing at; undefined until a fight has started. */
export function activeQuality(): QualityLevel | undefined {
  return active;
}

export function setActiveQuality(next: QualityLevel): void {
  if (active === next) return;
  active = next;
  emit();
}

export function subscribeToQuality(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
