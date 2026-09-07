import { describe, expect, it } from "vitest";

import { createSpaceshipSimulationConfig } from "./spaceshipSimulation.ts";
import { shipStatsFromConfig } from "./shipStats.ts";
import { advanceShipPose, type ShipDriveIntent, type ShipPose } from "./shipPose.ts";

const config = createSpaceshipSimulationConfig();
const ship = shipStatsFromConfig(config);

function restingPose(): ShipPose {
  return {
    spaceship: {
      x: config.worldWidth / 2,
      y: config.worldHeight / 2,
      velocity: { x: 0, y: 0 }
    },
    heading: 0,
    headingTargetAngle: null,
    headingAngularVelocity: 0,
    turretAngle: 0,
    turretTargetAngle: null,
    turretAngularVelocity: 0
  };
}

/** A seeded wobble, so the sequence is varied without being random. */
function intentAt(frame: number): ShipDriveIntent {
  const wave = Math.sin(frame * 0.37);
  return {
    driveVector: { x: 0, y: 0 },
    turn: wave,
    thrust: Math.cos(frame * 0.21),
    headingTargetAngle: null,
    turretTargetAngle: wave > 0 ? wave : null,
    turretTurn: null
  };
}

function fly(frames: number, flipped?: number): ShipPose {
  let pose = restingPose();
  for (let frame = 0; frame < frames; frame += 1) {
    const intent = intentAt(frame);
    pose = advanceShipPose(
      pose,
      frame === flipped ? { ...intent, turn: -(intent.turn ?? 0) } : intent,
      config,
      ship
    );
  }
  return pose;
}

describe("advanceShipPose", () => {
  it("gives the same ship twice from the same input", () => {
    // The whole premise of replaying an input the server has not acknowledged
    // yet: the client has to arrive where the room did.
    expect(fly(240)).toEqual(fly(240));
  });

  it("would notice if one frame of that input changed", () => {
    // The control that makes the check above worth anything. Without it a step
    // that ignored its input entirely would pass.
    expect(fly(240, 120)).not.toEqual(fly(240));
  });

  it("pushes along the nose when a thrust is given, not along the stick", () => {
    const pose = advanceShipPose(
      { ...restingPose(), heading: Math.PI / 2 },
      {
        driveVector: { x: 1, y: 0 },
        turn: 0,
        thrust: 1,
        headingTargetAngle: null,
        turretTargetAngle: null,
        turretTurn: null
      },
      config,
      ship
    );

    // Heading is straight down the +y axis, so a nose-aligned burn has no x.
    expect(Math.abs(pose.spaceship.velocity.x)).toBeLessThan(1e-9);
    expect(pose.spaceship.velocity.y).toBeGreaterThan(0);
  });

  it("carries the gun with the hull only when the turret is mounted on it", () => {
    const turning: ShipDriveIntent = {
      driveVector: { x: 0, y: 0 },
      turn: 1,
      thrust: 0,
      headingTargetAngle: null,
      turretTargetAngle: null,
      turretTurn: null
    };
    const mounted = advanceShipPose(
      restingPose(),
      turning,
      createSpaceshipSimulationConfig({ turretMountedOnHull: true }),
      ship
    );
    const free = advanceShipPose(
      restingPose(),
      turning,
      createSpaceshipSimulationConfig({ turretMountedOnHull: false }),
      ship
    );

    expect(mounted.heading).toBeCloseTo(free.heading, 12);
    expect(mounted.turretAngle).not.toBeCloseTo(free.turretAngle, 12);
  });
});
