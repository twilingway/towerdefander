import {
  advanceShipPose,
  createSpaceshipSimulationConfig,
  type ShipPose
} from "@spaceship-defender/game-core";
import { describe, expect, it } from "vitest";

import {
  stepPredictedPose,
  toDriveIntent,
  toShipPose,
  toShipStats,
  type PredictedInputFrame,
  type PredictedPoseFrame
} from "./shipPrediction.js";

const config = createSpaceshipSimulationConfig();

const drive = {
  revision: 1,
  speedPerSecond: 320,
  accelerationPerSecondSquared: 640,
  brakingPerSecondSquared: 800,
  reverseSpeedFactor: 0.4,
  headingMaxAngularSpeed: Math.PI,
  headingAngularAcceleration: 50,
  headingAngularBraking: 50,
  turretMaxAngularSpeed: 1.36,
  turretAngularAcceleration: 2.72,
  turretAngularBraking: 4.08,
  hullRadius: 52
};
const stats = toShipStats(drive);

function restingFrame(): PredictedPoseFrame {
  return {
    x: config.worldWidth / 2,
    y: config.worldHeight / 2,
    velocityX: 0,
    velocityY: 0,
    heading: 0,
    turretAngle: 0,
    headingAngularVelocity: 0,
    hasHeadingTarget: false,
    headingTargetAngle: 0,
    turretAngularVelocity: 0,
    hasTurretTarget: false,
    turretTargetAngle: 0
  };
}

function inputAt(frame: number): PredictedInputFrame {
  return {
    vectorX: 0,
    vectorY: 0,
    hasHelm: true,
    turn: Math.sin(frame * 0.31),
    thrust: Math.cos(frame * 0.17),
    aimX: Math.cos(frame * 0.11),
    aimY: Math.sin(frame * 0.11),
    hasAimTurn: false,
    aimTurn: 0
  };
}

describe("toDriveIntent", () => {
  it("reads an absent helm as no command rather than as zero", () => {
    const intent = toDriveIntent(
      { ...inputAt(0), hasHelm: false, turn: 0.5, thrust: 0.5 },
      restingFrame()
    );

    // Zero is "stop turning", which is an order. Absent is silence.
    expect(intent.turn).toBeNull();
    expect(intent.thrust).toBeNull();
  });

  it("derives the hull's bearing from the drive vector, as the room does", () => {
    /*
     * The bug this exists for: the room computes a fresh target from the stick
     * every frame, and a replay that merely carried the last published one
     * steered nowhere at all - the ship simply would not turn under prediction.
     */
    const intent = toDriveIntent(
      { ...inputAt(0), hasHelm: false, vectorX: 0, vectorY: 1 },
      restingFrame()
    );

    expect(intent.headingTargetAngle).toBeCloseTo(Math.atan2(1, 0), 12);
  });

  it("keeps the hull's bearing when the drive stick is released", () => {
    const held = { ...restingFrame(), hasHeadingTarget: true, headingTargetAngle: 0.75 };
    const intent = toDriveIntent({ ...inputAt(0), hasHelm: false, vectorX: 0, vectorY: 0 }, held);

    expect(intent.headingTargetAngle).toBe(0.75);
  });

  it("drops the bearing when a spin is asked for instead", () => {
    const held = { ...restingFrame(), hasHeadingTarget: true, headingTargetAngle: 0.75 };
    const intent = toDriveIntent({ ...inputAt(0), hasHelm: true, turn: 1 }, held);

    // A spin names no bearing; keeping one would pull the hull back to it.
    expect(intent.headingTargetAngle).toBeNull();
  });

  it("names the same bearing from an aim vector that the room stores", () => {
    const intent = toDriveIntent({ ...inputAt(0), aimX: 0, aimY: 1 }, restingFrame());

    expect(intent.turretTargetAngle).toBeCloseTo(Math.atan2(1, 0), 12);
  });

  it("keeps the bearing when the aim stick is released", () => {
    const held = { ...restingFrame(), hasTurretTarget: true, turretTargetAngle: 1.25 };
    const intent = toDriveIntent({ ...inputAt(0), aimX: 0, aimY: 0 }, held);

    expect(intent.turretTargetAngle).toBe(1.25);
  });
});

describe("stepPredictedPose", () => {
  it("turns the ship when the stick is held to one side", () => {
    // The end the player actually judges: a held stick has to move the hull.
    const pose = restingFrame();
    const held: PredictedInputFrame = {
      ...inputAt(0),
      hasHelm: false,
      vectorX: 0,
      vectorY: 1,
      aimX: 0,
      aimY: 0
    };

    for (let frame = 0; frame < 20; frame += 1) {
      stepPredictedPose(pose, held, config, stats);
    }

    expect(pose.heading).toBeGreaterThan(0.2);
  });

  it("loses nothing the core step carries, over a long replay", () => {
    /*
     * The point of the check: the wire pose is flat with flags where the step
     * has nullable bearings, and every frame goes out and back through that
     * translation. A field dropped on the way is not visible in one step - it
     * shows up as a ship that drifts, hundreds of steps later.
     */
    const flat = restingFrame();
    let structured: ShipPose = toShipPose(restingFrame());

    for (let frame = 0; frame < 300; frame += 1) {
      const input = inputAt(frame);
      stepPredictedPose(flat, input, config, stats);
      structured = advanceShipPose(
        structured,
        toDriveIntent(input, {
          ...restingFrame(),
          hasHeadingTarget: structured.headingTargetAngle !== null,
          headingTargetAngle: structured.headingTargetAngle ?? 0,
          hasTurretTarget: structured.turretTargetAngle !== null,
          turretTargetAngle: structured.turretTargetAngle ?? 0
        }),
        config,
        stats
      );
    }

    /*
     * Compared on what the step reads, which is what a replay can be wrong
     * about. `moveSpaceshipWithinWorld` also writes `previousX`/`previousY` -
     * the trail the world step sweeps collisions along - but nothing in the
     * pose step ever reads them back, so they cannot change a trajectory and
     * have no reason to travel.
     */
    const readSet = (pose: ShipPose) => ({
      ...pose,
      spaceship: { x: pose.spaceship.x, y: pose.spaceship.y, velocity: pose.spaceship.velocity }
    });

    expect(readSet(toShipPose(flat))).toEqual(readSet(structured));
  });
});
