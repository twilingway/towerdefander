import { describe, expect, it } from "vitest";

import {
  AIM_ASSIST_KEY,
  readAimAssistEnabled,
  saveAimAssistEnabled,
  type PreferenceStorage
} from "./aimAssistPreference.js";

function storage(initial: Record<string, string> = {}): PreferenceStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    }
  };
}

describe("aim assist preference", () => {
  it("is on for a device that has never said otherwise", () => {
    expect(readAimAssistEnabled(storage())).toBe(true);
  });

  it("remembers a player who switched it off", () => {
    const device = storage();
    saveAimAssistEnabled(device, false);
    expect(device.getItem(AIM_ASSIST_KEY)).toBe("off");
    expect(readAimAssistEnabled(device)).toBe(false);
  });

  it("comes back on when switched back on", () => {
    const device = storage({ [AIM_ASSIST_KEY]: "off" });
    saveAimAssistEnabled(device, true);
    expect(readAimAssistEnabled(device)).toBe(true);
  });

  it("treats anything it does not recognise as on", () => {
    // Only an explicit "off" turns it off, so a stale or corrupted value leaves
    // the player with the help rather than silently without it.
    expect(readAimAssistEnabled(storage({ [AIM_ASSIST_KEY]: "yes please" }))).toBe(true);
  });
});
