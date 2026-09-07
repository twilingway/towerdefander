import { describe, expect, it } from "vitest";

import { withPredictedAngles } from "./predictedAngles.js";

const authoritative = { spaceship: { heading: 0.1, x: 5 }, turretAngle: 0.2, tick: 7 };
const predicted = { heading: 1.5, turretAngle: 2.5 };

describe("withPredictedAngles", () => {
  it("hands the canvas the predicted angles while prediction is on", () => {
    const game = withPredictedAngles(authoritative, predicted, true);

    expect(game.spaceship.heading).toBe(1.5);
    expect(game.turretAngle).toBe(2.5);
  });

  it("hands over the authoritative snapshot untouched while prediction is off", () => {
    const game = withPredictedAngles(authoritative, predicted, false);

    expect(game).toBe(authoritative);
    expect(game.spaceship.heading).toBe(0.1);
    expect(game.turretAngle).toBe(0.2);
  });

  it("changes nothing else about the snapshot", () => {
    const game = withPredictedAngles(authoritative, predicted, true);

    expect(game.tick).toBe(7);
    expect(game.spaceship.x).toBe(5);
  });

  it("falls back to the authoritative angles before the first prediction", () => {
    expect(withPredictedAngles(authoritative, undefined, true)).toBe(authoritative);
  });
});
