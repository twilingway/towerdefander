import { describe, expect, it } from "vitest";

import {
  assistedAimDirection,
  coneForReach,
  lineBlocked,
  segmentIntersectsRect,
  selectAimTarget,
  type AimAssistRequest,
  type AimObstacle,
  type AimTarget
} from "./aimAssist.js";

const SHOOTER = { x: 0, y: 0 };
const CONE = coneForReach(760);

function request(overrides: Partial<AimAssistRequest> = {}): AimAssistRequest {
  return {
    shooter: SHOOTER,
    direction: { x: 1, y: 0 },
    targets: [],
    obstacles: [],
    cone: CONE,
    ...overrides
  };
}

const drone = (x: number, y: number): AimTarget => ({ x, y, radius: 10 });

describe("aim assist cone", () => {
  it("keeps the shipped proportions when scaled to a weapon", () => {
    // The lab's own numbers come back out at the lab's own range.
    expect(CONE.baseTolerance).toBeCloseTo(56, 5);
    expect(CONE.maxTolerance).toBeCloseTo(96, 5);
    // ...and a gun that reaches half as far gets half the corridor.
    expect(coneForReach(380).baseTolerance).toBeCloseTo(28, 5);
  });

  it("locks a target inside the corridor", () => {
    const best = selectAimTarget(request({ targets: [drone(300, 20)] }));
    expect(best).not.toBeNull();
    expect(best?.along).toBeCloseTo(300, 5);
    expect(best?.lateral).toBeCloseTo(20, 5);
  });

  it("ignores a target outside the corridor", () => {
    // 120 sideways is past even the widest the corridor opens.
    expect(selectAimTarget(request({ targets: [drone(300, 120)] }))).toBeNull();
  });

  it("ignores a target behind the shooter", () => {
    expect(selectAimTarget(request({ targets: [drone(-300, 0)] }))).toBeNull();
  });

  it("ignores a target past the reach of the gun", () => {
    expect(selectAimTarget(request({ targets: [drone(900, 0)] }))).toBeNull();
  });

  it("widens the corridor for something big, up to the ceiling", () => {
    // A drone at 70 sideways is out; a boss of the same position is in.
    expect(selectAimTarget(request({ targets: [drone(300, 70)] }))).toBeNull();
    const boss: AimTarget = { x: 300, y: 70, radius: 90 };
    expect(selectAimTarget(request({ targets: [boss] }))).not.toBeNull();
    // But not without limit: the ceiling is 96, so 120 stays out either way.
    expect(selectAimTarget(request({ targets: [{ ...boss, y: 120 }] }))).toBeNull();
  });

  it("prefers the centred target over the near one", () => {
    const near = drone(80, 40);
    const centred = drone(600, 1);
    const best = selectAimTarget(request({ targets: [near, centred] }));
    // Ten-to-one weighting: being on the crosshair beats being close.
    expect(best?.x).toBe(600);
  });

  it("breaks a tie on the crosshair by range", () => {
    const best = selectAimTarget(request({ targets: [drone(600, 0), drone(200, 0)] }));
    expect(best?.x).toBe(200);
  });

  it("does not lock through an obstacle", () => {
    const wall: AimObstacle = { kind: "rectangle", x: 100, y: -50, width: 20, height: 100 };
    expect(selectAimTarget(request({ targets: [drone(300, 0)], obstacles: [wall] }))).toBeNull();
    // The same wall off to one side blocks nothing.
    const aside: AimObstacle = { ...wall, y: 400 };
    expect(
      selectAimTarget(request({ targets: [drone(300, 0)], obstacles: [aside] }))
    ).not.toBeNull();
  });

  it("treats a round rock as its bounding box", () => {
    const rock: AimObstacle = { kind: "circle", x: 150, y: 0, radius: 30 };
    expect(lineBlocked([rock], 0, 0, 300, 0)).toBe(true);
    expect(lineBlocked([rock], 0, 200, 300, 200)).toBe(false);
  });

  it("clips a segment against a box the way Liang-Barsky should", () => {
    const rect = { left: 10, right: 20, top: 10, bottom: 20 };
    expect(segmentIntersectsRect(0, 15, 30, 15, rect)).toBe(true);
    expect(segmentIntersectsRect(0, 0, 5, 5, rect)).toBe(false);
    // A segment that stops short of the box does not reach it.
    expect(segmentIntersectsRect(0, 15, 9, 15, rect)).toBe(false);
    // Degenerate boxes are refused rather than divided by.
    expect(segmentIntersectsRect(0, 15, 30, 15, { left: 10, right: 10, top: 10, bottom: 20 })).toBe(
      false
    );
  });
});

describe("aim assist gate", () => {
  const withTarget = request({ targets: [drone(300, 20)] });

  it("does nothing while the trigger is up", () => {
    const direction = assistedAimDirection(withTarget, { enabled: true, firing: false });
    expect(direction).toEqual(withTarget.direction);
  });

  it("does nothing when it is switched off", () => {
    const direction = assistedAimDirection(withTarget, { enabled: false, firing: true });
    expect(direction).toEqual(withTarget.direction);
  });

  it("names the target's bearing while the trigger is down", () => {
    const direction = assistedAimDirection(withTarget, { enabled: true, firing: true });
    expect(Math.hypot(direction.x, direction.y)).toBeCloseTo(1, 5);
    expect(Math.atan2(direction.y, direction.x)).toBeCloseTo(Math.atan2(20, 300), 5);
  });

  it("leaves the thumb alone when nothing is in the cone", () => {
    const empty = request({ direction: { x: 0, y: -1 }, targets: [drone(300, 20)] });
    expect(assistedAimDirection(empty, { enabled: true, firing: true })).toEqual(empty.direction);
  });

  it("leaves a neutral stick neutral", () => {
    const idle = request({ direction: { x: 0, y: 0 }, targets: [drone(300, 20)] });
    expect(assistedAimDirection(idle, { enabled: true, firing: true })).toEqual(idle.direction);
  });
});
