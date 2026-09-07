import { describe, expect, it } from "vitest";

import { withPredictedPose } from "./predictedAngles.js";

const authoritative = {
  spaceship: { x: 5, y: 6, velocityX: 1, velocityY: 2, heading: 0.1 },
  turretAngle: 0.2,
  tick: 7
};
const predicted = {
  x: 50,
  y: 60,
  velocityX: 10,
  velocityY: 20,
  heading: 1.5,
  turretAngle: 2.5,
  headingAngularVelocity: 0,
  hasHeadingTarget: false,
  headingTargetAngle: 0,
  turretAngularVelocity: 0,
  hasTurretTarget: false,
  turretTargetAngle: 0
};

describe("withPredictedPose", () => {
  it("hands the canvas the ship this page is flying while prediction is on", () => {
    const game = withPredictedPose(authoritative, predicted, true);

    expect(game.spaceship).toMatchObject({ x: 50, y: 60, heading: 1.5 });
    expect(game.turretAngle).toBe(2.5);
  });

  it("hands over the authoritative snapshot untouched while prediction is off", () => {
    const game = withPredictedPose(authoritative, predicted, false);

    expect(game).toBe(authoritative);
  });

  it("changes nothing else about the snapshot", () => {
    expect(withPredictedPose(authoritative, predicted, true).tick).toBe(7);
  });

  it("falls back to the authoritative ship before the first prediction", () => {
    expect(withPredictedPose(authoritative, undefined, true)).toBe(authoritative);
  });
});
