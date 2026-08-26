import assert from "node:assert/strict";
import test from "node:test";

import {
  createAutopilotMemory,
  directAim,
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

test("a drained shield is told to drop so the rearm latch clears", () => {
  const drained = world({
    shield: { angle: 0, active: true, energy: 0, capacity: 100, arcHalfAngle: Math.PI / 4 },
    missiles: [entity("missile", 1, { x: 2400, y: 2200, velocityX: -240, heading: Math.PI })]
  });
  assert.equal(planShield(drained, ACE, createAutopilotMemory()).active, false);
  assert.equal(planShield(drained, ROOKIE, createAutopilotMemory()).active, false);
});

test("the shield stays down above zero but below the profile floor", () => {
  const low = world({
    shield: { angle: 0, active: false, energy: 20, capacity: 100, arcHalfAngle: Math.PI / 4 },
    missiles: [entity("missile", 1, { x: 2400, y: 2200, velocityX: -240, heading: Math.PI })]
  });
  assert.equal(planShield(low, ACE, createAutopilotMemory()).active, false);
});

test("a missile inside the horizon turns the pilot across its bearing", () => {
  const incoming = world({
    missiles: [entity("missile", 1, { x: 2400, y: 2200, velocityX: -240, heading: Math.PI })]
  });
  const evading = planPilot(incoming, ACE, createAutopilotMemory());
  // The threat bears +x, so the break is perpendicular: no +x component left.
  assert.ok(Math.abs(evading.vector.x) < 1e-9);
  assert.ok(Math.abs(evading.vector.y) > 0.9);
  assert.equal(evading.mgFiring, false);

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
  const far = world({ enemies: [enemyAt("far", 1, 2200 + 1500, 2200)] });
  assert.ok(planPilot(far, ACE, createAutopilotMemory()).vector.x > 0.5);

  const near = world({ enemies: [enemyAt("near", 1, 2200 + 200, 2200)] });
  assert.ok(planPilot(near, ACE, createAutopilotMemory()).vector.x < 0);

  const onStation = world({ enemies: [enemyAt("station", 1, 2200 + 700, 2200)] });
  assert.deepEqual(planPilot(onStation, ACE, createAutopilotMemory()).vector, { x: 0, y: 0 });
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

  const noseStock = planPilot(crossing, ACE, createAutopilotMemory());
  const noseSlow = planPilot(crossing, ACE, createAutopilotMemory(), { mgSpeed: 350 });
  assert.notDeepEqual(noseStock.vector, noseSlow.vector);
});
