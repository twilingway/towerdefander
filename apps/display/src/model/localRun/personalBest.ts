/**
 * The best a locally hosted run has reached on this device.
 *
 * On the device and nowhere else, deliberately. A run the device stepped itself
 * is a number the device computed about itself: there is no trace of the input
 * that produced it and no second party that saw it happen, so sending it
 * anywhere would publish a claim nothing can check. The working agreement says
 * the same thing from the other side - nothing a local run computed reaches a
 * server-held record without the server recomputing it.
 *
 * Which also decides the storage: `localStorage`, like the pilot's name. It has
 * to survive a reload and a cold visit to `/solo`, and it is worth exactly as
 * much as the browser profile it lives in.
 */
const KEY = "spaceship-defender:local-best";

export interface LocalBest {
  readonly score: number;
  readonly waveNumber: number;
}

export interface LocalRecord {
  /** The best known after this run, which is this run when it beat the old one. */
  readonly best: LocalBest;
  /** Whether this run is the one that set it. */
  readonly improved: boolean;
}

export function readLocalBest(): LocalBest | null {
  try {
    const global = globalThis as { localStorage?: Storage };
    const stored = global.localStorage?.getItem(KEY);
    if (stored === null || stored === undefined) return null;
    return parseBest(JSON.parse(stored));
  } catch {
    // Unreadable is the same as absent: the next finished run writes over it.
    return null;
  }
}

/**
 * Score decides, and only score.
 *
 * A wave is reached, a score is earned, and the two do not always agree - a run
 * that died early on wave nine can out-score one that timed out on wave ten.
 * The overlay already leads with the score, so ranking by anything else would
 * put a "record" next to a smaller number than the one above it.
 */
export function commitLocalRun(run: LocalBest): LocalRecord {
  const previous = readLocalBest();
  const improved = previous === null || run.score > previous.score;
  if (!improved) return { best: previous, improved: false };
  try {
    const global = globalThis as { localStorage?: Storage };
    global.localStorage?.setItem(KEY, JSON.stringify(run));
  } catch {
    // A device that cannot keep it still gets to see it for this screen.
  }
  return { best: run, improved: true };
}

function parseBest(value: unknown): LocalBest | null {
  if (typeof value !== "object" || value === null) return null;
  const { score, waveNumber } = value as { score?: unknown; waveNumber?: unknown };
  if (!Number.isFinite(score) || !Number.isFinite(waveNumber)) return null;
  return { score: score as number, waveNumber: waveNumber as number };
}
