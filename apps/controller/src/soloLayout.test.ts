import { describe, expect, it } from "vitest";

import type { SessionStorage } from "./reconnectionSession.js";
import {
  DEFAULT_SOLO_LAYOUT,
  SOLO_LAYOUT_KEY,
  readSoloLayout,
  saveSoloLayout,
  soloLayoutLabel
} from "./soloLayout.js";

function memoryStorage(initial: Record<string, string> = {}): SessionStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}

describe("solo layout preference", () => {
  it("falls back to the stacked layout for an empty or unknown value", () => {
    expect(readSoloLayout(memoryStorage())).toBe(DEFAULT_SOLO_LAYOUT);
    expect(readSoloLayout(memoryStorage({ [SOLO_LAYOUT_KEY]: "gamepad" }))).toBe(
      DEFAULT_SOLO_LAYOUT
    );
  });

  it("round-trips the chosen layout", () => {
    const storage = memoryStorage();
    saveSoloLayout(storage, "triggers");
    expect(readSoloLayout(storage)).toBe("triggers");
    saveSoloLayout(storage, "stacked");
    expect(readSoloLayout(storage)).toBe("stacked");
  });

  it("labels both layouts", () => {
    expect(soloLayoutLabel("stacked")).not.toBe(soloLayoutLabel("triggers"));
  });
});
