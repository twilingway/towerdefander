/**
 * Whether the settings window - the game's pause - is open.
 *
 * Out of the panel's own state because two others need it: the system back in
 * the installed app opens and closes it, and a local run holds still while it
 * is open, since nothing a player reads there should cost them the fight.
 */

let open = false;
const listeners = new Set<() => void>();

export function settingsOpen(): boolean {
  return open;
}

export function setSettingsOpen(next: boolean): void {
  if (next === open) return;
  open = next;
  for (const listener of listeners) listener();
}

export function subscribeToSettingsWindow(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
