import { describe, expect, it } from "vitest";

import {
  DEFAULT_BOSS_DEATH_EFFECT,
  OWN_MUZZLE_EFFECTS,
  burstWidth,
  placeOwnShots,
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

describe("placing the crew's own flashes", () => {
  /** Records what the layer was asked to draw, in place of a scene. */
  function recorder() {
    const calls: {
      effectId: string;
      x: number;
      y: number;
      radius: number;
      heading: number | undefined;
      followKey: string | undefined;
    }[] = [];
    const followed: { followKey: string; x: number; y: number; heading: number }[] = [];
    return {
      calls,
      followed,
      spawn(
        effectId: string,
        x: number,
        y: number,
        radius: number,
        heading?: number,
        followKey?: string
      ) {
        calls.push({ effectId, x, y, radius, heading, followKey });
      },
      followMuzzle(followKey: string, point: { x: number; y: number }, heading: number) {
        followed.push({ followKey, x: point.x, y: point.y, heading });
      }
    };
  }

  /** Turret aimed along +Y, hull along +X: the two must not be confused. */
  const POSE = {
    mount: { x: 200, y: 100 },
    hull: { x: 180, y: 100 },
    heading: 0,
    turretRotation: Math.PI / 2,
    hullRadius: 26
  } as const;

  it("puts the cannon's flash on the turret, along the turret", () => {
    // The reported bug in one assertion: with the turret turned across the hull
    // the flash has to follow the turret. Reading the hull's heading here is
    // what made it lag and stretch away from the gun.
    const sink = recorder();
    placeOwnShots(sink, [{ source: "cannon", shellRadius: 4 }], POSE);
    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0]?.effectId).toBe("muzzle-flash");
    expect(sink.calls[0]?.x).toBeCloseTo(200, 9);
    expect(sink.calls[0]?.y).toBeCloseTo(130, 9);
    expect(sink.calls[0]?.heading).toBeCloseTo(Math.PI / 2, 9);
  });

  it("puts the nose gun's flash on the hull, along the hull, and warm", () => {
    const sink = recorder();
    placeOwnShots(sink, [{ source: "machineGun", shellRadius: 2 }], POSE);
    expect(sink.calls[0]?.effectId).toBe("muzzle-flash-mg");
    expect(sink.calls[0]?.x).toBeCloseTo(208, 9);
    expect(sink.calls[0]?.y).toBeCloseTo(100, 9);
    expect(sink.calls[0]?.heading).toBeCloseTo(0, 9);
  });

  it("gives the two guns different effects", () => {
    // A machine gun wearing the cannon's plasma blue read as the same weapon
    // firing twice.
    expect(OWN_MUZZLE_EFFECTS.cannon).not.toBe(OWN_MUZZLE_EFFECTS.machineGun);
  });

  it("drags a flash already playing back onto the barrel", () => {
    // A flash left where it was fired is honest and reads wrong: at full speed
    // the hull covers 149 units inside the 0.24s it lasts, so it looks like the
    // flash fell off the gun. Every frame puts it back.
    const sink = recorder();
    placeOwnShots(sink, [], POSE);
    const cannon = sink.followed.find((f) => f.followKey === "cannon");
    expect(cannon?.x).toBeCloseTo(200, 9);
    expect(cannon?.y).toBeCloseTo(129, 9);
    expect(cannon?.heading).toBeCloseTo(Math.PI / 2, 9);
    const mg = sink.followed.find((f) => f.followKey === "machineGun");
    expect(mg?.y).toBeCloseTo(100, 9);
    expect(mg?.heading).toBeCloseTo(0, 9);
  });

  it("claims only its own two flashes, never a whole effect", () => {
    /*
     * The regression this stands on. The crew's cannon and an enemy's gun fire
     * the same effect out of the same pool, so following "everything playing of
     * this effect" dragged every enemy's flash onto the crew's muzzle the frame
     * after it appeared - the enemies looked like they had stopped firing
     * altogether. What may be dragged is named by the barrel, not by the art.
     */
    const sink = recorder();
    placeOwnShots(sink, [{ source: "cannon", shellRadius: 4 }], POSE);
    expect(sink.calls[0]?.followKey).toBe("cannon");
    expect(sink.followed.map((f) => f.followKey).sort()).toEqual(["cannon", "machineGun"]);
    for (const claimed of sink.followed) {
      expect(["cannon", "machineGun"]).toContain(claimed.followKey);
      expect(claimed.followKey).not.toBe("muzzle-flash");
    }
  });

  it("empties the queue, even with no layer to draw into", () => {
    // The atlas may not have landed yet; the shot is still spent.
    const shots = [
      { source: "cannon" as const, shellRadius: 4 },
      { source: "machineGun" as const, shellRadius: 2 }
    ];
    placeOwnShots(undefined, shots, POSE);
    expect(shots).toHaveLength(0);
  });
});

describe("how wide a burst is drawn", () => {
  it("keeps a small hull's muzzle flash big enough to see", () => {
    // An interceptor is radius 18 against the crew's 52. Scaling purely by hull
    // made its flash a third of theirs, and the multiplier that stops the crew's
    // flash covering their own ship then left the enemy's invisible. A flash
    // belongs to the gun, so it has a floor.
    expect(burstWidth("muzzle", 18)).toBeGreaterThan(18 * 2);
    expect(burstWidth("muzzle", 18)).toBe(burstWidth("muzzle", 20));
  });

  it("still lets a big hull scale past the floor", () => {
    // The crew's own flash was too big before and must not be pinned to the
    // floor now: above it, the hull decides again.
    expect(burstWidth("muzzle", 52)).toBeGreaterThan(burstWidth("muzzle", 18));
  });

  it("keeps a splash on the shield visible whatever made it", () => {
    // Sized off the shell rather than a hull, and a shell is radius 2 to 4: with
    // no floor the splash would be a few pixels across on a barrier 104 units
    // out, which is the same mistake the enemy muzzle flash made.
    expect(burstWidth("shield", 3)).toBeGreaterThan(3 * 4);
    expect(burstWidth("shield", 2)).toBe(burstWidth("shield", 4));
  });

  it("leaves the blast effects scaling by hull alone", () => {
    // A boss should tear a bigger hole than an interceptor, with no floor
    // flattening the difference.
    expect(burstWidth("explosion", 90) / burstWidth("explosion", 18)).toBeCloseTo(5, 6);
    expect(burstWidth("destruction", 90) / burstWidth("destruction", 18)).toBeCloseTo(5, 6);
  });
});
