import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client } from "@colyseus/sdk";
import {
  PROTOCOL_VERSION,
  ROOM_TYPE,
  clientMessage,
  serverLatencyProbeSchema,
  serverMessage
} from "@spaceship-defender/protocol";

const STEP_MS = 50;
const port = 35_677;
const endpoint = `ws://127.0.0.1:${String(port)}`;
const healthEndpoint = `http://127.0.0.1:${String(port)}/health`;
const protocolVersion = PROTOCOL_VERSION;
const serverEntry = fileURLToPath(new URL("../../server/dist/index.js", import.meta.url));
const serverProcess = spawn(process.execPath, [serverEntry], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    RECONNECTION_GRACE_SECONDS: "0.25"
  },
  stdio: "ignore",
  windowsHide: true
});

let display;
let pilot;
let gunner;
let shield;
let pilotSequence = 0;
let gunnerSequence = 0;
let shieldSequence = 0;
let gunnerEnabled = false;
let gunnerLockedTargetId;
let shieldEnabled = false;
let shieldLockedTargetId;
let shieldOpposite = false;
let shieldSurvivalMode = false;
const schedulers = [];

try {
  await waitForServer();
  display = await new Client(endpoint).create(ROOM_TYPE, {
    role: "display",
    protocolVersion
  });
  attachLatencyResponder(display);
  pilot = await joinController(display.roomId, "Pilot");
  gunner = await joinController(display.roomId, "Gunner");
  shield = await joinController(display.roomId, "Shield");
  await waitFor(() => display.state.players.size === 3);
  await waitFor(
    () =>
      display.state.displayLatencyMs >= 0 &&
      [...display.state.players.values()].every((player) => player.latencyMs >= 0),
    6_000
  );

  const roles = [...display.state.players.values()].map((player) => player.role);
  if (roles.join(",") !== "pilot,gunner,shield")
    throw new Error(`Unexpected roles: ${roles.join(",")}`);
  for (const controller of [pilot, gunner, shield]) {
    controller.send(clientMessage.ready, envelope(controller));
  }
  await waitFor(() => display.state.phase === "active" && display.state.hasGame === true);
  if (pilot.state.game.display !== undefined)
    throw new Error("Controller received display-only world collections.");
  const startX = display.state.game.spaceship.x;
  pilotSequence += 1;
  pilot.send(clientMessage.pilotInput, {
    ...envelope(pilot),
    sequence: pilotSequence,
    vector: { x: 1, y: 0 }
  });
  await waitFor(() => display.state.game.spaceship.x > startX);

  gunnerSequence += 1;
  gunner.send(clientMessage.gunnerInput, {
    ...envelope(gunner),
    sequence: gunnerSequence,
    aim: { x: 0, y: -1 },
    firing: true
  });
  await waitFor(() => display.state.game.turretAngle < 0);
  const traversingAngle = display.state.game.turretAngle;
  if (!(traversingAngle > -Math.PI / 2)) throw new Error("Turret aim snapped.");
  await waitFor(() => world().friendlyProjectiles.size > 0);
  const firstProjectile = world().friendlyProjectiles.values().next().value;
  if (firstProjectile === undefined) throw new Error("No synchronized friendly projectile.");
  const projectileAngle = Math.atan2(firstProjectile.velocityY, firstProjectile.velocityX);
  if (!(projectileAngle < 0 && projectileAngle > -Math.PI / 2))
    throw new Error("Projectile ignored the traversing turret angle.");

  shieldSequence += 1;
  shield.send(clientMessage.shieldInput, {
    ...envelope(shield),
    sequence: shieldSequence,
    aim: { x: -1, y: 0 },
    active: false
  });
  await waitFor(() => display.state.game.shield.angle > 0);
  if (display.state.game.shield.active || display.state.game.shield.energy !== 100)
    throw new Error("Inactive shield pre-aim consumed energy.");

  const roleError = nextServerError(shield);
  shield.send(clientMessage.pilotInput, {
    ...envelope(shield),
    sequence: shieldSequence,
    vector: { x: -1, y: 0 }
  });
  if ((await roleError).code !== "role_mismatch") throw new Error("Wrong role was accepted.");
  startRoleSchedulers();

  const firstSpawn = await waitForFirstSpawn();
  const expectedPrefix = firstSpawn.kind ?? "asteroid";
  if (firstSpawn.entityId !== `${expectedPrefix}-${String(firstSpawn.spawnSequence)}`)
    throw new Error("Spawn ID does not match its stable sequence.");
  const firstSpawnTick = display.state.game.tick;
  await waitFor(() => display.state.game.tick > firstSpawnTick + 1);
  const stableSpawn = findEntity(firstSpawn.entityId);
  if (stableSpawn !== undefined && stableSpawn.spawnSequence !== firstSpawn.spawnSequence)
    throw new Error("A live entity changed spawn identity.");
  assertUniqueSequences();

  gunner = await reconnectController(gunner, "combat");

  const gunship = await waitForEnemy("gunship", 35_000);
  shieldLockedTargetId = gunship.entityId;
  shieldEnabled = false;
  shieldOpposite = false;
  await waitFor(() => {
    const current = findEntity(gunship.entityId);
    if (current === undefined) return false;
    return (
      distance(current) < 900 &&
      Math.abs(angleDelta(display.state.game.shield.angle, bearing(current))) < 0.18
    );
  }, 35_000);
  shieldEnabled = true;
  const shieldBlock = await waitForShieldBlock(8_000);
  shieldLockedTargetId = undefined;

  shieldEnabled = false;
  shieldOpposite = true;
  await waitFor(() => {
    const source = closestThreat();
    if (source === undefined) return false;
    return (
      Math.abs(angleDelta(display.state.game.shield.angle, wrapAngle(bearing(source) + Math.PI))) <
      0.18
    );
  }, 15_000);
  const hpBeforeDirectionalMiss = display.state.game.spaceship.hp;
  shieldEnabled = true;
  await waitFor(
    () =>
      display.state.game.shield.active &&
      display.state.game.shield.energy > 4 &&
      display.state.game.spaceship.hp < hpBeforeDirectionalMiss,
    12_000
  );
  shieldEnabled = false;
  shieldOpposite = false;

  const hitTarget = await waitForShootableTarget(35_000);
  gunnerLockedTargetId = hitTarget.entityId;
  gunnerEnabled = true;
  await waitFor(() => {
    const current = findEntity(hitTarget.entityId);
    return current === undefined || current.hp < hitTarget.hp;
  }, 25_000);
  gunnerLockedTargetId = undefined;

  shieldOpposite = false;
  shieldSurvivalMode = true;
  await waitFor(() => encounter().phase === "intermission", 90_000);
  gunnerEnabled = false;
  pilot = await reconnectController(pilot, "intermission");
  const offer = await waitForUpgrade(pilot, "pilot");
  const duplicateCommand = makeUpgradeCommand(pilot, offer);
  pilot.send(clientMessage.upgradeChoose, duplicateCommand);
  await waitFor(() => pilot.state.game.upgrade.get("pilot")?.hasSelection === true);
  const upgradedModifiers = pilotModifierSnapshot();
  pilot = await reconnectController(pilot, "intermission");
  pilot.send(clientMessage.upgradeChoose, duplicateCommand);
  await delay(350);
  if (JSON.stringify(pilotModifierSnapshot()) !== JSON.stringify(upgradedModifiers))
    throw new Error("Duplicate upgrade applied twice after reconnect.");
  await chooseFirstUpgrade(gunner, "gunner");
  await chooseFirstUpgrade(shield, "shield");

  await waitFor(() => encounter().phase === "combat" && encounter().waveNumber === 2, 13_000);
  pilot.send(clientMessage.upgradeChoose, duplicateCommand);
  await delay(350);
  if (JSON.stringify(pilotModifierSnapshot()) !== JSON.stringify(upgradedModifiers))
    throw new Error("Duplicate upgrade replay after intermission applied twice.");

  console.log(
    JSON.stringify({
      roomId: display.roomId,
      phase: encounter().phase,
      waveNumber: encounter().waveNumber,
      firstSpawn: { ...firstSpawn, observedTick: firstSpawnTick },
      gunnerHit: { entityId: hitTarget.entityId, hpBefore: hitTarget.hp },
      shieldBlock,
      upgradeDuplicate: "idempotent",
      reconnectPhases: ["combat", "intermission"],
      displayLatencyMs: display.state.displayLatencyMs,
      playerLatencies: [...display.state.players.values()].map((player) => player.latencyMs)
    })
  );
} finally {
  for (const scheduler of schedulers) clearInterval(scheduler);
  await Promise.allSettled([pilot?.leave(), gunner?.leave(), shield?.leave(), display?.leave()]);
  serverProcess.kill();
}

function startRoleSchedulers() {
  schedulers.push(
    setInterval(() => {
      if (gunner === undefined || display === undefined || encounter().phase !== "combat") return;
      const target =
        (gunnerLockedTargetId === undefined ? undefined : findEntity(gunnerLockedTargetId)) ??
        closestTarget();
      gunnerSequence += 1;
      gunner.send(clientMessage.gunnerInput, {
        ...envelope(gunner),
        sequence: gunnerSequence,
        aim: target === undefined ? { x: 1, y: 0 } : interceptAim(target, 720),
        firing: gunnerEnabled && target !== undefined
      });
    }, STEP_MS)
  );
  schedulers.push(
    setInterval(() => {
      if (shield === undefined || display === undefined || encounter().phase !== "combat") return;
      const threat =
        (shieldLockedTargetId === undefined ? undefined : findEntity(shieldLockedTargetId)) ??
        closestThreat();
      if (shieldSurvivalMode) {
        if (display.state.game.shield.energy <= 8) shieldEnabled = false;
        else if (display.state.game.shield.energy >= 70) shieldEnabled = true;
      }
      let aim = threat === undefined ? { x: 1, y: 0 } : unitFromSpaceship(threat);
      if (shieldOpposite) aim = { x: -aim.x, y: -aim.y };
      shieldSequence += 1;
      shield.send(clientMessage.shieldInput, {
        ...envelope(shield),
        sequence: shieldSequence,
        aim,
        active: shieldEnabled
      });
    }, STEP_MS)
  );
}

async function waitForFirstSpawn() {
  await waitFor(() => durableThreats().length > 0, 5_000);
  const first = durableThreats().sort((a, b) => a.spawnSequence - b.spawnSequence)[0];
  if (first === undefined) throw new Error("Spawn director produced no entity.");
  return snapshot(first);
}

function assertUniqueSequences() {
  const sequences = dynamicEntities().map((entity) => entity.spawnSequence);
  if (new Set(sequences).size !== sequences.length)
    throw new Error("Dynamic entities published duplicate spawn sequences.");
}

async function waitForShieldBlock(timeoutMs) {
  let previous = shieldObservation();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await delay(15);
    const current = shieldObservation();
    const tickDelta = current.tick - previous.tick;
    if (tickDelta <= 0) continue;
    const removedNearShield = [...previous.projectiles.values()].some(
      (projectile) => projectile.distance <= 165 && !current.projectiles.has(projectile.entityId)
    );
    const passiveDrain = tickDelta * 20 * (STEP_MS / 1000);
    const collisionCost = previous.energy - current.energy - passiveDrain;
    if (
      previous.active &&
      removedNearShield &&
      current.hp === previous.hp &&
      collisionCost >= 3.5
    ) {
      return { collisionCost, hp: current.hp, tick: current.tick };
    }
    previous = current;
  }
  throw new Error("No authoritative shield block was observed.");
}

function shieldObservation() {
  return {
    tick: display.state.game.tick,
    hp: display.state.game.spaceship.hp,
    energy: display.state.game.shield.energy,
    active: display.state.game.shield.active,
    projectiles: new Map(
      [...world().hostileProjectiles.values()].map((projectile) => [
        projectile.entityId,
        { entityId: projectile.entityId, distance: distance(projectile) }
      ])
    )
  };
}

async function waitForShootableTarget(timeoutMs) {
  await waitFor(() => {
    const target = closestTarget();
    return target !== undefined && target.hp !== undefined && distance(target) < 1_000;
  }, timeoutMs);
  const target = closestTarget();
  if (target === undefined || target.hp === undefined) throw new Error("No shootable target.");
  return snapshot(target);
}

async function waitForEnemy(kind, timeoutMs) {
  await waitFor(() => hasEnemy(kind), timeoutMs);
  const enemy = [...world().enemyShips.values()]
    .filter((candidate) => candidate.kind === kind)
    .sort((a, b) => distance(a) - distance(b))[0];
  if (enemy === undefined) throw new Error(`No ${kind} was found.`);
  return snapshot(enemy);
}

function hasEnemy(kind) {
  return [...world().enemyShips.values()].some((enemy) => enemy.kind === kind);
}

async function reconnectController(room, expectedPhase) {
  const playerId = room.sessionId;
  const token = room.reconnectionToken;
  room.reconnection.enabled = false;
  room.connection.close();
  await waitFor(() => display.state.players.get(playerId)?.connected === false, 2_000);
  const reconnected = await new Client(endpoint).reconnect(token);
  attachLatencyResponder(reconnected);
  await waitFor(() => display.state.players.get(playerId)?.connected === true, 2_000);
  if (encounter().phase !== expectedPhase)
    throw new Error(`Reconnect escaped the ${expectedPhase} phase.`);
  return reconnected;
}

async function waitForUpgrade(room, role) {
  await waitFor(() => room.state.game.upgrade.get(role)?.offer.cards.length === 3, 2_000);
  const upgrade = room.state.game.upgrade.get(role);
  const card = upgrade?.offer.cards.at(0);
  if (upgrade === undefined || card === undefined) throw new Error(`No ${role} upgrade offer.`);
  return {
    offerId: upgrade.offer.offerId,
    waveNumber: upgrade.offer.waveNumber,
    upgradeId: card.upgradeId
  };
}

async function chooseFirstUpgrade(room, role) {
  const offer = await waitForUpgrade(room, role);
  room.send(clientMessage.upgradeChoose, makeUpgradeCommand(room, offer));
  await waitFor(() => room.state.game.upgrade.get(role)?.hasSelection === true, 2_000);
}

function makeUpgradeCommand(room, offer) {
  return { ...envelope(room), actionId: randomUUID(), ...offer };
}

function pilotModifierSnapshot() {
  const value = display.state.game.roleModifiers.pilot;
  return {
    speedMultiplier: value.speedMultiplier,
    accelerationMultiplier: value.accelerationMultiplier,
    maxHpBonus: value.maxHpBonus
  };
}

function world() {
  return display.state.game.display;
}

function encounter() {
  return display.state.game.encounter;
}

function durableThreats() {
  return [...world().enemyShips.values(), ...world().asteroids.values()];
}

function dynamicEntities() {
  return [
    ...durableThreats(),
    ...world().friendlyProjectiles.values(),
    ...world().hostileProjectiles.values(),
    ...world().homingMissiles.values()
  ];
}

function closestTarget() {
  return [
    ...world().homingMissiles.values(),
    ...world().enemyShips.values(),
    ...world().asteroids.values()
  ].sort((a, b) => distance(a) - distance(b))[0];
}

function closestThreat() {
  return [
    ...world().hostileProjectiles.values(),
    ...world().homingMissiles.values(),
    ...world().asteroids.values(),
    ...world().enemyShips.values()
  ].sort((a, b) => distance(a) - distance(b))[0];
}

function findEntity(id) {
  return (
    world().enemyShips.get(id) ??
    world().asteroids.get(id) ??
    world().friendlyProjectiles.get(id) ??
    world().hostileProjectiles.get(id) ??
    world().homingMissiles.get(id)
  );
}

function snapshot(entity) {
  return {
    entityId: entity.entityId,
    spawnSequence: entity.spawnSequence,
    ...(entity.kind === undefined ? {} : { kind: entity.kind }),
    x: entity.x,
    y: entity.y,
    ...(entity.heading === undefined ? {} : { heading: entity.heading }),
    ...(entity.hp === undefined ? {} : { hp: entity.hp })
  };
}

function distance(entity) {
  return Math.hypot(
    entity.x - display.state.game.spaceship.x,
    entity.y - display.state.game.spaceship.y
  );
}

function unitFromSpaceship(entity) {
  const x = entity.x - display.state.game.spaceship.x;
  const y = entity.y - display.state.game.spaceship.y;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function interceptAim(entity, projectileSpeed) {
  const x = entity.x - display.state.game.spaceship.x;
  const y = entity.y - display.state.game.spaceship.y;
  const velocityX = entity.velocityX ?? 0;
  const velocityY = entity.velocityY ?? 0;
  const quadratic = velocityX ** 2 + velocityY ** 2 - projectileSpeed ** 2;
  const linear = 2 * (x * velocityX + y * velocityY);
  const constant = x ** 2 + y ** 2;
  const discriminant = linear ** 2 - 4 * quadratic * constant;
  let seconds = 0;
  if (discriminant >= 0 && Math.abs(quadratic) > 1e-9) {
    const root = Math.sqrt(discriminant);
    const candidates = [
      (-linear - root) / (2 * quadratic),
      (-linear + root) / (2 * quadratic)
    ].filter((candidate) => candidate > 0);
    seconds = Math.min(...candidates, 0);
    if (seconds === 0 && candidates.length > 0) seconds = Math.min(...candidates);
  }
  const targetX = x + velocityX * seconds;
  const targetY = y + velocityY * seconds;
  const length = Math.hypot(targetX, targetY) || 1;
  return { x: targetX / length, y: targetY / length };
}

function bearing(entity) {
  return Math.atan2(
    entity.y - display.state.game.spaceship.y,
    entity.x - display.state.game.spaceship.x
  );
}

function angleDelta(from, to) {
  return wrapAngle(to - from);
}

function wrapAngle(angle) {
  const turn = Math.PI * 2;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

function envelope(room) {
  return {
    protocolVersion,
    roomId: display.roomId,
    playerId: room.sessionId,
    runNumber: display.state.runNumber
  };
}

async function joinController(roomId, playerName) {
  const room = await new Client(endpoint).joinById(roomId, {
    role: "controller",
    protocolVersion,
    playerName
  });
  attachLatencyResponder(room);
  return room;
}

function attachLatencyResponder(room) {
  room.onMessage(serverMessage.latencyProbe, (payload) => {
    const result = serverLatencyProbeSchema.safeParse(payload);
    if (!result.success) return;
    room.send(clientMessage.latencyPong, {
      protocolVersion,
      roomId: room.roomId,
      probeId: result.data.probeId
    });
  });
}

async function waitForServer() {
  await waitFor(async () => {
    try {
      return (await fetch(healthEndpoint)).ok;
    } catch {
      return false;
    }
  });
}

async function waitFor(predicate, timeoutMs = 3_000, intervalMs = 25) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(intervalMs);
  }
  throw new Error(`Network smoke timed out after ${String(timeoutMs)} ms.`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function nextServerError(room) {
  return Promise.race([
    new Promise((resolve) => room.onMessage(serverMessage.error, resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Expected server:error.")), 1_000))
  ]);
}
