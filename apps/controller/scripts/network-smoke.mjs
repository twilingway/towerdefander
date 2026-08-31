import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@colyseus/sdk";
import {
  PROTOCOL_VERSION,
  ROOM_TYPE,
  TEAM_UPGRADE_PRICE,
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
    RECONNECTION_GRACE_SECONDS: "0.25",
    // Point at a path that never exists so the run uses built-in balance
    // defaults instead of whatever an operator saved from the console.
    BALANCE_PRESET_PATH: join(tmpdir(), `smoke-balance-${randomUUID()}.json`)
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
const observedAsteroidIds = new Set();
const observedAsteroidEntrySectors = new Set();
let arenaViolation;

try {
  await waitForServer();
  display = await new Client(endpoint).create(ROOM_TYPE, {
    role: "display",
    protocolVersion,
    crewSize: 3
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
  assertArenaContract();
  if (pilot.state.game.display !== undefined)
    throw new Error("Controller received display-only world collections.");
  const startX = display.state.game.spaceship.x;
  pilotSequence += 1;
  pilot.send(clientMessage.pilotInput, {
    ...envelope(pilot),
    sequence: pilotSequence,
    vector: { x: 1, y: 0 },
    mgFiring: false
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
    vector: { x: -1, y: 0 },
    mgFiring: false
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
  const offer = await waitForTeamOffer();
  const pilotCard = offer.cards.find((card) => card.role === "pilot");
  if (pilotCard === undefined) throw new Error("Team offer has no pilot card.");
  const duplicateCommand = makeVoteCommand(pilot, offer, pilotCard.upgradeId, 1);
  pilot.send(clientMessage.upgradeVote, duplicateCommand);
  await waitFor(() => teamUpgrade().votes.get("pilot")?.upgradeId === pilotCard.upgradeId);
  pilot = await reconnectController(pilot, "intermission");
  pilot.send(clientMessage.upgradeVote, duplicateCommand);
  await delay(350);
  if (teamUpgrade().votes.get("pilot")?.revision !== 1)
    throw new Error("Duplicate vote replay after reconnect changed the authoritative revision.");
  await voteForUpgrade(gunner, "gunner", offer, pilotCard.upgradeId);
  await voteForUpgrade(shield, "shield", offer, pilotCard.upgradeId);

  const purchase = await resolveTeamPurchase(offer, pilotCard);
  const modifiersAfterPurchase = pilotModifierSnapshot();
  await waitFor(() => observedAsteroidEntrySectors.size >= 2, 12_000);
  pilot.send(clientMessage.upgradeVote, duplicateCommand);
  await delay(350);
  if (JSON.stringify(pilotModifierSnapshot()) !== JSON.stringify(modifiersAfterPurchase))
    throw new Error("Vote replay after the intermission applied a second upgrade.");

  console.log(
    JSON.stringify({
      roomId: display.roomId,
      phase: encounter().phase,
      waveNumber: encounter().waveNumber,
      firstSpawn: { ...firstSpawn, observedTick: firstSpawnTick },
      gunnerHit: { entityId: hitTarget.entityId, hpBefore: hitTarget.hp },
      shieldBlock,
      circularArena: {
        radius: display.state.game.arenaRadius,
        observedAsteroids: observedAsteroidIds.size,
        entrySectors: [...observedAsteroidEntrySectors].sort((a, b) => a - b)
      },
      teamUpgrade: {
        offerId: purchase.offerId,
        selected: purchase.upgradeId,
        paidAfterWave: purchase.waveNumber,
        creditsBeforeVote: purchase.creditsBefore,
        creditsAfterPurchase: purchase.creditsAfter,
        voteReplay: "idempotent"
      },
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

function assertArenaContract() {
  const game = display.state.game;
  if (game.worldWidth !== 4_400 || game.worldHeight !== 4_400 || game.arenaRadius !== 2_200) {
    throw new Error(
      `Unexpected arena geometry: ${String(game.worldWidth)}x${String(game.worldHeight)}, radius ${String(game.arenaRadius)}.`
    );
  }
  observeArenaState();
  if (arenaViolation !== undefined) throw new Error(arenaViolation);
}

function observeArenaState() {
  if (display?.state?.hasGame !== true || display.state.game?.display === undefined) return;
  const game = display.state.game;
  const centerX = game.worldWidth / 2;
  const centerY = game.worldHeight / 2;
  const spaceshipDistance = Math.hypot(game.spaceship.x - centerX, game.spaceship.y - centerY);
  if (spaceshipDistance + game.spaceship.radius > game.arenaRadius + 0.001) {
    arenaViolation = "Authoritative spaceship left the circular arena.";
  }
  for (const enemy of game.display.enemyShips.values()) {
    const enemyDistance = Math.hypot(enemy.x - centerX, enemy.y - centerY);
    if (enemyDistance + enemy.radius > game.arenaRadius + 0.001) {
      arenaViolation = `Enemy ${enemy.entityId} left the circular arena.`;
    }
  }
  for (const asteroid of game.display.asteroids.values()) {
    if (observedAsteroidIds.has(asteroid.entityId)) continue;
    observedAsteroidIds.add(asteroid.entityId);
    const angle = Math.atan2(asteroid.y - centerY, asteroid.x - centerX);
    const normalized = ((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
    observedAsteroidEntrySectors.add(Math.floor(normalized * 8) % 8);
  }
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

/**
 * A cleared wave banks only its own budget, and threats that drift out of the
 * arena pay nothing, so the first intermission can end short of the price. Keep
 * fighting and voting until exactly one purchase resolves.
 */
async function resolveTeamPurchase(firstOffer, firstCard) {
  let offer = firstOffer;
  let card = firstCard;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const waveNumber = encounter().waveNumber;
    const creditsBefore = display.state.game.credits;
    const modifiersBefore = pilotModifierSnapshot();
    await waitFor(
      () => encounter().phase === "combat" && encounter().waveNumber === waveNumber + 1,
      40_000
    );
    const creditsAfter = display.state.game.credits;
    if (creditsBefore >= TEAM_UPGRADE_PRICE) {
      if (creditsAfter !== creditsBefore - TEAM_UPGRADE_PRICE)
        throw new Error(
          `Majority vote did not debit the shared balance exactly once: ${String(creditsBefore)} → ${String(creditsAfter)}.`
        );
      if (JSON.stringify(pilotModifierSnapshot()) === JSON.stringify(modifiersBefore))
        throw new Error("Winning upgrade did not reach the authoritative pilot modifiers.");
      if (!teamUpgrade().hasSelection || teamUpgrade().selection.upgradeId !== card.upgradeId)
        throw new Error(`Wave ${String(waveNumber + 1)} started without the voted selection.`);
      return {
        waveNumber,
        offerId: offer.offerId,
        upgradeId: card.upgradeId,
        creditsBefore,
        creditsAfter
      };
    }

    if (creditsAfter !== creditsBefore)
      throw new Error("An unaffordable offer still debited the shared balance.");
    if (JSON.stringify(pilotModifierSnapshot()) !== JSON.stringify(modifiersBefore))
      throw new Error("An unaffordable offer still applied a role modifier.");
    if (teamUpgrade().hasSelection)
      throw new Error("An unaffordable offer still published a selection.");

    gunnerEnabled = true;
    await waitFor(() => encounter().phase === "intermission", 150_000);
    gunnerEnabled = false;
    offer = await waitForTeamOffer();
    card = offer.cards.find((entry) => entry.role === "pilot");
    if (card === undefined) throw new Error("Team offer has no pilot card.");
    await voteForUpgrade(pilot, "pilot", offer, card.upgradeId);
    await voteForUpgrade(gunner, "gunner", offer, card.upgradeId);
    await voteForUpgrade(shield, "shield", offer, card.upgradeId);
  }
  throw new Error("Crew never banked enough credits for a team upgrade.");
}

function teamUpgrade() {
  return display.state.game.teamUpgrade;
}

async function waitForTeamOffer() {
  await waitFor(() => teamUpgrade().hasOffer && teamUpgrade().offer.cards.length === 3);
  const offer = teamUpgrade().offer;
  return {
    offerId: offer.offerId,
    waveNumber: offer.waveNumber,
    cards: [...offer.cards].map((card) => ({ upgradeId: card.upgradeId, role: card.role }))
  };
}

async function voteForUpgrade(room, role, offer, upgradeId) {
  room.send(clientMessage.upgradeVote, makeVoteCommand(room, offer, upgradeId, 1));
  await waitFor(() => teamUpgrade().votes.get(role)?.upgradeId === upgradeId);
}

function makeVoteCommand(room, offer, upgradeId, revision) {
  return {
    ...envelope(room),
    actionId: randomUUID(),
    waveNumber: offer.waveNumber,
    offerId: offer.offerId,
    upgradeId,
    revision
  };
}

/** What the crew has bought: the published proof that a purchase landed. */
function pilotModifierSnapshot() {
  return [...display.state.game.display.purchasedModules];
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
    observeArenaState();
    if (arenaViolation !== undefined) throw new Error(arenaViolation);
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
