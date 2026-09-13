import { describe, expect, it } from "vitest";

import { deathSoundFor, shotSoundFor } from "./sceneAudio.js";

describe("what the field is heard as when the preset says nothing", () => {
  /**
   * Thirty archetypes carry no sound at all, so without a default the whole of
   * "enemy shots" - the switch in the settings window included - looked broken:
   * a crowd shooting at the player was silent while the player's own guns were
   * not.
   */
  it("gives an enemy a shot to be heard firing", () => {
    expect(shotSoundFor("enemy", false, undefined)).toBe("machine-gun");
    // A boss reports heavier: the one enemy worth telling apart by ear.
    expect(shotSoundFor("enemy", true, undefined)).toBe("cannon");
    // And the preset always wins over the fallback.
    expect(shotSoundFor("enemy", true, "machine-gun-alt")).toBe("machine-gun-alt");
  });

  it("leaves everything that is not a ship silent", () => {
    expect(shotSoundFor("asteroid", false, undefined)).toBeUndefined();
    expect(shotSoundFor("projectile", false, undefined)).toBeUndefined();
    expect(deathSoundFor("asteroid", false, undefined)).toBeUndefined();
  });

  it("gives a wreck its explosion, and a boss its own", () => {
    expect(deathSoundFor("enemy", false, undefined)).toBe("explosion");
    expect(deathSoundFor("enemy", true, undefined)).toBe("boss-explosion");
    expect(deathSoundFor("enemy", true, "cannon")).toBe("cannon");
  });
});
