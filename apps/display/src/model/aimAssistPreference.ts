export const AIM_ASSIST_KEY = "spaceship-defender.cockpit-aim-assist";

/** The narrow slice of `Storage` this needs, so a test can hand over a map. */
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Whether the cockpit's aim assist is on for this device.
 *
 * On by default: a thumb on glass is a coarser instrument than a mouse, and the
 * assist is what makes the same fight winnable with one. It stays a preference
 * because some people would rather miss their own way, and it stays on the
 * device rather than in the room because it changes nothing anybody else sees.
 */
export function readAimAssistEnabled(storage: PreferenceStorage): boolean {
  return storage.getItem(AIM_ASSIST_KEY) !== "off";
}

export function saveAimAssistEnabled(storage: PreferenceStorage, enabled: boolean): void {
  storage.setItem(AIM_ASSIST_KEY, enabled ? "on" : "off");
}

/**
 * The same question asked of whatever device is actually running.
 *
 * Guarded twice over, and both guards earn their keep: the component tests
 * render through `renderToStaticMarkup` with no DOM at all, and a real browser
 * in private mode can throw on the property access itself. Either way the
 * answer is the default, which is the help being on.
 */
export function readAimAssistFromDevice(): boolean {
  try {
    if (typeof window === "undefined") return true;
    return readAimAssistEnabled(window.localStorage);
  } catch {
    return true;
  }
}

/** Saving is best-effort for the same reasons; a refusal loses a preference. */
export function saveAimAssistToDevice(enabled: boolean): void {
  try {
    if (typeof window === "undefined") return;
    saveAimAssistEnabled(window.localStorage, enabled);
  } catch {
    // A device that will not remember still plays; it just forgets.
  }
}
