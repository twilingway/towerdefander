import { describe, expect, it } from "vitest";

import { createSpaceshipSimulationConfig } from "./spaceshipSimulation.ts";
import { shipStatsFromConfig, type ShipStats } from "./shipStats.ts";
import {
  SHIP_POSE_STAT_FIELDS,
  advanceShipPose,
  type ShipDriveIntent,
  type ShipPose
} from "./shipPose.ts";

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

describe("SHIP_POSE_STAT_FIELDS", () => {
  /**
   * A flight that touches every part of the drive: a burn, a coast, a reverse,
   * a hull spin and a turret closing on a bearing. Without all five, a stat
   * could go missing from the list and nothing would notice.
   */
  function mixedFlight(stats: ShipStats): ShipPose {
    let pose = restingPose();
    // Counted in seconds rather than in frames: the phases below are durations,
    // and at a finer rate the same flight simply takes more steps.
    const frames = Math.round(4500 / config.fixedStepMs);
    const phaseFrames = Math.round(frames / 5);
    const aimAt = Math.round(2000 / config.fixedStepMs);
    for (let frame = 0; frame < frames; frame += 1) {
      const phase = Math.floor(frame / phaseFrames);
      pose = advanceShipPose(
        pose,
        {
          driveVector: { x: 0, y: 0 },
          turn: phase === 3 ? 0 : 1,
          thrust: phase === 1 ? 0 : phase === 2 ? -1 : 1,
          headingTargetAngle: null,
          /*
           * Half a turn away, with half the flight left to cover it.
           *
           * Timed so the traverse does all three things and is caught in the
           * last of them: half a second accelerating, most of the way held at
           * its ceiling, and still braking into the bearing when the flight
           * ends. A bearing it settles on hides every number that got it there,
           * and one that runs away keeps the remaining angle so small that the
           * braking bound binds instead of the ceiling - so neither of those
           * would prove anything.
           */
          turretTargetAngle: frame >= aimAt ? Math.PI : null,
          turretTurn: null
        },
        config,
        stats
      );
    }
    return pose;
  }

  it("names a stat only while the step still reads it", () => {
    const baseline = mixedFlight(ship);

    const RIM_ONLY = "spaceshipRadius";
    const inert = SHIP_POSE_STAT_FIELDS.filter((field) => {
      if (field === RIM_ONLY) return false;
      const moved = mixedFlight({ ...ship, [field]: ship[field] * 1.5 + 0.1 });
      return JSON.stringify(moved) === JSON.stringify(baseline);
    });

    // Named rather than counted: a field listed here that changes nothing has
    // either left the step - and has no business on the wire - or the flight
    // above stopped exercising the part that uses it.
    expect(inert).toEqual([]);
  });

  it("reads the hull's own size where the arena holds it", () => {
    // The one stat the flight above cannot show: the radius only matters at the
    // rim, and a ship circling the middle never touches it.
    function pressIntoRim(stats: typeof ship): ShipPose {
      let pose: ShipPose = {
        ...restingPose(),
        spaceship: {
          x: config.worldWidth / 2 + config.arenaRadius - 40,
          y: config.worldHeight / 2,
          velocity: { x: 0, y: 0 }
        }
      };
      for (let frame = 0; frame < 40; frame += 1) {
        pose = advanceShipPose(
          pose,
          {
            driveVector: { x: 1, y: 0 },
            turn: null,
            thrust: null,
            headingTargetAngle: null,
            turretTargetAngle: null,
            turretTurn: null
          },
          config,
          stats
        );
      }
      return pose;
    }

    expect(pressIntoRim({ ...ship, spaceshipRadius: ship.spaceshipRadius * 2 })).not.toEqual(
      pressIntoRim(ship)
    );
  });
});
