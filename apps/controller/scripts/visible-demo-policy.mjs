import { CAMERA_VIEW_ASPECT } from "@spaceship-defender/protocol";

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
/** Inside this fraction of the arena the search sweeps instead of closing in. */
const SEARCH_CENTRE_FRACTION = 0.35;
/** Share of the frame's short side the stand-off ring may occupy. */
const STANDOFF_FRAME_FRACTION = 0.8;
/** Stock turret traverse, used only when the caller does not know better. */
const TURRET_RATE_PER_SECOND = (13 * Math.PI) / 30;
/**
 * Share of the turret's traverse the bearing may demand before the geometry
 * counts as unwinnable. Below one because the turret has to accelerate into
 * every reversal, so it never delivers its top rate around a circle.
 */
const TRAVERSE_MARGIN = 0.6;
/** Longest swing the lead solution will wait out; beyond it the guess is noise. */
const MAX_TRAVERSE_LEAD_SECONDS = 1.5;
/** Bearing error above which the turret still counts as travelling. */
const TRAVERSE_SETTLE_RADIANS = 0.25;
/** How much better a new target must rank to be worth abandoning the traverse. */
const DECISIVE_SCORE_RATIO = 1.5;
/** Threat weight from `nextShieldContact` worth spending the last energy on. */
const COSTLY_THREAT_WEIGHT = 2;

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
 * Angular speed of the turret and the hull between two telemetry frames. Only
 * consecutive raw frames may be passed: an extrapolated picture carries these
 * angles forward itself, so measuring off one would compound its own estimate.
 */
export function measureAngularRates(previous, next) {
  if (previous === undefined) return { turret: 0, heading: 0 };
  const seconds = (next.sampledAtMs - previous.sampledAtMs) / 1000;
  if (seconds <= 0) return { turret: 0, heading: 0 };
  return {
    turret: shortestAngleDelta(previous.turretAngle, next.turretAngle) / seconds,
    heading: shortestAngleDelta(previous.ship.heading, next.ship.heading) / seconds
  };
}

function clampRate(rate, limit) {
  return Math.max(-limit, Math.min(limit, rate));
}

/**
 * Telemetry is sampled slower than commands are sent, so the picture is carried
 * forward by its own velocities rather than aimed at stale positions. Missiles
 * are turned toward the ship first, because they home.
 *
 * The turret and the hull are carried forward too. Leaving them frozen was worth
 * up to a quarter radian of phantom aiming error at the traverse rate — several
 * times the ace firing cone — so the bot opened fire believing it was on bearing
 * while the mount was still swinging, and the shots passed wide.
 */
export function extrapolateWorld(world, nowMs, options = {}) {
  const seconds = Math.min(
    Math.max((nowMs - world.sampledAtMs) / 1000, 0),
    MAX_EXTRAPOLATION_SECONDS
  );
  if (seconds === 0) return world;
  const rates = options.angularRates ?? { turret: 0, heading: 0 };
  const turretLimit = options.turretRate ?? TURRET_RATE_PER_SECOND;
  const moved = advanceEntity(world.ship, seconds);
  const ship = {
    ...moved,
    // The hull turns at exactly twice the turret in every stock preset.
    heading: canonicalizeAngle(moved.heading + clampRate(rates.heading, turretLimit * 2) * seconds)
  };

  return {
    ...world,
    sampledAtMs: nowMs,
    /** When the picture was actually observed, before any carrying forward. */
    rawSampledAtMs: world.rawSampledAtMs ?? world.sampledAtMs,
    turretAngle: canonicalizeAngle(
      world.turretAngle + clampRate(rates.turret, turretLimit) * seconds
    ),
    ship,
    enemies: world.enemies.map((enemy) => advanceEntity(enemy, seconds)),
    bullets: world.bullets.map((bullet) => advanceEntity(bullet, seconds)),
    asteroids: world.asteroids.map((rock) => advanceEntity(rock, seconds)),
    missiles: world.missiles.map((missile) =>
      advanceEntity(steerMissile(missile, ship, seconds), seconds)
    )
  };
}

/**
 * Already past the rim and still heading out. Enemies are held inside the
 * arena by the simulation, but asteroids drift through it and then despawn, so
 * one that is on its way out is not worth a shot or a turret traverse.
 */
function isLeavingArena(world, entity) {
  const offsetX = entity.x - world.worldWidth / 2;
  const offsetY = entity.y - world.worldHeight / 2;
  if (Math.hypot(offsetX, offsetY) <= world.arenaRadius) return false;
  return offsetX * entity.velocityX + offsetY * entity.velocityY >= 0;
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
    if (isLeavingArena(world, rock)) continue;
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
export function commitTarget(ranked, profile, memory, nowMs, world) {
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
  // A swarm reshuffles the ranking faster than the mount can cross the arc, so
  // switching on every reshuffle leaves the turret permanently in transit and
  // never on target. Spend the traverse already invested unless the newcomer is
  // decisively more dangerous.
  if (world !== undefined) {
    const committedScore =
      ranked.find(({ entity }) => entity.entityId === memory.target.entityId)?.score ?? 0;
    const bestScore = ranked[0]?.score ?? 0;
    const aim = directAim(world.ship, memory.target);
    const pending = Math.abs(shortestAngleDelta(world.turretAngle, Math.atan2(aim.y, aim.x)));
    if (bestScore <= committedScore * DECISIVE_SCORE_RATIO && pending > TRAVERSE_SETTLE_RADIANS) {
      return memory.target;
    }
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

  // The hit inside the window is already unavoidable, so a threshold that
  // refuses to spend the last quarter of the battery just moves the damage onto
  // the hull — under sustained fire the energy never climbs back and the shield
  // never comes up again. Below the reserve the bot still spends, but only on
  // what actually hurts: bullets get through, missiles and rocks do not.
  const reserved = world.shield.energy <= world.shield.capacity * profile.shieldMinEnergy;
  memory.shieldActive =
    world.shield.energy > 0 && (!reserved || contact.weight >= COSTLY_THREAT_WEIGHT);
  return { aim, active: memory.shieldActive };
}

/**
 * Where to point so the shot connects, allowing for the mount having to get
 * there first. Solving for flight time alone aims at where the target was when
 * the swing started, which against a crossing target is a miss by the width of
 * the swing — and the swing is the slowest part of the whole shot.
 */
function leadWithTraverse(world, target, speed, profile, memory, currentAngle, turnRate) {
  // Jitter is applied once, on the final solution, so the first pass must not
  // draw from the noise stream and shift every later draw with it.
  const straight = { ...profile, aimJitterRadians: 0 };
  const first = aimBearing(world, target, speed, straight, memory);
  if (turnRate <= 0) return aimBearing(world, target, speed, profile, memory);

  const traverse = Math.min(
    Math.abs(shortestAngleDelta(currentAngle, first)) / turnRate,
    MAX_TRAVERSE_LEAD_SECONDS
  );
  if (traverse <= 0) return aimBearing(world, target, speed, profile, memory);
  return aimBearing(world, advanceEntity(target, traverse), speed, profile, memory);
}

export function planGunner(world, profile, memory, options = {}) {
  const nowMs = options.nowMs ?? world.sampledAtMs;
  const target = commitTarget(rankTargets(world, options), profile, memory, nowMs, world);
  if (target === undefined) return { aim: bearingVector(world.turretAngle), firing: false };

  const speed = options.cannonSpeed ?? CANNON_PROJECTILE_SPEED;
  const bearing = leadWithTraverse(
    world,
    target,
    speed,
    profile,
    memory,
    world.turretAngle,
    options.turretRate ?? TURRET_RATE_PER_SECOND
  );
  // The shot leaves along the turret real angle, so wait out the traverse. A
  // cone narrower than one tick of that traverse would be stepped over without
  // ever being sampled, so arriving within a tick counts as arrived.
  const reach = (options.turretRate ?? TURRET_RATE_PER_SECOND) * (TICK_MS / 1000);
  const firing =
    Math.abs(shortestAngleDelta(world.turretAngle, bearing)) <=
    Math.max(profile.cannonConeRadians, reach);
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

/**
 * Bearing back along the course of the nearest shot crossing the screen. A
 * sniper reaches almost three times further than the camera frames and a boss
 * launches from beyond it too, so their shots are the only evidence of them
 * the bot ever gets. Walking one back points at whatever fired it.
 */
export function huntVector(world) {
  let nearest;
  for (const shot of [...world.bullets, ...world.missiles]) {
    if (Math.hypot(shot.velocityX, shot.velocityY) <= Number.EPSILON) continue;
    const distance = distanceBetween(world.ship, shot);
    if (nearest !== undefined && distance >= nearest.distance) continue;
    nearest = { distance, bearing: Math.atan2(-shot.velocityY, -shot.velocityX) };
  }
  return nearest === undefined ? undefined : bearingVector(nearest.bearing);
}

/**
 * Nothing worth shooting is on screen. Standing still is the one thing the bot
 * must not do here: several archetypes out-range the camera frame, so parking
 * means being shot to pieces by something that never comes into view. Incoming
 * fire is visible even when its owner is not, so the bot walks the shots back
 * to their source; with the screen truly empty it heads for the middle of the
 * arena and sweeps there, which is where the frame covers the most ground.
 */
function searchVector(world, memory) {
  const inwardX = world.worldWidth / 2 - world.ship.x;
  const inwardY = world.worldHeight / 2 - world.ship.y;
  if (Math.hypot(inwardX, inwardY) > world.arenaRadius * SEARCH_CENTRE_FRACTION) {
    return normalize({ x: inwardX, y: inwardY });
  }
  const inward = normalize({ x: inwardX, y: inwardY });
  return { x: -inward.y * memory.orbitSign, y: inward.x * memory.orbitSign };
}

/**
 * The ring the pilot actually holds. A ring wider than the camera frames
 * pushes the target off the screen, and what the bot cannot see it drops, so
 * the operator's number is capped by what a viewer has in front of them. The
 * frame's short side is its height, so that is what bounds it.
 */
export function effectiveStandoff(world, profile) {
  const halfHeight = (world.cameraViewWidth * CAMERA_VIEW_ASPECT) / 2;
  return Math.min(profile.standoffDistance, halfHeight * STANDOFF_FRAME_FRACTION);
}

/**
 * How fast the bearing to a target sweeps, in radians per second, taken from
 * the relative velocity rather than from two samples of the bearing. Sampling
 * cannot work here: between telemetry frames the picture is carried forward by
 * extrapolation, and once that hits its clamp two consecutive ticks read the
 * very same positions — a zero sweep no matter how fast the target crosses.
 */
export function bearingRate(world, target) {
  const relativeX = target.x - world.ship.x;
  const relativeY = target.y - world.ship.y;
  const rangeSquared = relativeX ** 2 + relativeY ** 2;
  if (rangeSquared <= Number.EPSILON) return 0;

  const velocityX = (target.velocityX ?? 0) - world.ship.velocityX;
  const velocityY = (target.velocityY ?? 0) - world.ship.velocityY;
  return (relativeX * velocityY - relativeY * velocityX) / rangeSquared;
}

/**
 * A target crossing faster than the turret can follow can never be brought into
 * the firing cone: the mount tops out at its traverse rate while the bearing
 * keeps running away, which is how an ace and a gunship ended up circling each
 * other for minutes without a shot. Flying at the intercept point instead puts
 * the target on a constant bearing, which drives the sweep to nothing and hands
 * the fight to the hull — it turns twice as fast as the turret does.
 */
function traverseLosing(world, target, options) {
  const rate = options.turretRate ?? TURRET_RATE_PER_SECOND;
  return Math.abs(bearingRate(world, target)) > rate * TRAVERSE_MARGIN;
}

function orbitVector(world, target, profile, memory, distance) {
  const standoff = effectiveStandoff(world, profile);
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
  const closing = Math.max(-1, Math.min(1, (distance - standoff) / standoff));
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
  const ranked = rankTargets(world, options);
  const target = commitTarget(ranked, profile, memory, nowMs, world);
  const escape = escapeVector(world, profile);

  const speed = options.mgSpeed ?? MG_PROJECTILE_SPEED;
  // The nose gun fires along the hull, which swings at twice the turret rate,
  // so the same allowance for getting there applies with a doubled rate.
  const bearing =
    target === undefined
      ? undefined
      : leadWithTraverse(
          world,
          target,
          speed,
          profile,
          memory,
          world.ship.heading,
          (options.turretRate ?? TURRET_RATE_PER_SECOND) * 2
        );
  const onAxis =
    bearing !== undefined &&
    Math.abs(shortestAngleDelta(world.ship.heading, bearing)) <= profile.mgConeRadians;
  const mgFiring =
    onAxis &&
    !world.machineGun.overheated &&
    world.machineGun.heat <= world.machineGun.capacity * profile.mgHeatCeiling;

  // The break outranks every manoeuvre, but the gun does not stop: firing is a
  // question of where the nose already points, and a long evasion swings it
  // across targets that are worth the burst.
  if (escape !== undefined) return { vector: escape, mgFiring };

  // Without the orbit skill the pilot keeps the old circular patrol.
  if (!profile.orbit) return { vector: pilotVector(nowMs), mgFiring };

  // A rock on screen is work for the guns, never a reason to stop hunting: the
  // ships that actually kill the crew shoot from outside the camera frame, and
  // the turret keeps servicing the rock while the pilot goes after them.
  const role = ranked.find(({ entity }) => entity.entityId === target?.entityId)?.role;
  if (role !== "enemy" && role !== "missile") {
    return { vector: huntVector(world) ?? searchVector(world, memory), mgFiring };
  }

  // Holding a ring around a target the turret cannot track is the stalemate:
  // close on the intercept point instead and let the nose gun finish it.
  if (traverseLosing(world, target, options)) {
    return { vector: bearingVector(bearing), mgFiring };
  }

  const distance = distanceBetween(world.ship, target);
  const standoff = effectiveStandoff(world, profile);
  if (Math.abs(distance - standoff) <= standoff * STANDOFF_BAND) {
    return { vector: onAxis ? ZERO_VECTOR : bearingVector(bearing), mgFiring };
  }
  return { vector: orbitVector(world, target, profile, memory, distance), mgFiring };
}
