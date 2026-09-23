import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { commitLocalRun, readLocalBest } from "./personalBest.js";

const KEY = "spaceship-defender:local-best";

/**
 * These tests run without a DOM, so the storage is supplied rather than
 * cleared. Which is the more useful shape anyway: the module reads
 * `globalThis.localStorage` defensively because a device can refuse it, and
 * that refusal is one of the cases below.
 */
function installStorage(): Map<string, string> {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    }
  };
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  return entries;
}

describe("local personal best", () => {
  let entries: Map<string, string>;

  beforeEach(() => {
    entries = installStorage();
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("takes the first finished run as the record", () => {
    expect(readLocalBest()).toBeNull();
    expect(commitLocalRun({ score: 120, waveNumber: 3 })).toEqual({
      best: { score: 120, waveNumber: 3 },
      improved: true
    });
    expect(readLocalBest()).toEqual({ score: 120, waveNumber: 3 });
  });

  it("keeps the higher score even when the later run reached a further wave", () => {
    commitLocalRun({ score: 900, waveNumber: 4 });
    const record = commitLocalRun({ score: 700, waveNumber: 9 });
    expect(record).toEqual({ best: { score: 900, waveNumber: 4 }, improved: false });
    expect(readLocalBest()).toEqual({ score: 900, waveNumber: 4 });
  });

  it("treats a damaged entry as no record at all", () => {
    entries.set(KEY, "{ not json");
    expect(readLocalBest()).toBeNull();
    entries.set(KEY, JSON.stringify({ score: "лучший", waveNumber: 2 }));
    expect(readLocalBest()).toBeNull();
    expect(commitLocalRun({ score: 10, waveNumber: 1 }).improved).toBe(true);
  });

  it("still names this run the best when the device refuses to keep it", () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(commitLocalRun({ score: 55, waveNumber: 2 })).toEqual({
      best: { score: 55, waveNumber: 2 },
      improved: true
    });
  });
});
