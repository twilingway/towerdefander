/**
 * The name the pilot typed on the setup screen, kept for the run that follows.
 *
 * Not in the address: a name is not a switch, and putting it there would spell
 * it out in every link and every screenshot. Not in router state either - a
 * local run has to survive a reload and a cold visit to its own address, which
 * is exactly what router state does not.
 */
const KEY = "spaceship-defender:pilot-name";
const FALLBACK = "Пилот";

export function rememberPilotName(name: string): void {
  try {
    const global = globalThis as { localStorage?: Storage };
    global.localStorage?.setItem(KEY, name);
  } catch {
    // A device that cannot keep it still gets to fly; the roster reads the
    // fallback and nothing else depends on the name.
  }
}

export function readPilotName(): string {
  try {
    const global = globalThis as { localStorage?: Storage };
    const stored = global.localStorage?.getItem(KEY)?.trim();
    return stored !== undefined && stored.length > 0 ? stored : FALLBACK;
  } catch {
    return FALLBACK;
  }
}
