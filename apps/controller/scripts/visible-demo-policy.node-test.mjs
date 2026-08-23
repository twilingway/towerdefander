import assert from "node:assert/strict";
import test from "node:test";

import {
  directAim,
  interceptAim,
  nextShieldActive,
  pilotVector,
  runWaveKey
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
