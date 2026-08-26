const TURN_MS = 18_000;

export function pilotVector(elapsedMs) {
  const angle = ((elapsedMs % TURN_MS) / TURN_MS) * Math.PI * 2;
  return normalize({ x: Math.cos(angle), y: Math.sin(angle) });
}

export function interceptAim(spaceship, target, projectileSpeed = 720) {
  if (target === undefined) return { x: 1, y: 0 };
  const relativeX = target.x - spaceship.x;
  const relativeY = target.y - spaceship.y;
  const velocityX = target.velocityX ?? 0;
  const velocityY = target.velocityY ?? 0;
  const quadratic = velocityX ** 2 + velocityY ** 2 - projectileSpeed ** 2;
  const linear = 2 * (relativeX * velocityX + relativeY * velocityY);
  const constant = relativeX ** 2 + relativeY ** 2;
  const discriminant = linear ** 2 - 4 * quadratic * constant;
  let seconds = 0;

  if (discriminant >= 0 && Math.abs(quadratic) > 1e-9) {
    const root = Math.sqrt(discriminant);
    const candidates = [
      (-linear - root) / (2 * quadratic),
      (-linear + root) / (2 * quadratic)
    ].filter((candidate) => candidate > 0);
    if (candidates.length > 0) seconds = Math.min(...candidates);
  }

  return normalize({
    x: relativeX + velocityX * seconds,
    y: relativeY + velocityY * seconds
  });
}

export function directAim(spaceship, target) {
  if (target === undefined) return { x: 1, y: 0 };
  return normalize({ x: target.x - spaceship.x, y: target.y - spaceship.y });
}

export function nextShieldActive(current, energy) {
  if (energy <= 8) return false;
  if (energy >= 70) return true;
  return current;
}

export function runWaveKey(runNumber, waveNumber) {
  return `${String(runNumber)}:${String(waveNumber)}`;
}

export function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= Number.EPSILON) return { x: 1, y: 0 };
  return { x: vector.x / length, y: vector.y / length };
}

const TICK_MS = 50;
/**
 * Stock muzzle velocities, used only when the caller does not know better.
 * Both are editable in the balance console, so the harness passes the real
 * ones through and the lead solution follows the preset.
 */
const CANNON_PROJECTILE_SPEED = 720;
const MG_PROJECTILE_SPEED = 900;
/** Every stock missile turns at this rate, so extrapolation can follow it. */
const MISSILE_TURN_RATE_PER_SECOND = Math.PI / 2;
/** How far the picture may be carried forward between telemetry samples. */
const MAX_EXTRAPOLATION_SECONDS = 0.2;
/** Fraction of the stand-off distance treated as "on station". */
const STANDOFF_BAND = 0.15;
/** Fraction of the arena radius past which the orbit turns back inward. */
const RIM_FRACTION = 0.8;

const ZERO_VECTOR = { x: 0, y: 0 };

/**
 * Deterministic noise source. The demo replays the same run, so aim jitter must
 * not turn the verification pass into a coin flip.
 */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Mutable per-run scratch space: committed target, orbit side, noise stream. */
export function createAutopilotMemory(seed = 1) {
  return {
    random: mulberry32(seed),
    target: undefined,
    candidateId: undefined,
    candidateSinceMs: 0,
    committedAtMs: 0,
    decidedAtMs: undefined,
    orbitSign: 1,
    shieldActive: false
  };
}

export function canonicalizeAngle(angle) {
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function shortestAngleDelta(current, target) {
  return canonicalizeAngle(target - current);
}

function bearingVector(angle) {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function distanceBetween(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function compareEntities(left, right) {
  return left.spawnSequence - right.spawnSequence || left.entityId.localeCompare(right.entityId);
}

/**
 * Seconds until a moving entity reaches `reach` units of the ship, or undefined
 * when the two never close that far. Zero means they already overlap.
 */
export function timeToContact(ship, reach, entity) {
  const relativeX = entity.x - ship.x;
  const relativeY = entity.y - ship.y;
  const closingX = entity.velocityX - (ship.velocityX ?? 0);
  const closingY = entity.velocityY - (ship.velocityY ?? 0);
  const range = reach + entity.radius;
  const constant = relativeX ** 2 + relativeY ** 2 - range ** 2;
  if (constant <= 0) return 0;
  const quadratic = closingX ** 2 + closingY ** 2;
  if (quadratic <= 1e-9) return undefined;
  const linear = 2 * (relativeX * closingX + relativeY * closingY);
  const discriminant = linear ** 2 - 4 * quadratic * constant;
  if (discriminant < 0) return undefined;
  const root = Math.sqrt(discriminant);
  const early = (-linear - root) / (2 * quadratic);
  const late = (-linear + root) / (2 * quadratic);
  if (early >= 0) return early;
  return late >= 0 ? late : undefined;
}

function advanceEntity(entity, seconds) {
  return {
    ...entity,
    x: entity.x + entity.velocityX * seconds,
    y: entity.y + entity.velocityY * seconds
  };
}

function steerMissile(missile, ship, seconds) {
  const speed = Math.hypot(missile.velocityX, missile.velocityY);
  if (speed <= Number.EPSILON) return missile;
  const current = Math.atan2(missile.velocityY, missile.velocityX);
  const wanted = Math.atan2(ship.y - missile.y, ship.x - missile.x);
  const delta = shortestAngleDelta(current, wanted);
  const limit = MISSILE_TURN_RATE_PER_SECOND * seconds;
  const turned = canonicalizeAngle(current + Math.max(-limit, Math.min(limit, delta)));
  return {
    ...missile,
    heading: turned,
    velocityX: Math.cos(turned) * speed,
    velocityY: Math.sin(turned) * speed
  };
}

/**
 * Telemetry is sampled at half the rate commands are sent, so the picture is
 * carried forward by its own velocities rather than aimed at stale positions.
 * Missiles are turned toward the ship first, because they home.
 */
export function extrapolateWorld(world, nowMs) {
  const seconds = Math.min(
    Math.max((nowMs - world.sampledAtMs) / 1000, 0),
    MAX_EXTRAPOLATION_SECONDS
  );
  if (seconds === 0) return world;
  const ship = advanceEntity(world.ship, seconds);

  return {
    ...world,
    sampledAtMs: nowMs,
    ship,
    enemies: world.enemies.map((enemy) => advanceEntity(enemy, seconds)),
    bullets: world.bullets.map((bullet) => advanceEntity(bullet, seconds)),
    asteroids: world.asteroids.map((rock) => advanceEntity(rock, seconds)),
    missiles: world.missiles.map((missile) =>
      advanceEntity(steerMissile(missile, ship, seconds), seconds)
    )
  };
}

function maxEngagementRange(archetype) {
  return archetype.weapons.reduce((widest, weapon) => Math.max(widest, weapon.engagementRange), 0);
}

/**
 * One ranking shared by both gunners. Interceptable missiles outrank everything
 * because they are lethal and destructible; a boss outranks ordinary ships; an
 * enemy already inside its own engagement range outranks one still approaching.
 */
export function rankTargets(world, options = {}) {
  const archetypes = options.archetypes ?? {};
  const frameRadius = Math.max(world.cameraViewWidth / 2, 1);
  const scored = [];

  for (const missile of world.missiles) {
    const seconds = timeToContact(world.ship, world.shieldRadius, missile);
    scored.push({
      entity: missile,
      role: "missile",
      score: seconds === undefined ? 40 : 100 - seconds * 10
    });
  }

  for (const enemy of world.enemies) {
    const archetype = archetypes[enemy.kind];
    const distance = distanceBetween(world.ship, enemy);
    const isBoss = enemy.kind === "boss" || archetype?.spawnPolicy === "boss";
    const engaging = archetype !== undefined && distance <= maxEngagementRange(archetype);
    const proximity = 10 * Math.max(0, 1 - distance / frameRadius);
    const finishable = enemy.hp / enemy.maxHp <= 0.3 ? 8 : 0;
    scored.push({
      entity: enemy,
      role: "enemy",
      score: (isBoss ? 60 : 30) + (engaging ? 12 : 0) + proximity + finishable
    });
  }

  for (const rock of world.asteroids) {
    const seconds = timeToContact(world.ship, world.shieldRadius, rock);
    scored.push({
      entity: rock,
      role: "asteroid",
      score: seconds === undefined ? 4 : 25 - seconds * 2
    });
  }

  scored.sort(
    (left, right) => right.score - left.score || compareEntities(left.entity, right.entity)
  );
  return scored;
}

/**
 * Turns the ranking into a target the bot is willing to act on. A committed
 * target is kept for at least the retarget interval, and a better one has to
 * hold the top spot for the reaction delay before it is taken — otherwise the
 * nose chatters between equally-ranked enemies.
 */
export function commitTarget(ranked, profile, memory, nowMs) {
  if (memory.decidedAtMs === nowMs) return memory.target;
  memory.decidedAtMs = nowMs;

  const best = ranked[0]?.entity;
  const committed =
    memory.target === undefined
      ? undefined
      : ranked.find(({ entity }) => entity.entityId === memory.target.entityId)?.entity;
  if (committed === undefined) {
    memory.target = undefined;
    memory.candidateId = undefined;
  } else {
    memory.target = committed;
  }

  if (best === undefined) {
    memory.target = undefined;
    return undefined;
  }
  if (memory.target === undefined) {
    memory.target = best;
    memory.committedAtMs = nowMs;
    memory.candidateId = undefined;
    return best;
  }
  if (best.entityId === memory.target.entityId) {
    memory.candidateId = undefined;
    return memory.target;
  }
  if (nowMs - memory.committedAtMs < profile.retargetIntervalTicks * TICK_MS) {
    return memory.target;
  }
  if (memory.candidateId !== best.entityId) {
    memory.candidateId = best.entityId;
    memory.candidateSinceMs = nowMs;
  }
  if (nowMs - memory.candidateSinceMs >= profile.reactionTicks * TICK_MS) {
    memory.target = best;
    memory.committedAtMs = nowMs;
    memory.candidateId = undefined;
  }
  return memory.target;
}

/** Bearing to fire at: the lead solution mixed toward the target by the profile. */
export function aimBearing(world, target, projectileSpeed, profile, memory) {
  const lead = interceptAim(world.ship, target, projectileSpeed);
  const direct = directAim(world.ship, target);
  const blended = normalize({
    x: direct.x + (lead.x - direct.x) * profile.leadFactor,
    y: direct.y + (lead.y - direct.y) * profile.leadFactor
  });
  const noise =
    profile.aimJitterRadians <= 0 ? 0 : (memory.random() * 2 - 1) * profile.aimJitterRadians;
  return canonicalizeAngle(Math.atan2(blended.y, blended.x) + noise);
}

/**
 * Soonest threat to reach the shield ring, with the bearing it will arrive on.
 * Ordered by time, not by distance: a slow rock further out can beat a bullet.
 */
export function nextShieldContact(world) {
  let soonest;
  const threats = [
    ...world.missiles.map((entity) => ({ entity, weight: 3 })),
    ...world.asteroids.map((entity) => ({ entity, weight: 2 })),
    ...world.bullets.map((entity) => ({ entity, weight: 1 }))
  ];

  for (const { entity, weight } of threats) {
    const seconds = timeToContact(world.ship, world.shieldRadius, entity);
    if (seconds === undefined) continue;
    if (
      soonest === undefined ||
      seconds < soonest.seconds ||
      (seconds === soonest.seconds && weight > soonest.weight)
    ) {
      const arrival = advanceEntity(entity, seconds);
      soonest = {
        entity,
        weight,
        seconds,
        bearing: Math.atan2(arrival.y - world.ship.y, arrival.x - world.ship.x)
      };
    }
  }

  return soonest;
}

function shieldAlreadyCovers(world, bearing) {
  if (!world.shield.active || world.shield.energy <= 0) return false;
  return Math.abs(shortestAngleDelta(world.shield.angle, bearing)) <= world.shield.arcHalfAngle;
}

export function planShield(world, profile, memory) {
  const contact = nextShieldContact(world);
  const aim =
    contact === undefined ? bearingVector(world.shield.angle) : bearingVector(contact.bearing);

  if (!profile.threatAwareShield) {
    memory.shieldActive = nextShieldActive(memory.shieldActive, world.shield.energy);
    return { aim, active: memory.shieldActive };
  }

  if (contact === undefined || contact.seconds > profile.shieldLeadTicks * (TICK_MS / 1000)) {
    // Dropping it is also what clears the rearm latch after a depletion.
    memory.shieldActive = false;
    return { aim, active: false };
  }

  memory.shieldActive = world.shield.energy > world.shield.capacity * profile.shieldMinEnergy;
  return { aim, active: memory.shieldActive };
}

export function planGunner(world, profile, memory, options = {}) {
  const nowMs = options.nowMs ?? world.sampledAtMs;
  const target = commitTarget(rankTargets(world, options), profile, memory, nowMs);
  if (target === undefined) return { aim: bearingVector(world.turretAngle), firing: false };

  const speed = options.cannonSpeed ?? CANNON_PROJECTILE_SPEED;
  const bearing = aimBearing(world, target, speed, profile, memory);
  // The shot leaves along the turret real angle, so wait out the traverse.
  const firing =
    Math.abs(shortestAngleDelta(world.turretAngle, bearing)) <= profile.cannonConeRadians;
  return { aim: bearingVector(bearing), firing };
}

/**
 * The break that beats the threat about to land. Enemy bullets never lead the
 * ship, so any steady sideways speed defeats them; missiles turn at a bounded
 * rate, so a late perpendicular break outruns their turn circle.
 */
function escapeVector(world, profile) {
  const horizonSeconds = profile.evadeHorizonTicks * (TICK_MS / 1000);
  if (horizonSeconds <= 0) return undefined;

  const threats = [];
  if (profile.evadeMissiles) threats.push(...world.missiles);
  if (profile.dodgeBullets) threats.push(...world.bullets, ...world.asteroids);

  let soonest;
  for (const threat of threats) {
    const seconds = timeToContact(world.ship, world.ship.radius, threat);
    if (seconds === undefined || seconds > horizonSeconds) continue;
    if (soonest === undefined || seconds < soonest.seconds) soonest = { threat, seconds };
  }
  if (soonest === undefined) return undefined;

  const bearing = Math.atan2(soonest.threat.y - world.ship.y, soonest.threat.x - world.ship.x);
  if (shieldAlreadyCovers(world, bearing)) return undefined;

  const left = bearingVector(canonicalizeAngle(bearing + Math.PI / 2));
  const right = bearingVector(canonicalizeAngle(bearing - Math.PI / 2));
  const inward = normalize({
    x: world.worldWidth / 2 - world.ship.x,
    y: world.worldHeight / 2 - world.ship.y
  });
  return left.x * inward.x + left.y * inward.y >= right.x * inward.x + right.y * inward.y
    ? left
    : right;
}

function orbitVector(world, target, profile, memory, distance) {
  const radial = normalize({ x: target.x - world.ship.x, y: target.y - world.ship.y });
  let tangential = { x: -radial.y * memory.orbitSign, y: radial.x * memory.orbitSign };

  const centreX = world.worldWidth / 2;
  const centreY = world.worldHeight / 2;
  const fromCentre = Math.hypot(world.ship.x - centreX, world.ship.y - centreY);
  if (fromCentre > world.arenaRadius * RIM_FRACTION) {
    const outward = normalize({ x: world.ship.x - centreX, y: world.ship.y - centreY });
    if (tangential.x * outward.x + tangential.y * outward.y > 0) {
      memory.orbitSign = -memory.orbitSign;
      tangential = { x: -tangential.x, y: -tangential.y };
    }
  }

  // Positive closes the range, negative opens it; the rest goes sideways.
  const closing = Math.max(
    -1,
    Math.min(1, (distance - profile.standoffDistance) / profile.standoffDistance)
  );
  const sideways = 1 - Math.abs(closing);
  return normalize({
    x: radial.x * closing + tangential.x * sideways,
    y: radial.y * closing + tangential.y * sideways
  });
}

/**
 * One vector carries thrust, hull heading and the nose gun bore at once, so the
 * pilot resolves a strict priority instead of blending wishes: escape, then
 * range, then aim, then coast. Coasting is the only way to fire from a settled
 * heading, because a zero vector brakes but keeps the course.
 */
export function planPilot(world, profile, memory, options = {}) {
  const nowMs = options.nowMs ?? world.sampledAtMs;
  const target = commitTarget(rankTargets(world, options), profile, memory, nowMs);
  const escape = escapeVector(world, profile);
  if (escape !== undefined) return { vector: escape, mgFiring: false };

  if (target === undefined) {
    return { vector: profile.orbit ? ZERO_VECTOR : pilotVector(nowMs), mgFiring: false };
  }

  const speed = options.mgSpeed ?? MG_PROJECTILE_SPEED;
  const bearing = aimBearing(world, target, speed, profile, memory);
  const onAxis = Math.abs(shortestAngleDelta(world.ship.heading, bearing)) <= profile.mgConeRadians;
  const mgFiring =
    onAxis &&
    !world.machineGun.overheated &&
    world.machineGun.heat <= world.machineGun.capacity * profile.mgHeatCeiling;

  // Without the orbit skill the pilot keeps the old circular patrol.
  if (!profile.orbit) return { vector: pilotVector(nowMs), mgFiring };

  const distance = distanceBetween(world.ship, target);
  if (Math.abs(distance - profile.standoffDistance) <= profile.standoffDistance * STANDOFF_BAND) {
    return { vector: onAxis ? ZERO_VECTOR : bearingVector(bearing), mgFiring };
  }
  return { vector: orbitVector(world, target, profile, memory, distance), mgFiring };
}
