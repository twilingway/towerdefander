import { describe, expect, it } from "vitest";

import { pickFocusedTarget, type FocusCandidate } from "./combatFocus.js";

function ship(entityId: string, x: number, y: number, radius = 30): FocusCandidate {
  return { entityId, x, y, radius };
}

const ORIGIN = { x: 0, y: 0 };

describe("pickFocusedTarget", () => {
  it("takes the ship the barrel is crossing", () => {
    const focus = pickFocusedTarget({
      origin: ORIGIN,
      bearing: 0,
      reach: 900,
      candidates: [ship("ahead", 400, 0), ship("abeam", 0, 400)]
    });
    expect(focus?.target.entityId).toBe("ahead");
  });

  it("takes the nearer of two on the same line, because the shot stops there", () => {
    const focus = pickFocusedTarget({
      origin: ORIGIN,
      bearing: 0,
      reach: 900,
      candidates: [ship("far", 700, 0), ship("near", 300, 0)]
    });
    expect(focus?.target.entityId).toBe("near");
  });

  it("holds nothing beyond the barrel's reach", () => {
    const focus = pickFocusedTarget({
      origin: ORIGIN,
      bearing: 0,
      reach: 500,
      candidates: [ship("distant", 700, 0)]
    });
    expect(focus).toBeUndefined();
  });

  it("counts a big hull as hittable through more aim error than a small one", () => {
    // Both at the same range and the same angle off the bore; only the size
    // differs, which is exactly how it reads down the barrel. Either is held -
    // the gunner is plainly working it - but only the big one can be hit from
    // here.
    const offBore = { origin: ORIGIN, bearing: 0, reach: 900 };
    const at = (radius: number) => [{ entityId: "target", x: 500, y: 40, radius }];
    expect(pickFocusedTarget({ ...offBore, candidates: at(60) })?.firable).toBe(true);
    expect(pickFocusedTarget({ ...offBore, candidates: at(8) })?.target.entityId).toBe("target");
    expect(pickFocusedTarget({ ...offBore, candidates: at(8) })?.firable).toBe(false);
  });

  it("gives a lock the last word, whatever the barrel is pointing at", () => {
    // The seam for an aim assist or a tapped target: naming one settles it.
    const focus = pickFocusedTarget({
      origin: ORIGIN,
      bearing: 0,
      reach: 900,
      candidates: [ship("ahead", 400, 0), ship("behind", -400, 0)],
      lockedEntityId: "behind"
    });
    expect(focus?.target.entityId).toBe("behind");
  });

  it("drops a lock on something no longer on the field", () => {
    const focus = pickFocusedTarget({
      origin: ORIGIN,
      bearing: 0,
      reach: 900,
      candidates: [ship("ahead", 400, 0)],
      lockedEntityId: "destroyed"
    });
    expect(focus).toBeUndefined();
  });

  it("says whether a shot would land, which is not the same as being held", () => {
    // Held from last frame while the barrel has drifted off it: the ring stays
    // on the ship, but it is no longer green, because a shot now misses.
    const drifted = pickFocusedTarget({
      origin: ORIGIN,
      bearing: 0.12,
      reach: 900,
      candidates: [ship("worked", 500, 0)],
      heldEntityId: "worked"
    });
    expect(drifted?.target.entityId).toBe("worked");
    expect(drifted?.firable).toBe(false);

    // Barrel back on it: green.
    const onIt = pickFocusedTarget({
      origin: ORIGIN,
      bearing: 0,
      reach: 900,
      candidates: [ship("worked", 500, 0)],
      heldEntityId: "worked"
    });
    expect(onIt?.firable).toBe(true);
  });

  it("keeps the ship being worked when another crosses the barrel", () => {
    const crossing = pickFocusedTarget({
      origin: ORIGIN,
      bearing: 0,
      reach: 900,
      candidates: [ship("worked", 500, 30), ship("passing", 300, 0)],
      heldEntityId: "worked"
    });
    expect(crossing?.target.entityId).toBe("worked");
  });

  it("lets a held target go once it is well off the barrel", () => {
    const gone = pickFocusedTarget({
      origin: ORIGIN,
      bearing: Math.PI / 2,
      reach: 900,
      candidates: [ship("worked", 500, 0)],
      heldEntityId: "worked"
    });
    expect(gone).toBeUndefined();
  });

  it("marks the ship a led shot would meet, not the spot it is standing on", () => {
    // Crossing at 300 units a second, 600 out: a shell at 1000 a second meets it
    // about a fifth of a second ahead, which is a good ten degrees off where the
    // ship is now - far outside the bore. Laid on the meeting point, the barrel
    // is doing exactly the right thing, and the ring has to agree.
    const crossing = { entityId: "crossing", x: 600, y: 0, radius: 30, velocityY: 300 };
    const lead = Math.atan2(300 * (600 / 1000), 600);

    const led = pickFocusedTarget({
      origin: ORIGIN,
      bearing: lead,
      reach: 900,
      speed: 1000,
      candidates: [crossing]
    });
    expect(led?.firable).toBe(true);

    // And a barrel laid straight at the ship is the one that misses.
    const straight = pickFocusedTarget({
      origin: ORIGIN,
      bearing: 0,
      reach: 900,
      speed: 1000,
      candidates: [crossing]
    });
    expect(straight?.firable).toBeFalsy();
  });

  it("never leads a beam, which arrives where it is pointed", () => {
    const crossing = { entityId: "crossing", x: 600, y: 0, radius: 30, velocityY: 300 };
    const onIt = pickFocusedTarget({
      origin: ORIGIN,
      bearing: 0,
      reach: 900,
      speed: 0,
      candidates: [crossing]
    });
    expect(onIt?.firable).toBe(true);
  });

  it("keeps the ring on a ship the barrel is still swinging onto", () => {
    // Circling a target and bringing the mount round: the ring belongs on it for
    // the whole swing, white until the barrel arrives and green after. Without
    // this the mark vanished for exactly the seconds the gunner needed it.
    const worked = ship("worked", 500, 0, 30);
    const swinging = pickFocusedTarget({
      origin: ORIGIN,
      bearing: 0.45,
      reach: 900,
      candidates: [worked],
      heldEntityId: "worked"
    });
    expect(swinging?.target.entityId).toBe("worked");
    expect(swinging?.firable).toBe(false);
  });

  it("takes a ship the barrel is merely near, before the bore is on it", () => {
    const acquiring = pickFocusedTarget({
      origin: ORIGIN,
      bearing: 0.4,
      reach: 900,
      candidates: [ship("worked", 500, 0, 30)]
    });
    expect(acquiring?.target.entityId).toBe("worked");
    expect(acquiring?.firable).toBe(false);
  });
});
