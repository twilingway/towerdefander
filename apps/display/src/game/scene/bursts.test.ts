import { describe, expect, it } from "vitest";

import { burstKindFor } from "./bursts.js";

describe("which burst a removal earns", () => {
  it("gives the fireball to the boss and only to the boss", () => {
    // Reserved on purpose: an explosion on every interceptor stops reading as
    // an event before the wave is half over. `isBoss` is authoritative, sent
    // once per run so the display never has to guess one.
    expect(burstKindFor("enemy", true)).toBe("explosion");
    expect(burstKindFor("enemy", false)).toBe("debris");
  });

  it("leaves asteroids alone even though they are destructible", () => {
    // A rock can be shot, but it also ages out of `asteroidLifetimeTicks` and
    // drifts out of the arena envelope, and from the removal branch all three
    // look the same. There is a steady stream of them, so bursting here would
    // pop shockwaves in empty space all game.
    expect(burstKindFor("asteroid", false)).toBeUndefined();
    expect(burstKindFor("asteroid", true)).toBeUndefined();
  });

  it("leaves shells, missiles and loot alone", () => {
    // These leave the snapshot for reasons that are not death: a shell expires
    // or hits, loot is picked up. Bursting on those would fire an explosion
    // every time anybody shot anything.
    for (const kind of ["projectile", "missile", "loot"] as const) {
      expect(burstKindFor(kind, false)).toBeUndefined();
      expect(burstKindFor(kind, true)).toBeUndefined();
    }
  });
});
