import assert from "node:assert/strict";
import test from "node:test";

import {
  createAutopilotMemory,
  helmIntent,
  huntVector,
  directAim,
  bearingRate,
  commitTarget,
  effectiveStandoff,
  measureAngularRates,
  normalize,
  extrapolateWorld,
  interceptAim,
  nextShieldActive,
  pilotVector,
  planGunner,
  planPilot,
  planShield,
  rankTargets,
  runWaveKey,
  timeToContact
} from "./visible-demo-policy.mjs";

test("pilot policy traces a normalized loop", () => {
  assert.deepEqual(pilotVector(0), { x: 1, y: 0 });
  const quarter = pilotVector(4_500);
  assert.ok(Math.abs(quarter.x) < 1e-12);
  assert.ok(Math.abs(quarter.y - 1) < 1e-12);
});

test("intercept aim leads a moving target", () => {
  const aim = interceptAim({ x: 0, y: 0 }, { x: 100, y: 0, velocityX: 0, velocityY: 100 }, 200);
  assert.ok(aim.x > 0.8);
  assert.ok(aim.y > 0);
  assert.ok(Math.abs(Math.hypot(aim.x, aim.y) - 1) < 1e-12);
});

test("shield policy uses energy hysteresis", () => {
  assert.equal(nextShieldActive(true, 8), false);
  assert.equal(nextShieldActive(false, 69), false);
  assert.equal(nextShieldActive(false, 70), true);
  assert.equal(nextShieldActive(true, 9), true);
});

test("direct aim points from the spaceship to the threat", () => {
  assert.deepEqual(directAim({ x: 5, y: 5 }, { x: 5, y: 15 }), { x: 0, y: 1 });
});

test("upgrade wave identity is scoped to the authoritative run", () => {
  assert.notEqual(runWaveKey(1, 1), runWaveKey(2, 1));
  assert.equal(runWaveKey(2, 3), "2:3");
});

const ROOKIE = {
  reactionTicks: 12,
  retargetIntervalTicks: 40,
  aimJitterRadians: 0.18,
  leadFactor: 0,
  orbit: false,
  evadeMissiles: false,
  dodgeBullets: false,
  threatAwareShield: false,
  standoffDistance: 900,
  evadeHorizonTicks: 0,
  mgConeRadians: Math.PI,
  cannonConeRadians: Math.PI,
  mgHeatCeiling: 1,
  shieldLeadTicks: 0,
  shieldMinEnergy: 0
};

const ACE = {
  reactionTicks: 1,
  retargetIntervalTicks: 2,
  aimJitterRadians: 0,
  leadFactor: 1,
  orbit: true,
  evadeMissiles: true,
  dodgeBullets: true,
  threatAwareShield: true,
  standoffDistance: 700,
  evadeHorizonTicks: 20,
  mgConeRadians: 0.12,
  cannonConeRadians: 0.06,
  mgHeatCeiling: 0.7,
  shieldLeadTicks: 14,
  shieldMinEnergy: 0.25
};

function entity(entityId, spawnSequence, overrides = {}) {
  return {
    entityId,
    spawnSequence,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    radius: 10,
    ...overrides
  };
}

function world(overrides = {}) {
  return {
    sampledAtMs: 1_000,
    tick: 20,
    phase: "combat",
    waveNumber: 1,
    cameraViewWidth: 1600,
    arenaRadius: 2200,
    worldWidth: 4400,
    worldHeight: 4400,
    shieldRadius: 104,
    turretAngle: 0,
    ship: {
      x: 2200,
      y: 2200,
      heading: 0,
      velocityX: 0,
      velocityY: 0,
      radius: 52,
      hp: 500,
      maxHp: 500
    },
    shield: { angle: 0, active: false, energy: 100, capacity: 100, arcHalfAngle: Math.PI / 4 },
    machineGun: { heat: 0, capacity: 100, overheated: false },
    enemies: [],
    missiles: [],
    bullets: [],
    asteroids: [],
    ...overrides
  };
}

function enemyAt(entityId, spawnSequence, x, y, overrides = {}) {
  return entity(entityId, spawnSequence, {
    x,
    y,
    kind: "gunship",
    heading: 0,
    hp: 50,
    maxHp: 50,
    ...overrides
  });
}

test("the helm asks for a spin and a push, not a course", () => {
  const memory = createAutopilotMemory();
  // Dead ahead: no spin wanted, full burn along the nose.
  const ahead = helmIntent({ x: 1, y: 0 }, 0, memory);
  assert.equal(ahead.turn, 0);
  assert.ok(Math.abs(ahead.thrust - 1) < 1e-9);

  // Off to port: full deflection, and almost nothing to the engine until the
  // nose has caught up, because thrust runs along the hull.
  const toPort = helmIntent({ x: 0, y: 1 }, 0, createAutopilotMemory());
  assert.equal(toPort.turn, 1);
  assert.ok(toPort.thrust < 0.001);

  // A stopped pilot asks for nothing at all rather than holding a course.
  const idle = helmIntent({ x: 0, y: 0 }, 0, createAutopilotMemory());
  assert.deepEqual(idle, { turn: 0, thrust: 0 });
});

test("the helm backs up only for a course well astern", () => {
  const memory = createAutopilotMemory();
  const behind = helmIntent({ x: -1, y: 0 }, 0, memory);
  assert.ok(Math.abs(behind.thrust + 1) < 1e-9);
  assert.ok(Math.abs(behind.turn) < 1e-9);

  // Abeam is a turn, not a reverse: reverse is the slower gear, so swinging the
  // hull round pays for itself. At the beam the bot flew a third of the fight
  // backwards.
  assert.ok(helmIntent({ x: 0, y: 1 }, 0, createAutopilotMemory()).thrust >= 0);
  assert.ok(
    helmIntent({ x: Math.cos(1.3), y: Math.sin(1.3) }, 0, createAutopilotMemory()).thrust > 0
  );

  // Held once taken: a course drifting back towards the beam does not flip the
  // thrust end for end, which is a harder jerk than the one this helm removes.
  const insideTheGap = { x: Math.cos(2.1), y: Math.sin(2.1) };
  assert.ok(helmIntent(insideTheGap, 0, memory).thrust < 0);
  assert.equal(helmIntent(insideTheGap, 0, createAutopilotMemory()).thrust, 0);
});

test("a manoeuvre is held until its band is properly left", () => {
  // The stand-off ring is 360 units here (the camera frame clamps it), so the
  // entry band ends at 414 and the release band at 437. The second sample is a
  // tick later, because the pilot re-reads a target only once per tick.
  const onStation = world({ enemies: [enemyAt("target", 1, 2_600, 2_200)] });
  const justOutside = world({
    sampledAtMs: 1_050,
    enemies: [enemyAt("target", 1, 2_620, 2_200)]
  });

  // Judged from scratch, twenty units past the edge is a different manoeuvre:
  // the pilot leaves the ring and orbits.
  const fresh = planPilot(justOutside, ACE, createAutopilotMemory());
  assert.ok(Math.hypot(fresh.vector.x, fresh.vector.y) > 0.5);

  // Held: a pilot already on station stays on station, so the requested course
  // stops swinging across the target every other tick on the band edge.
  const memory = createAutopilotMemory();
  const settled = planPilot(onStation, ACE, memory);
  assert.equal(Math.hypot(settled.vector.x, settled.vector.y), 0);
  const held = planPilot(justOutside, ACE, memory);
  assert.equal(Math.hypot(held.vector.x, held.vector.y), 0);
});

test("the held manoeuvre belongs to the target it was chosen for", () => {
  const memory = createAutopilotMemory();
  planPilot(world({ enemies: [enemyAt("first", 1, 2_600, 2_200)] }), ACE, memory);
  // A different target is judged on its own geometry, not on the verdict the
  // previous one earned.
  const other = planPilot(
    world({ sampledAtMs: 1_050, enemies: [enemyAt("second", 2, 2_620, 2_200)] }),
    ACE,
    memory
  );
  assert.ok(Math.hypot(other.vector.x, other.vector.y) > 0.5);
});

test("the nose gun holds fire until the target enters the cone", () => {
  // Dead ahead: both levels shoot.
  const ahead = world({ enemies: [enemyAt("ahead", 1, 2900, 2200)] });
  assert.equal(planPilot(ahead, ACE, createAutopilotMemory()).mgFiring, true);
  assert.equal(planPilot(ahead, ROOKIE, createAutopilotMemory()).mgFiring, true);

  // Abeam: the wide-open rookie cone still fires, the ace one does not.
  const abeam = world({ enemies: [enemyAt("abeam", 1, 2200, 2900)] });
  assert.equal(planPilot(abeam, ACE, createAutopilotMemory()).mgFiring, false);
  assert.equal(planPilot(abeam, ROOKIE, createAutopilotMemory()).mgFiring, true);
});

test("the nose gun respects the heat ceiling and the overheat latch", () => {
  const ahead = world({
    enemies: [enemyAt("ahead", 1, 2900, 2200)],
    machineGun: { heat: 80, capacity: 100, overheated: false }
  });
  assert.equal(planPilot(ahead, ACE, createAutopilotMemory()).mgFiring, false);
  assert.equal(planPilot(ahead, ROOKIE, createAutopilotMemory()).mgFiring, true);

  const overheated = world({
    enemies: [enemyAt("ahead", 1, 2900, 2200)],
    machineGun: { heat: 10, capacity: 100, overheated: true }
  });
  assert.equal(planPilot(overheated, ROOKIE, createAutopilotMemory()).mgFiring, false);
});

test("an empty frame leaves both guns cold", () => {
  const empty = world();
  assert.equal(planPilot(empty, ACE, createAutopilotMemory()).mgFiring, false);
  assert.equal(planGunner(empty, ACE, createAutopilotMemory()).firing, false);
});

test("an inbound missile outranks a closer ordinary enemy", () => {
  const scene = world({
    enemies: [enemyAt("close", 1, 2300, 2200)],
    missiles: [entity("missile", 2, { x: 2800, y: 2200, velocityX: -240, heading: Math.PI })]
  });
  const ranked = rankTargets(scene);
  assert.equal(ranked[0].entity.entityId, "missile");
  assert.equal(planGunner(scene, ACE, createAutopilotMemory()).firing, true);
});

test("an enemy inside its own engagement range outranks one still approaching", () => {
  const archetypes = {
    gunship: {
      spawnPolicy: "standard",
      weapons: [{ engagementRange: 400 }]
    }
  };
  const scene = world({
    enemies: [enemyAt("shooting", 1, 2500, 2200), enemyAt("approaching", 2, 2560, 2200)]
  });
  assert.equal(rankTargets(scene, { archetypes })[0].entity.entityId, "shooting");
});

test("the cannon waits out the turret traverse", () => {
  // Target abeam, turret still pointing along +x.
  const abeam = world({ enemies: [enemyAt("abeam", 1, 2200, 2900)] });
  assert.equal(planGunner(abeam, ACE, createAutopilotMemory()).firing, false);
  assert.equal(planGunner(abeam, ROOKIE, createAutopilotMemory()).firing, true);

  const aligned = world({ enemies: [enemyAt("abeam", 1, 2200, 2900)], turretAngle: Math.PI / 2 });
  assert.equal(planGunner(aligned, ACE, createAutopilotMemory()).firing, true);
});

test("a zero lead factor aims where the target is, a full one where it will be", () => {
  const crossing = world({
    enemies: [enemyAt("crossing", 1, 2900, 2200, { velocityY: 260 })]
  });
  const blunt = planGunner(crossing, ROOKIE, createAutopilotMemory({ ...ROOKIE }));
  const sharp = planGunner(crossing, ACE, createAutopilotMemory());
  // Rookie also carries jitter, so compare against a jitter-free rookie.
  const plain = planGunner(crossing, { ...ROOKIE, aimJitterRadians: 0 }, createAutopilotMemory());

  assert.ok(Math.abs(plain.aim.y) < 1e-12);
  assert.ok(sharp.aim.y > 0.1);
  assert.ok(Number.isFinite(blunt.aim.y));
});

test("the shield rides the predicted contact instead of the energy meter", () => {
  const incoming = world({
    missiles: [entity("missile", 1, { x: 2400, y: 2200, velocityX: -240, heading: Math.PI })]
  });
  const raised = planShield(incoming, ACE, createAutopilotMemory());
  assert.equal(raised.active, true);
  // The contact arrives from +x, so the sector faces that way.
  assert.ok(raised.aim.x > 0.9);

  const quiet = world();
  assert.equal(planShield(quiet, ACE, createAutopilotMemory()).active, false);
  // The old policy keeps the shield up on a full battery with nothing incoming.
  assert.equal(planShield(quiet, ROOKIE, createAutopilotMemory()).active, true);
});

test("the bot keeps going after a shooter it never saw", () => {
  const memory = createAutopilotMemory();
  // A round crossing right to left: its source lies off to the right, beyond
  // what the frame shows.
  const underFire = world({
    bullets: [entity("shot", 1, { x: 2600, y: 2200, velocityX: -900, radius: 7 })]
  });
  const answering = huntVector(underFire, memory, 1_000);
  assert.ok(answering !== undefined && answering.x > 0.9);

  // The round is gone a tick later, and without a memory this is where the bot
  // gave up and went back to sweeping the middle of the arena.
  const quiet = world();
  const still = huntVector(quiet, memory, 1_400);
  assert.ok(still !== undefined && still.x > 0.9);

  // It does not chase forever: a guess nothing confirmed goes stale.
  assert.equal(huntVector(quiet, memory, 1_000 + 9_000), undefined);
  assert.equal(huntVector(quiet, memory, 1_000 + 9_100), undefined);
});

test("the guess is spent once the bot arrives and finds nothing", () => {
  const memory = createAutopilotMemory();
  const underFire = world({
    bullets: [entity("shot", 1, { x: 2600, y: 2200, velocityX: -900, radius: 7 })]
  });
  huntVector(underFire, memory, 1_000);
  const source = memory.firedFrom;
  assert.ok(source !== undefined);

  const arrived = world({ ship: { ...world().ship, x: source.x, y: source.y } });
  assert.equal(huntVector(arrived, memory, 1_200), undefined);
});

test("the shield covers the shot before the rock", () => {
  // Both connect, the rock a touch sooner. The old arc followed whatever
  // arrived first, which in a field of drifting rocks meant the operator
  // watched it face the scenery while a sniper worked on the hull.
  const both = world({
    asteroids: [entity("rock", 1, { x: 2200, y: 1900, velocityY: 240, radius: 26 })],
    bullets: [entity("shot", 2, { x: 2600, y: 2200, velocityX: -900, radius: 7 })]
  });
  const covering = planShield(both, ACE, createAutopilotMemory());
  assert.ok(covering.aim.x > 0.9, "the arc faces the shot, not the rock");

  // Beyond the arming window nothing is being blocked yet, so the arc simply
  // tracks the nearest contact and the rock wins on time.
  const distantShot = world({
    asteroids: [entity("rock", 1, { x: 2200, y: 1900, velocityY: 240, radius: 26 })],
    bullets: [entity("shot", 2, { x: 5000, y: 2200, velocityX: -900, radius: 7 })]
  });
  assert.ok(planShield(distantShot, ACE, createAutopilotMemory()).aim.y < -0.9);
});

test("a drained shield is told to drop so the rearm latch clears", () => {
  const drained = world({
    shield: { angle: 0, active: true, energy: 0, capacity: 100, arcHalfAngle: Math.PI / 4 },
    missiles: [entity("missile", 1, { x: 2400, y: 2200, velocityX: -240, heading: Math.PI })]
  });
  assert.equal(planShield(drained, ACE, createAutopilotMemory()).active, false);
  assert.equal(planShield(drained, ROOKIE, createAutopilotMemory()).active, false);
});

test("below its reserve the shield spends only on what actually hurts", () => {
  const battery = { angle: 0, active: false, energy: 20, capacity: 100, arcHalfAngle: Math.PI / 4 };

  // A rock is dodgeable and shootable, so the last of the battery is not spent
  // on it — the ship can answer a rock with the guns or with the helm.
  const drifting = world({
    shield: battery,
    asteroids: [entity("rock", 1, { x: 2400, y: 2200, velocityX: -240, radius: 26 })]
  });
  assert.equal(planShield(drifting, ACE, createAutopilotMemory()).active, false);

  // Aimed fire is neither: it is pointed at the ship and arrives regardless.
  const grazed = world({
    shield: battery,
    bullets: [entity("shot", 1, { x: 2400, y: 2200, velocityX: -900, radius: 7 })]
  });
  assert.equal(planShield(grazed, ACE, createAutopilotMemory()).active, true);

  // A missile is not: refusing to raise here is how the ace used to die in a
  // swarm, because under fire the energy never climbs back over the floor.
  const struck = world({
    shield: battery,
    missiles: [entity("missile", 1, { x: 2400, y: 2200, velocityX: -240, heading: Math.PI })]
  });
  assert.equal(planShield(struck, ACE, createAutopilotMemory()).active, true);

  // Flat empty stays down whatever is coming: there is nothing left to spend.
  const empty = world({
    shield: { ...battery, energy: 0 },
    missiles: [entity("missile", 1, { x: 2400, y: 2200, velocityX: -240, heading: Math.PI })]
  });
  assert.equal(planShield(empty, ACE, createAutopilotMemory()).active, false);
});

test("a missile inside the horizon turns the pilot across its bearing", () => {
  const incoming = world({
    missiles: [entity("missile", 1, { x: 2400, y: 2200, velocityX: -240, heading: Math.PI })]
  });
  const evading = planPilot(incoming, ACE, createAutopilotMemory());
  // The threat bears +x, so the break is perpendicular: no +x component left.
  assert.ok(Math.abs(evading.vector.x) < 1e-9);
  assert.ok(Math.abs(evading.vector.y) > 0.9);
  // The break does not silence the gun: the missile is dead ahead of the nose,
  // and a long evasion used to mean the bot never fired at all.
  assert.equal(evading.mgFiring, true);

  // Off the nose there is still nothing to shoot at.
  const abeam = world({
    ship: {
      x: 2200,
      y: 2200,
      heading: Math.PI / 2,
      velocityX: 0,
      velocityY: 0,
      radius: 52,
      hp: 500,
      maxHp: 500
    },
    missiles: [entity("missile", 1, { x: 2400, y: 2200, velocityX: -240, heading: Math.PI })]
  });
  assert.equal(planPilot(abeam, ACE, createAutopilotMemory()).mgFiring, false);

  // Rookie has no evasion horizon at all and keeps flying its circle.
  const oblivious = planPilot(incoming, ROOKIE, createAutopilotMemory());
  assert.notEqual(Math.abs(oblivious.vector.x) < 1e-9, true);
});

test("the pilot breaks toward the middle of the arena", () => {
  const nearRim = world({
    ship: {
      x: 2200,
      y: 3900,
      heading: 0,
      velocityX: 0,
      velocityY: 0,
      radius: 52,
      hp: 500,
      maxHp: 500
    },
    missiles: [entity("missile", 1, { x: 2400, y: 3900, velocityX: -240, heading: Math.PI })]
  });
  // Threat bears +x; the inward side is -y, so that is the side taken.
  assert.ok(planPilot(nearRim, ACE, createAutopilotMemory()).vector.y < 0);
});

test("an already covered bearing does not trigger an escape", () => {
  const covered = world({
    shield: { angle: 0, active: true, energy: 80, capacity: 100, arcHalfAngle: Math.PI / 4 },
    missiles: [entity("missile", 1, { x: 2400, y: 2200, velocityX: -240, heading: Math.PI })]
  });
  // With the sector already on the bearing the pilot keeps working the target.
  assert.ok(Math.abs(planPilot(covered, ACE, createAutopilotMemory()).vector.x) > 1e-9);
});

test("the orbiting pilot closes an open range and coasts on station", () => {
  const ring = effectiveStandoff(world(), ACE);
  const far = world({ enemies: [enemyAt("far", 1, 2200 + ring + 800, 2200)] });
  assert.ok(planPilot(far, ACE, createAutopilotMemory()).vector.x > 0.5);

  const near = world({ enemies: [enemyAt("near", 1, 2200 + ring / 3, 2200)] });
  assert.ok(planPilot(near, ACE, createAutopilotMemory()).vector.x < 0);

  const onStation = world({ enemies: [enemyAt("station", 1, 2200 + ring, 2200)] });
  assert.deepEqual(planPilot(onStation, ACE, createAutopilotMemory()).vector, { x: 0, y: 0 });
});

test("the stand-off ring never grows past what the camera frames", () => {
  // The frame is 9/16 of its width, so its short side bounds the ring.
  const narrow = world({ cameraViewWidth: 800 });
  assert.ok(effectiveStandoff(narrow, ACE) < ACE.standoffDistance);
  assert.ok(Math.abs(effectiveStandoff(narrow, ACE) - 180) < 1e-9);

  // A frame wide enough leaves the operator's own number alone.
  const wide = world({ cameraViewWidth: 4400 });
  assert.equal(effectiveStandoff(wide, ACE), ACE.standoffDistance);

  // A target held on the clamped ring stays inside the frame.
  const framed = world({ cameraViewWidth: 2200 });
  const halfHeight = (2200 * 9) / 16 / 2;
  assert.ok(effectiveStandoff(framed, ACE) < halfHeight);
});

test("the orbit turns back inward at the arena rim", () => {
  const memory = createAutopilotMemory();
  const atRim = world({
    ship: {
      x: 2200,
      y: 4200,
      heading: 0,
      velocityX: 0,
      velocityY: 0,
      radius: 52,
      hp: 500,
      maxHp: 500
    },
    enemies: [enemyAt("bait", 1, 2200 + 1500, 4200)]
  });
  planPilot(atRim, ACE, memory);
  assert.equal(memory.orbitSign, -1);
});

test("a committed target is held through the retarget interval", () => {
  const memory = createAutopilotMemory();
  const first = world({ enemies: [enemyAt("first", 1, 2500, 2200)] });
  assert.equal(planGunner(first, ROOKIE, memory, { nowMs: 1_000 }).firing, true);
  assert.equal(memory.target.entityId, "first");

  const better = world({
    enemies: [enemyAt("first", 1, 2500, 2200), enemyAt("closer", 2, 2260, 2200)]
  });
  planGunner(better, ROOKIE, memory, { nowMs: 1_100 });
  assert.equal(memory.target.entityId, "first");

  // Past the interval plus the reaction delay the better target is taken.
  planGunner(better, ROOKIE, memory, { nowMs: 4_000 });
  planGunner(better, ROOKIE, memory, { nowMs: 5_000 });
  assert.equal(memory.target.entityId, "closer");
});

test("a vanished target is dropped without waiting out the interval", () => {
  const memory = createAutopilotMemory();
  planGunner(world({ enemies: [enemyAt("doomed", 1, 2500, 2200)] }), ACE, memory, { nowMs: 1_000 });
  assert.equal(memory.target.entityId, "doomed");

  planGunner(world({ enemies: [enemyAt("other", 2, 2600, 2200)] }), ACE, memory, { nowMs: 1_050 });
  assert.equal(memory.target.entityId, "other");
});

test("both planners share one decision inside a tick", () => {
  const memory = createAutopilotMemory();
  const scene = world({ enemies: [enemyAt("only", 1, 2900, 2200)] });
  planGunner(scene, ACE, memory, { nowMs: 2_000 });
  const committed = memory.committedAtMs;
  planPilot(scene, ACE, memory, { nowMs: 2_000 });
  assert.equal(memory.committedAtMs, committed);
});

test("the world picture is carried forward between telemetry samples", () => {
  const stale = world({ enemies: [enemyAt("mover", 1, 2400, 2200, { velocityX: 100 })] });
  const fresh = extrapolateWorld(stale, 1_100);
  assert.ok(Math.abs(fresh.enemies[0].x - 2410) < 1e-9);
  assert.equal(fresh.sampledAtMs, 1_100);

  // A stalled sample is clamped instead of throwing the picture into the wall.
  const clamped = extrapolateWorld(stale, 9_000);
  assert.ok(Math.abs(clamped.enemies[0].x - 2420) < 1e-9);
  assert.deepEqual(extrapolateWorld(stale, 1_000), stale);
});

test("extrapolation turns a missile toward the ship", () => {
  const scene = world({
    missiles: [entity("missile", 1, { x: 2400, y: 2400, velocityX: -260, heading: Math.PI })]
  });
  const fresh = extrapolateWorld(scene, 1_200);
  // Homing pulls its heading up toward the ship, which sits above and left.
  assert.ok(fresh.missiles[0].velocityY < 0);
});

test("time to contact answers only for a closing course", () => {
  const ship = { x: 0, y: 0, velocityX: 0, velocityY: 0 };
  const closing = { x: 200, y: 0, velocityX: -100, velocityY: 0, radius: 0 };
  assert.ok(Math.abs(timeToContact(ship, 100, closing) - 1) < 1e-9);
  assert.equal(timeToContact(ship, 100, { ...closing, velocityX: 100 }), undefined);
  assert.equal(timeToContact(ship, 100, { ...closing, velocityX: 0 }), undefined);
  assert.equal(timeToContact(ship, 300, closing), 0);
});

test("aim jitter is reproducible for a given seed", () => {
  const scene = world({ enemies: [enemyAt("target", 1, 2900, 2200)] });
  const left = planGunner(scene, ROOKIE, createAutopilotMemory(7));
  const right = planGunner(scene, ROOKIE, createAutopilotMemory(7));
  const other = planGunner(scene, ROOKIE, createAutopilotMemory(8));
  assert.deepEqual(left.aim, right.aim);
  assert.notDeepEqual(left.aim, other.aim);
});

test("the lead solution uses the muzzle velocity the preset will fire with", () => {
  const crossing = world({ enemies: [enemyAt("crossing", 1, 2900, 2200, { velocityY: 260 })] });
  const stock = planGunner(crossing, ACE, createAutopilotMemory());
  // A slower shell has to be led further ahead of the same crossing target; below
  // the target speed there is no intercept at all and the solver aims straight.
  const slow = planGunner(crossing, ACE, createAutopilotMemory(), { cannonSpeed: 350 });
  assert.ok(slow.aim.y > stock.aim.y);

  // On the ring the pilot swings the nose onto the same lead bearing, so the
  // muzzle velocity has to reach it there too.
  const onRing = world({
    enemies: [
      enemyAt("crossing", 1, 2200 + effectiveStandoff(world(), ACE), 2200, { velocityY: 260 })
    ]
  });
  const noseStock = planPilot(onRing, ACE, createAutopilotMemory());
  const noseSlow = planPilot(onRing, ACE, createAutopilotMemory(), { mgSpeed: 350 });
  assert.notDeepEqual(noseStock.vector, noseSlow.vector);
});

function rockAt(entityId, spawnSequence, x, y, velocityX, velocityY) {
  return entity(entityId, spawnSequence, { x, y, velocityX, velocityY, hp: 65, maxHp: 65 });
}

test("a rock already past the rim and still heading out is not a target", () => {
  // Arena centre is 2200,2200 with radius 2200: 4300 on x is outside it.
  const leaving = world({
    cameraViewWidth: 4400,
    ship: {
      x: 4000,
      y: 2200,
      heading: 0,
      velocityX: 0,
      velocityY: 0,
      radius: 52,
      hp: 500,
      maxHp: 500
    },
    asteroids: [rockAt("outbound", 1, 4500, 2200, 190, 0)]
  });
  assert.deepEqual(rankTargets(leaving), []);
  assert.equal(planGunner(leaving, ACE, createAutopilotMemory()).firing, false);

  // The same rock on its way back in is still worth shooting.
  const returning = world({
    cameraViewWidth: 4400,
    ship: {
      x: 4000,
      y: 2200,
      heading: 0,
      velocityX: 0,
      velocityY: 0,
      radius: 52,
      hp: 500,
      maxHp: 500
    },
    asteroids: [rockAt("inbound", 1, 4500, 2200, -190, 0)]
  });
  assert.equal(rankTargets(returning).length, 1);
});

test("a rock inside the arena stays a target whichever way it drifts", () => {
  const inside = world({ asteroids: [rockAt("drifting", 1, 2600, 2200, 190, 0)] });
  assert.equal(rankTargets(inside).length, 1);
});

test("an empty screen never leaves the pilot parked", () => {
  const offCentre = world({
    ship: {
      x: 3600,
      y: 2200,
      heading: 0,
      velocityX: 0,
      velocityY: 0,
      radius: 52,
      hp: 500,
      maxHp: 500
    }
  });
  const searching = planPilot(offCentre, ACE, createAutopilotMemory());
  assert.notDeepEqual(searching.vector, { x: 0, y: 0 });
  // The arena centre lies at -x from here, so that is the way it heads.
  assert.ok(searching.vector.x < -0.9);

  // Already in the middle: it sweeps instead of sitting on the spot.
  const atCentre = planPilot(world(), ACE, createAutopilotMemory());
  assert.notDeepEqual(atCentre.vector, { x: 0, y: 0 });
  assert.ok(Math.abs(Math.hypot(atCentre.vector.x, atCentre.vector.y) - 1) < 1e-9);
});

test("the pilot walks incoming fire back to the shooter it cannot see", () => {
  // A sniper out-ranges the camera frame, so only its bullet is on screen.
  const underFire = world({
    bullets: [entity("shot", 1, { x: 2500, y: 2200, velocityX: -900, velocityY: 0, radius: 7 })]
  });
  const hunting = planPilot(underFire, { ...ACE, dodgeBullets: false }, createAutopilotMemory());
  // The shot travels -x, so its owner sits at +x.
  assert.ok(hunting.vector.x > 0.9);
  assert.equal(hunting.mgFiring, false);
});

test("a visible target still outranks the search", () => {
  const withTarget = world({
    enemies: [enemyAt("visible", 1, 2900, 2200)],
    bullets: [entity("shot", 2, { x: 2500, y: 2200, velocityX: -900, velocityY: 0, radius: 7 })]
  });
  const memory = createAutopilotMemory();
  planPilot(withTarget, { ...ACE, dodgeBullets: false }, memory);
  assert.equal(memory.target.entityId, "visible");
});

test("the rookie patrol is untouched by the search behaviour", () => {
  const empty = world();
  assert.deepEqual(
    planPilot(empty, ROOKIE, createAutopilotMemory(), { nowMs: 0 }).vector,
    pilotVector(0)
  );
});

test("a rock on screen does not call off the hunt for an unseen shooter", () => {
  // The sniper out-ranges the camera, so only its bullet and a drifting rock
  // are on screen. The turret works the rock; the pilot goes after the sniper.
  const scene = world({
    asteroids: [rockAt("rock", 1, 2200, 2400, 0, -190)],
    bullets: [entity("shot", 2, { x: 2600, y: 2200, velocityX: -900, velocityY: 0, radius: 7 })]
  });
  const memory = createAutopilotMemory();
  const pilot = planPilot(scene, { ...ACE, dodgeBullets: false }, memory);
  assert.ok(pilot.vector.x > 0.9);

  // The gunner still has a target: the rock is worth credits.
  assert.equal(
    planGunner(scene, { ...ACE, dodgeBullets: false }, memory).firing !== undefined,
    true
  );
  assert.equal(memory.target.entityId, "rock");
});

test("a visible enemy outranks the hunt", () => {
  const scene = world({
    enemies: [enemyAt("close", 1, 2200 + 1500, 2200)],
    bullets: [entity("shot", 2, { x: 2200, y: 2600, velocityX: 0, velocityY: -900, radius: 7 })]
  });
  const pilot = planPilot(scene, { ...ACE, dodgeBullets: false }, createAutopilotMemory());
  // It closes on the enemy at +x rather than chasing the shot back to +y.
  assert.ok(pilot.vector.x > 0.5);
});

test("a boss firing from beyond the frame is hunted through its missiles", () => {
  const scene = world({
    asteroids: [rockAt("rock", 1, 2200, 2350, 0, -190)],
    missiles: [entity("inbound", 2, { x: 2200, y: 1400, velocityX: 0, velocityY: 240, radius: 12 })]
  });
  // Missiles rank above rocks, so this one is the committed target and the
  // pilot manoeuvres on it rather than walking it back.
  const memory = createAutopilotMemory();
  planPilot(scene, { ...ACE, evadeMissiles: false, dodgeBullets: false }, memory);
  assert.equal(memory.target.entityId, "inbound");

  // Once it is gone the rock is all that is left, and the pilot hunts again.
  const afterIntercept = world({ asteroids: [rockAt("rock", 1, 2200, 2350, 0, -190)] });
  const hunting = planPilot(afterIntercept, ACE, createAutopilotMemory());
  assert.notDeepEqual(hunting.vector, { x: 0, y: 0 });
});

test("a target sweeping faster than the turret ends the orbit", () => {
  // Inside the ring the orbit backs away, so the sign of the closing component
  // is what separates holding station from breaking the stalemate. This target
  // crosses faster than the ace turret can follow, which is the carousel the
  // bot used to circle in for minutes without firing.
  const memory = createAutopilotMemory();
  const near = world({
    sampledAtMs: 0,
    enemies: [enemyAt("crossing", 1, 2200 + 200, 2200, { velocityY: 300 })]
  });
  planPilot(near, ACE, memory);
  const later = world({
    sampledAtMs: 100,
    enemies: [enemyAt("crossing", 1, 2200 + 200, 2200 + 30, { velocityY: 300 })]
  });
  const chasing = planPilot(later, ACE, memory);

  const toTarget = normalize({ x: 200, y: 30 });
  assert.ok(chasing.vector.x * toTarget.x + chasing.vector.y * toTarget.y > 0.5);
});

test("a slow-crossing target still gets the orbit", () => {
  const memory = createAutopilotMemory();
  const ring = effectiveStandoff(world(), ACE);
  const first = world({
    sampledAtMs: 0,
    enemies: [enemyAt("drifting", 1, 2200 + ring + 100, 2200, { velocityY: 10 })]
  });
  planPilot(first, ACE, memory);
  const second = world({
    sampledAtMs: 100,
    enemies: [enemyAt("drifting", 1, 2200 + ring + 100, 2200 + 1, { velocityY: 10 })]
  });
  const orbiting = planPilot(second, ACE, memory);

  // Just outside the ring it closes on a curve: some of the vector goes into
  // circling rather than straight at the target.
  assert.ok(orbiting.vector.x > 0.2);
  assert.ok(Math.abs(orbiting.vector.y) > 0.5);
});

test("the turret rate comes from the preset, not a constant", () => {
  const toTarget = normalize({ x: 200, y: 3 });
  const sample = (atMs, y) =>
    world({
      sampledAtMs: atMs,
      enemies: [enemyAt("slow", 1, 2200 + 200, 2200 + y, { velocityY: 30 })]
    });

  // This target barely drifts, so the stock turret keeps up and the bot holds
  // its ring — inside which the ring means backing off.
  const stockMemory = createAutopilotMemory();
  planPilot(sample(0, 0), ACE, stockMemory);
  const holding = planPilot(sample(100, 3), ACE, stockMemory);
  assert.ok(holding.vector.x * toTarget.x + holding.vector.y * toTarget.y < 0);

  // A turret this slow loses even that, so the same picture has to close.
  const slowMemory = createAutopilotMemory();
  planPilot(sample(0, 0), ACE, slowMemory, { turretRate: 0.01 });
  const chasing = planPilot(sample(100, 3), ACE, slowMemory, { turretRate: 0.01 });
  assert.ok(chasing.vector.x * toTarget.x + chasing.vector.y * toTarget.y > 0.5);
});

test("a reshuffling swarm does not leave the turret permanently in transit", () => {
  // Two enemies of near-equal worth on opposite beams. The ranking flips as
  // they jostle; before, every flip commanded a new bearing the mount never
  // reached, so the ace crossed a swarm without firing a shot.
  const memory = createAutopilotMemory();
  // The turret points +x while the nearer enemy is off to -x, so the mount has
  // half a turn to cross before it can fire at what it committed to.
  const near = world({
    sampledAtMs: 0,
    turretAngle: 0,
    enemies: [enemyAt("left", 1, 2200 - 700, 2200), enemyAt("right", 2, 2200 + 1300, 2200)]
  });
  assert.equal(commitTarget(rankTargets(near), ACE, memory, 0, near).entityId, "left");

  // They swap places: the ranking now prefers the one the turret happens to
  // face. Chasing that swap is what left the mount forever in transit.
  const swapped = world({
    sampledAtMs: 900,
    turretAngle: 0,
    enemies: [enemyAt("left", 1, 2200 - 1300, 2200), enemyAt("right", 2, 2200 + 700, 2200)]
  });
  commitTarget(rankTargets(swapped), ACE, memory, 900, swapped);
  assert.equal(commitTarget(rankTargets(swapped), ACE, memory, 960, swapped).entityId, "left");
});

test("a decisively better target still takes the turret", () => {
  const memory = createAutopilotMemory();
  const rock = {
    ...entity("rock", 1, { x: 2200 - 900, y: 2200, velocityX: 190 }),
    hp: 65,
    maxHp: 65
  };
  const first = world({ sampledAtMs: 0, turretAngle: Math.PI, asteroids: [rock] });
  commitTarget(rankTargets(first), ACE, memory, 0, first);

  // A missile outranks a rock by far, so the traverse spent is worth losing.
  const urgent = world({
    sampledAtMs: 900,
    turretAngle: Math.PI,
    asteroids: [rock],
    missiles: [entity("missile", 2, { x: 2500, y: 2200, velocityX: -240, heading: Math.PI })]
  });
  // The reaction delay still applies: it takes the newcomer on the next tick.
  commitTarget(rankTargets(urgent), ACE, memory, 900, urgent);
  assert.equal(commitTarget(rankTargets(urgent), ACE, memory, 960, urgent).entityId, "missile");
});

test("a cone narrower than one tick of traverse still lets the gun fire", () => {
  // The ace cone is 0.06 rad while the turret covers 0.068 in a tick, so an
  // exact-cone test can be stepped straight over and never sample true.
  const target = enemyAt("ahead", 1, 2200 + 600, 2200);
  const justOutside = world({ turretAngle: 0.065, enemies: [target] });
  assert.equal(planGunner(justOutside, ACE, createAutopilotMemory()).firing, true);

  // Far off the bearing it still holds fire.
  const swungAway = world({ turretAngle: 1.2, enemies: [target] });
  assert.equal(planGunner(swungAway, ACE, createAutopilotMemory()).firing, false);
});

test("the aiming picture carries the turret and the hull forward", () => {
  const frozen = world({ sampledAtMs: 0, turretAngle: 0 });
  const rates = { turret: 1.2, heading: -0.8 };

  // A tenth of a second of staleness at the stock traverse is already worth
  // more than the ace firing cone, so leaving these frozen aimed the gun by an
  // angle the mount had long since left.
  const carried = extrapolateWorld(frozen, 100, { angularRates: rates });
  assert.ok(Math.abs(carried.turretAngle - 0.12) < 1e-9);
  assert.ok(Math.abs(carried.ship.heading - -0.08) < 1e-9);

  // The turret cannot be carried faster than it can physically swing.
  const absurd = extrapolateWorld(frozen, 100, {
    angularRates: { turret: 50, heading: 0 },
    turretRate: 1
  });
  assert.ok(Math.abs(absurd.turretAngle - 0.1) < 1e-9);

  // The observation time survives the carrying forward.
  assert.equal(carried.rawSampledAtMs, 0);
  assert.equal(extrapolateWorld(carried, 150, { angularRates: rates }).rawSampledAtMs, 0);
});

test("angular rates are measured between two raw frames", () => {
  assert.deepEqual(measureAngularRates(undefined, world()), { turret: 0, heading: 0 });

  const first = world({ sampledAtMs: 0, turretAngle: 0 });
  const second = world({ sampledAtMs: 100, turretAngle: 0.2 });
  assert.ok(Math.abs(measureAngularRates(first, second).turret - 2) < 1e-9);

  // Same frame twice carries no information and must not read as motion.
  assert.deepEqual(measureAngularRates(first, first), { turret: 0, heading: 0 });
});

test("the bearing sweep is read off relative velocity, not off two samples", () => {
  // A frozen picture is exactly what the extrapolation clamp produces, and
  // sampling it twice used to report a dead-still target however fast it flew.
  const crossing = world({
    enemies: [enemyAt("crossing", 1, 2200 + 400, 2200, { velocityY: 800 })]
  });
  const target = crossing.enemies[0];
  assert.ok(Math.abs(bearingRate(crossing, target) - 2) < 1e-9);

  // Reading the same unchanged picture again gives the same answer.
  assert.equal(bearingRate(crossing, target), bearingRate(crossing, target));

  // A target running straight away sweeps not at all.
  const receding = world({
    enemies: [enemyAt("fleeing", 1, 2200 + 400, 2200, { velocityX: 300 })]
  });
  assert.equal(bearingRate(receding, receding.enemies[0]), 0);

  // Own motion counts: drifting sideways sweeps a stationary target.
  const drifting = world({
    ship: {
      x: 2200,
      y: 2200,
      heading: 0,
      velocityX: 0,
      velocityY: 400,
      radius: 52,
      hp: 500,
      maxHp: 500
    },
    enemies: [enemyAt("still", 1, 2200 + 400, 2200)]
  });
  assert.ok(Math.abs(bearingRate(drifting, drifting.enemies[0]) - -1) < 1e-9);
});

test("the lead solution waits out the swing as well as the flight", () => {
  const crossing = enemyAt("crossing", 1, 2200 + 700, 2200, { velocityY: 300 });

  // Turret already on the bearing: only the flight time is led out.
  const settled = world({ turretAngle: 0, enemies: [crossing] });
  const near = planGunner(settled, ACE, createAutopilotMemory()).aim;

  // Turret facing the other way: the swing costs time the target uses to run.
  const swung = world({ turretAngle: Math.PI, enemies: [crossing] });
  const far = planGunner(swung, ACE, createAutopilotMemory()).aim;

  assert.ok(far.y > near.y);
});
