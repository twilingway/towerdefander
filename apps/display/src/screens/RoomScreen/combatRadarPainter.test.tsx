import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import {
  drawCombatRadar,
  easeRing,
  hullStroke,
  RADAR_UNITS,
  ringFraction
} from "./combatRadarPainter.js";
import type { RadarContext } from "./combatRadarPainter.js";

const baseGame: DisplayGameSnapshot = {
  tick: 1,
  elapsedMs: 50,
  worldWidth: 4_400,
  cameraViewWidth: 1600,
  serverStepMs: 0.14,
  appliedInputSeq: 0,
  drive: {
    revision: 0,
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
  },
  pose: {
    x: 2200,
    y: 2200,
    velocityX: 0,
    velocityY: 0,
    heading: 0,
    turretAngle: 0,
    headingAngularVelocity: 0,
    headingTargetAngle: null,
    turretAngularVelocity: 0,
    turretTargetAngle: null
  },
  background: { parallaxStrength: 1, driftSpeed: 1, nebulaAlpha: 0.72, nebulaPreset: "blue" },
  worldHeight: 4_400,
  arenaRadius: 2_200,
  helm: {
    scheme: "tank" as const,
    headingLeadRadians: 0.45,
    stopDampening: 1,
    rotateInPlaceThrottle: 0.02,
    hullAngularBrakingPerSecondSquared: 50,
    hullAngularMaxSpeed: 3.14159,
    hullAngularAcceleration: 50,
    turretAngularMaxSpeed: 1.36,
    turretAngularAcceleration: 2.72,
    turretAngularBraking: 4.08,
    turretMountedOnHull: false,
    driveDeadzoneShare: 0,
    aimDeadzoneShare: 0,
    driveZoneShare: 0.42,
    aimProjectionShare: 0.58,
    headingDeadbandRadians: 0.05236,
    headingFilterSeconds: 0.06,
    turretLeadRadians: 0.45
  },
  rimBandWidth: 260,
  shieldPhase: "down",
  purchasedModules: [],
  spaceship: {
    x: 2_200,
    y: 2_200,
    velocityX: 0,
    velocityY: 0,
    radius: 55,
    hp: 500,
    maxHp: 500,
    heading: 0
  },
  turretAngle: 0,
  shield: {
    angle: 0,
    arcHalfAngle: 0.72,
    rearmRequired: false,
    active: false,
    energy: 100,
    capacity: 100
  },
  cannon: {
    heat: 0,
    capacity: 100,
    overheated: false,
    kind: "kinetic",
    reach: 1500,
    speed: 1000,
    acquireHalfAngle: 0
  },
  machineGun: {
    heat: 0,
    capacity: 100,
    overheated: false,
    kind: "kinetic",
    reach: 620,
    speed: 900
  },
  encounter: {
    phase: "combat",
    outcome: null,
    defeatReason: null,
    waveNumber: 1,
    encounterTick: 1,
    phaseTicksRemaining: 0,
    waveSecondsRemaining: 1200,
    lootWindowSecondsRemaining: 0,
    score: 0
  },
  credits: 0,
  teamUpgrade: {
    offer: null,
    votes: { pilot: null, gunner: null, shield: null },
    selection: null
  },
  enemyCatalogue: [],
  asteroidVisual: null,
  spaceshipVisual: null,
  shieldBandEffect: "",
  shieldImpactEffect: "",
  turretVisual: null,
  shieldRadius: 104,
  arenaZones: [],
  obstacles: [],
  enemyShips: [
    {
      entityId: "enemy-1",
      spawnSequence: 1,
      kind: "gunship",
      x: 4_400,
      y: 2_200,
      velocityX: 0,
      velocityY: 0,
      radius: 30,
      heading: 0,
      hp: 80,
      maxHp: 80,
      shotsFired: 0
    }
  ],
  lootDrops: [],
  laserBeams: [],
  asteroids: [
    {
      origin: "wave",
      entityId: "asteroid-1",
      spawnSequence: 2,
      x: 1_000,
      y: 1_000,
      velocityX: 0,
      velocityY: 0,
      radius: 40,
      hp: 40,
      maxHp: 40
    }
  ],
  friendlyProjectiles: [],
  hostileProjectiles: [],
  homingMissiles: [
    {
      entityId: "missile-1",
      spawnSequence: 3,
      x: 3_000,
      y: 3_000,
      velocityX: 0,
      velocityY: 0,
      radius: 10,
      heading: 0,
      visual: null
    }
  ]
};

/**
 * A canvas has nothing to search afterwards, so the context records instead.
 *
 * Every call is kept in order with the fill and stroke in force at the time,
 * which is what lets a test say "the enemies were drawn in the enemy colour"
 * about a picture rather than about markup.
 */
interface Op {
  readonly call: string;
  readonly args: readonly number[];
  readonly text?: string;
  readonly fillStyle: string;
  readonly strokeStyle: string;
}

function recorder(): { context: RadarContext; ops: Op[] } {
  const ops: Op[] = [];
  const state = { fillStyle: "", strokeStyle: "", lineWidth: 0 };
  const record =
    (call: string) =>
    (...args: number[]) => {
      ops.push({ call, args, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle });
    };
  const context = {
    save: record("save"),
    restore: record("restore"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    arc: record("arc"),
    fill: record("fill"),
    stroke: record("stroke"),
    clip: record("clip"),
    clearRect: record("clearRect"),
    fillRect: record("fillRect"),
    fillText: (text: string, x: number, y: number) => {
      ops.push({
        call: "fillText",
        args: [x, y],
        text,
        fillStyle: state.fillStyle,
        strokeStyle: state.strokeStyle
      });
    },
    strokeText: (text: string, x: number, y: number) => {
      ops.push({
        call: "strokeText",
        args: [x, y],
        text,
        fillStyle: state.fillStyle,
        strokeStyle: state.strokeStyle
      });
    },
    lineCap: "round" as CanvasLineCap,
    font: "",
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "middle" as CanvasTextBaseline,
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: string) {
      state.fillStyle = value;
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(value: string) {
      state.strokeStyle = value;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(value: number) {
      state.lineWidth = value;
    }
  };
  return { context, ops };
}

const ENEMY_FILL = "#ff625e";
const WAVE_ROCK_FILL = "rgb(196 206 222 / 90%)";
const AMBIENT_ROCK_FILL = "rgb(120 130 145 / 55%)";

/** Blips are drawn as `arc` calls; the fill in force says which kind they are. */
function blips(ops: readonly Op[], fill: string): readonly Op[] {
  return ops.filter((op) => op.call === "arc" && op.fillStyle === fill);
}

function texts(ops: readonly Op[]): readonly string[] {
  return ops.filter((op) => op.call === "fillText").map((op) => op.text ?? "");
}

function draw(game: DisplayGameSnapshot): readonly Op[] {
  const { context, ops } = recorder();
  drawCombatRadar(context, game);
  return ops;
}

describe("the radar picture", () => {
  it("draws every enemy the snapshot carries, in the enemy colour", () => {
    const ops = draw(baseGame);

    expect(blips(ops, ENEMY_FILL)).toHaveLength(baseGame.enemyShips.length);
  });

  it("draws no missiles and no projectiles", () => {
    /*
     * The fixture carries a missile at a position no other entity occupies, so
     * if one were ever drawn it would show up as an extra blip. Counting blips
     * per colour is what makes that assertion possible at all: the picture has
     * no ids to search for.
     */
    const withoutMissile = draw({ ...baseGame, homingMissiles: [] });
    const withMissile = draw(baseGame);

    expect(withMissile.filter((op) => op.call === "arc")).toHaveLength(
      withoutMissile.filter((op) => op.call === "arc").length
    );
  });

  it("marks the rocks that pay credits apart from the ambient drift", () => {
    const [wave] = baseGame.asteroids;
    if (wave === undefined) throw new Error("fixture lost its asteroid");
    const ops = draw({
      ...baseGame,
      asteroids: [
        wave,
        { ...wave, entityId: "asteroid-2", spawnSequence: 9, origin: "ambient" as const }
      ]
    });

    expect(blips(ops, WAVE_ROCK_FILL)).toHaveLength(1);
    expect(blips(ops, AMBIENT_ROCK_FILL)).toHaveLength(1);
  });

  it("stops drawing a rock once it is gone", () => {
    expect(blips(draw({ ...baseGame, asteroids: [] }), WAVE_ROCK_FILL)).toHaveLength(0);
  });

  it("stops drawing an enemy once it is absent from the snapshot", () => {
    expect(blips(draw({ ...baseGame, enemyShips: [] }), ENEMY_FILL)).toHaveLength(0);
  });

  it("keeps the whole picture inside the box it is given", () => {
    // The old dial let its rings and labels spill outside the view box, and on
    // a short window the bottom of it was cut off against the edge.
    const ops = draw({
      ...baseGame,
      spaceship: { ...baseGame.spaceship, hp: 1_000, maxHp: 1_000, velocityX: 300 },
      shield: { ...baseGame.shield, energy: 120, capacity: 120 }
    });

    for (const op of ops) {
      if (op.call === "clearRect") continue;
      // Only the leading pair is a point: `arc` carries a radius and two angles
      // after it, and an angle of minus a half pi is not a coordinate outside
      // the box.
      for (const value of op.args.slice(0, 2)) {
        expect(value).toBeGreaterThanOrEqual(-1);
        expect(value).toBeLessThanOrEqual(RADAR_UNITS + 1);
      }
    }
  });
});

describe("the status rings", () => {
  it("reads the hull and the shield as fractions of their own capacity", () => {
    expect(ringFraction(125, 500)).toBeCloseTo(0.25, 5);
    expect(ringFraction(50, 100)).toBeCloseTo(0.5, 5);
  });

  it("draws an empty ring rather than a full one when there is no capacity", () => {
    expect(ringFraction(0, 0)).toBe(0);
    expect(ringFraction(40, 0)).toBe(0);
  });

  it("slides toward a new reading instead of stepping to it", () => {
    const first = easeRing(1, 0.6);
    expect(first).toBeLessThan(1);
    expect(first).toBeGreaterThan(0.6);
    // And it gets there: twenty steps a second, well under a second.
    let shown = 1;
    for (let step = 0; step < 40; step += 1) shown = easeRing(shown, 0.6);
    expect(shown).toBeCloseTo(0.6, 3);
  });

  it("covers the same ground whether it was painted once or six times", () => {
    /*
     * The stutter this exists for. The arc used to take a fifth of the gap per
     * paint with no time in the sum, so its speed was whatever the paint rate
     * happened to be - even in the intermission, jumpy in a fight, where a busy
     * frame stretches the gap from 33 to 66 ms. Same elapsed time, same place.
     */
    let steady = 1;
    for (let step = 0; step < 6; step += 1) steady = easeRing(steady, 0.4, 33);
    const stalled = easeRing(1, 0.4, 198);
    expect(stalled).toBeCloseTo(steady, 2);
  });

  it("never overshoots, however long the frame was", () => {
    // A backgrounded tab comes back with a gap of seconds; the arc lands on the
    // target rather than past it.
    expect(easeRing(1, 0.6, 10_000)).toBeCloseTo(0.6, 6);
    expect(easeRing(0.6, 1, 10_000)).toBeCloseTo(1, 6);
    expect(easeRing(1, 0.6, -5)).toBe(1);
  });

  it("keeps the speed it had when the dial was polled at a fixed 50 ms", () => {
    // The rate is derived from the old constant rather than picked, so this
    // change fixes the stutter without also retuning the gauge. A fifth of the
    // gap, on a gap small enough not to be taken whole.
    expect(easeRing(1, 0.6, 50)).toBeCloseTo(0.92, 4);
  });

  it("takes a jump whole rather than sliding across the whole ring", () => {
    // A new run or a repair bay, not a drain: easing that would read as a bug.
    expect(easeRing(0.1, 1)).toBe(1);
    expect(easeRing(1, 0)).toBe(0);
  });

  it("paints a full hull green and a dying one red", () => {
    expect(hullStroke(1)).toBe("hsl(138 72% 52%)");
    expect(hullStroke(0.12)).toBe("hsl(4 72% 52%)");
  });

  it("labels each arc with its zero and with what it is filling to", () => {
    const written = texts(
      draw({
        ...baseGame,
        spaceship: { ...baseGame.spaceship, hp: 320, maxHp: 500 },
        shield: { ...baseGame.shield, energy: 64, capacity: 120 }
      })
    );

    expect(written).toContain("320 / 500");
    expect(written).toContain("64 / 120");
    expect(written.filter((text) => text === "0")).toHaveLength(2);
  });

  it("carries the shield state word the HUD card used to show", () => {
    expect(texts(draw({ ...baseGame, shieldPhase: "up" }))).toContain("АКТИВЕН");
  });

  it("reads the speed off the velocity the room publishes", () => {
    const written = texts(
      draw({
        ...baseGame,
        spaceship: { ...baseGame.spaceship, velocityX: 300, velocityY: 400 }
      })
    );

    expect(written).toContain("500 ед/с");
  });
});
