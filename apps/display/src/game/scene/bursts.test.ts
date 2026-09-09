import { describe, expect, it } from "vitest";

import {
  DEFAULT_BOSS_DEATH_EFFECT,
  DEFAULT_ENEMY_DEATH_EFFECT,
  HIT_EFFECT_MIN_TICKS,
  deathEffectFor,
  mayPlayHitEffect
} from "./bursts.js";

describe("which effect a death plays", () => {
  it("prefers the effect the preset assigned", () => {
    // The whole point of the slots: an operator's choice beats the built-in
    // rule, for the boss and for everything else.
    expect(deathEffectFor("enemy", false, "explosion")).toBe("explosion");
    expect(deathEffectFor("enemy", true, "debris-burst")).toBe("debris-burst");
  });

  it("falls back to the built-in rule when no slot is filled", () => {
    // An unset slot has to mean "as it is now", or turning the console on would
    // silently take the effects away from every archetype nobody has edited.
    expect(deathEffectFor("enemy", true, undefined)).toBe(DEFAULT_BOSS_DEATH_EFFECT);
    expect(deathEffectFor("enemy", false, undefined)).toBe(DEFAULT_ENEMY_DEATH_EFFECT);
    // The room has no optional string, so an unset slot arrives empty.
    expect(deathEffectFor("enemy", false, "")).toBe(DEFAULT_ENEMY_DEATH_EFFECT);
  });

  it("leaves asteroids alone even though they are destructible", () => {
    // A rock can be shot, but it also ages out of its lifetime and drifts out of
    // the arena envelope, and from the removal branch all three look the same.
    // There is a steady stream of them, so bursting here would pop shockwaves in
    // empty space all game.
    expect(deathEffectFor("asteroid", false, undefined)).toBeUndefined();
    expect(deathEffectFor("asteroid", false, "explosion")).toBeUndefined();
  });

  it("leaves shells, missiles and loot alone", () => {
    // These leave the snapshot for reasons that are not death: a shell expires
    // or hits, loot is picked up.
    for (const kind of ["projectile", "missile", "loot"] as const) {
      expect(deathEffectFor(kind, false, undefined)).toBeUndefined();
      expect(deathEffectFor(kind, true, "explosion")).toBeUndefined();
    }
  });
});

describe("hit effect throttle", () => {
  it("plays the first hit a hull takes", () => {
    expect(mayPlayHitEffect(0, undefined)).toBe(true);
    expect(mayPlayHitEffect(5000, undefined)).toBe(true);
  });

  it("refuses a second hit inside the floor", () => {
    // A beam takes hp off every tick. Without the floor the hull would strobe at
    // the tick rate, which is the whole reason this exists.
    expect(mayPlayHitEffect(1, 0)).toBe(false);
    expect(mayPlayHitEffect(HIT_EFFECT_MIN_TICKS - 1, 0)).toBe(false);
  });

  it("allows the next one once the floor has passed", () => {
    expect(mayPlayHitEffect(HIT_EFFECT_MIN_TICKS, 0)).toBe(true);
    expect(mayPlayHitEffect(HIT_EFFECT_MIN_TICKS * 3, 0)).toBe(true);
  });
});
