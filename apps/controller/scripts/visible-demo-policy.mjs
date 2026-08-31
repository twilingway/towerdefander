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

/**
 * Stand-in muzzle velocity for a barrel that hits the instant it fires. The
 * lead solution is written in terms of a projectile speed, and this is what
 * "do not lead at all" looks like in those terms: fast enough that the lead
 * collapses onto the bearing, finite enough to stay arithmetic.
 */
export const HITSCAN_SPEED = 1_000_000;

/**
 * What speed the lead solution should use for a barrel of this kind. A laser
 * led like a bullet aims where the target will be and misses everything that
 * moves — measured on the stand as the difference between a median wave of 5
 * and one of 8.
 */
export function leadSpeedFor(kind, projectileSpeed) {
  return kind === "laser" ? HITSCAN_SPEED : projectileSpeed;
}

/**
 * How far off the bearing a barrel may fire and still expect to connect.
 *
 * A bullet has travel time and a body of its own, so the profile's cone is a
 * reasonable gamble. A beam either crosses the target this instant or does not,
 * so its cone is the angle the target actually subtends - anything wider is a
 * shot spent on empty space, and on screen it reads as a barrel that cannot
 * shoot straight.
 */
function firingCone(speed, target, world, profileCone, traverseReach) {
  if (speed < HITSCAN_SPEED) return Math.max(profileCone, traverseReach);
  const distance = Math.max(1, distanceBetween(world.ship, target));
  return Math.max(Math.atan2(target.radius, distance), HITSCAN_AIM_FLOOR);
}

/**
 * The tightest cone a hitscan barrel will wait for. Small enough to matter at
 * the ranges a beam reaches, wide enough that a settling turret still crosses
 * it instead of hunting forever.
 */
const HITSCAN_AIM_FLOOR = 0.02;

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
/**
 * How far a band has to be left before the manoeuvre it gates is abandoned.
 * A predicate that flips on its own threshold makes the pilot alternate
 * between two near-opposite courses every other tick: measured over three
 * runs of the veteran bot, the orbit/close pair alone reversed the requested
 * course by more than 1.5 rad 192 times, and the stand-off pair 66 more.
 */
const BAND_RELEASE = 0.7;
/**
 * Bearing error the hull may carry before the helm asks for a full-rate spin.
 * A tick of hull rotation is about 0.157 rad at the stock rate, so a narrower
 * band would demand full deflection and overshoot inside a single step.
 */
const HELM_SETTLE_RADIANS = 0.25;
/**
 * How far astern a course has to sit before the helm commits to backing up.
 * Well past the beam, because reverse is the slower gear: swinging the hull
 * round costs about a second and then pays full speed, while backing up pays a
 * fraction of it for as long as it lasts. At the beam the bot spent 36% of the
 * fight in reverse, which is neither intended nor good to watch.
 */
const HELM_REVERSE_RADIANS = (3 * Math.PI) / 4;
/**
 * How far the decision has to swing back before it is given up. Without the gap
 * the reverse decision chatters on its own threshold and flips the thrust end
 * for end every other tick, a harder jerk than the one this helm removed:
 * measured, it tripled the course changes past 0.3 rad.
 */
const HELM_REVERSE_MARGIN = 0.35;
/** Fraction of the arena radius past which the orbit turns back inward. */
const RIM_FRACTION = 0.8;
/**
 * How long the bot keeps going after a shooter it never saw. Several archetypes
 * out-range the camera frame, and a shot crosses that frame in under a second,
 * so without a memory the only evidence of the sniper is gone before the pilot
 * can act on it — which is how the bot ended up sweeping the middle of the
 * arena farming rocks while it was being shot at.
 */
const FIRE_MEMORY_MS = 8_000;
/** Close enough to the guessed source to call the guess spent. */
const FIRE_SOURCE_ARRIVAL = 200;
/**
 * How far off course the pilot will go for salvage while a fight is still on.
 * About two seconds of cruise: far enough to take what fell in the fight the
 * crew is already in, short enough not to leave it.
 */
const SALVAGE_DETOUR_UNITS = 700;
/**
 * Share of a drop's value that must actually land for the detour to be worth
 * it. A repair is not worth a course change for the last few points of hull.
 */
const SALVAGE_WORTH_SHARE = 0.5;
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
/**
 * What the shield arc is for. Aimed fire outranks a rock: a rock flies a
 * straight line, can be shot, and can be stepped off; a shot is pointed at you
 * and arrives whatever you do. The economics agree on the archetype that made
 * this obvious — a sniper round costs ten energy and saves thirty-five hull,
 * a rock costs twenty and saves forty.
 */
const THREAT_WEIGHTS = { missile: 3, bullet: 2, asteroid: 1 };
/** Threat weight from `nextShieldContact` worth spending the last energy on. */
const COSTLY_THREAT_WEIGHT = THREAT_WEIGHTS.bullet;
/**
 * Inside this much time to contact the arc covers what hurts most rather than
 * what merely arrives first. Beyond it nothing is being blocked yet, so the
 * arc simply tracks the nearest contact.
 */
const SHIELD_PRIORITY_SECONDS = 1;
/**
 * How far ahead a homing missile is flown to find where it will arrive, and at
 * what step. A straight line is the wrong question to ask of a missile that
 * turns: this preset's boss fires its burst wide of the ship, so at launch the
 * line says the missile never arrives at all, and the arc learns about it only
 * once it has curved back in — by which time it is seconds too late. Six
 * seconds is a fifth of a stock missile's life; a tenth-of-a-second step is
 * twice the simulation's own and costs sixty cheap iterations per missile.
 */
const MISSILE_FORECAST_SECONDS = 6;
const MISSILE_FORECAST_STEP = 0.1;
/**
 * How stale a guessed firing position may be before the arc stops facing it.
 * Shorter than the pilot's memory of the same guess, because the arc has to
 * commit its facing to one bearing and a stale one is worse than none.
 */
const SHIELD_SOURCE_MEMORY_MS = 3_000;
/**
 * How soon a missile has to land before it is worth the cannon while its
 * launcher is on the field. A boss puts missiles up faster than the mount can
 * clear them — this catalogue fires two every two seconds — so a gunner that
 * services every one of them never touches the launcher: measured over forty
 * runs opening on the boss wave, the boss topped the ranking on 9.8% of ticks
 * and the fight ended with it at 61% health. Beyond the window an escorted
 * missile is the hull's problem, which is the better place for it: the ship is
 * a third faster than the missile and the missile expires.
 */
const ESCORTED_MISSILE_SECONDS = 2;

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
    // Which manoeuvre is being held, and for which target it was chosen.
    closing: false,
    closingTargetId: undefined,
    reversing: false,
    // Where the last shot the bot could see appears to have come from.
    firedFrom: undefined,
    firedFromAtMs: 0,
    holding: false,
    holdingTargetId: undefined,
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
 * Where a homing missile will cross the shield ring, found by flying it rather
 * than by intersecting its current course. The ship is held still for the
 * forecast: it is the missile that does the chasing, and a guess that also
 * predicted the helm would need the pilot's plan, which is decided after this.
 */
function forecastMissileContact(ship, reach, missile) {
  const range = reach + missile.radius;
  let flown = missile;
  for (let step = 0; step * MISSILE_FORECAST_STEP <= MISSILE_FORECAST_SECONDS; step += 1) {
    if (Math.hypot(flown.x - ship.x, flown.y - ship.y) <= range) {
      return { seconds: step * MISSILE_FORECAST_STEP, arrival: flown };
    }
    flown = advanceEntity(steerMissile(flown, ship, MISSILE_FORECAST_STEP), MISSILE_FORECAST_STEP);
  }
  return undefined;
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
  const escortedByBoss = world.enemies.some(
    (enemy) => enemy.kind === "boss" || archetypes[enemy.kind]?.spawnPolicy === "boss"
  );

  for (const missile of world.missiles) {
    const seconds = timeToContact(world.ship, world.shieldRadius, missile);
    const urgent =
      seconds !== undefined && (!escortedByBoss || seconds <= ESCORTED_MISSILE_SECONDS);
    scored.push({
      entity: missile,
      role: "missile",
      score: urgent ? 100 - seconds * 10 : 40
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
  const contacts = [];
  const bearingOf = (arrival) => Math.atan2(arrival.y - world.ship.y, arrival.x - world.ship.x);

  // Missiles are flown rather than extended, because they steer; the rest hold
  // a course, so intersecting it is exact and costs nothing.
  for (const entity of world.missiles) {
    const forecast = forecastMissileContact(world.ship, world.shieldRadius, entity);
    if (forecast === undefined) continue;
    contacts.push({
      entity,
      weight: THREAT_WEIGHTS.missile,
      seconds: forecast.seconds,
      bearing: bearingOf(forecast.arrival)
    });
  }

  const straight = [
    ...world.bullets.map((entity) => ({ entity, weight: THREAT_WEIGHTS.bullet })),
    ...world.asteroids.map((entity) => ({ entity, weight: THREAT_WEIGHTS.asteroid }))
  ];

  for (const { entity, weight } of straight) {
    const seconds = timeToContact(world.ship, world.shieldRadius, entity);
    if (seconds === undefined) continue;
    contacts.push({
      entity,
      weight,
      seconds,
      bearing: bearingOf(advanceEntity(entity, seconds))
    });
  }
  if (contacts.length === 0) return undefined;

  const imminent = contacts.filter(({ seconds }) => seconds <= SHIELD_PRIORITY_SECONDS);
  if (imminent.length === 0) return contacts.reduce(sooner);
  // Ordered by what it costs to let through, then by how little time is left,
  // then by spawn order so two identical threats resolve the same way twice.
  return imminent.reduce((best, contact) =>
    contact.weight > best.weight ||
    (contact.weight === best.weight && contact.seconds < best.seconds) ||
    (contact.weight === best.weight &&
      contact.seconds === best.seconds &&
      compareEntities(contact.entity, best.entity) < 0)
      ? contact
      : best
  );
}

function sooner(best, contact) {
  return contact.seconds < best.seconds ||
    (contact.seconds === best.seconds && compareEntities(contact.entity, best.entity) < 0)
    ? contact
    : best;
}

function shieldAlreadyCovers(world, bearing) {
  if (!world.shield.active || world.shield.energy <= 0) return false;
  return Math.abs(shortestAngleDelta(world.shield.angle, bearing)) <= world.shield.arcHalfAngle;
}

/**
 * Where fire is expected from while none of it exists yet. The arc crosses the
 * hull at about 1.7 rad/s, so a half turn costs the better part of two seconds
 * — longer than a bullet takes to cross the whole camera frame. Pointed only at
 * what is already flying, the arc arrives after the hit; pointed at whoever is
 * about to fire, it is already there when the round appears. The nearest enemy
 * is the guess, and with the frame empty it is the position the pilot walked
 * the last shots back to, which is where an out-ranging sniper sits.
 */
function expectedThreatBearing(world, memory) {
  let nearest;
  for (const enemy of world.enemies) {
    const distance = distanceBetween(world.ship, enemy);
    if (nearest === undefined || distance < nearest.distance) nearest = { enemy, distance };
  }
  if (nearest !== undefined) {
    return Math.atan2(nearest.enemy.y - world.ship.y, nearest.enemy.x - world.ship.x);
  }

  const source = memory.firedFrom;
  if (source === undefined || world.sampledAtMs - memory.firedFromAtMs > SHIELD_SOURCE_MEMORY_MS) {
    return undefined;
  }
  return Math.atan2(source.y - world.ship.y, source.x - world.ship.x);
}

export function planShield(world, profile, memory) {
  const contact = nextShieldContact(world);
  // Facing is decided ahead of the threat; raising is still the operator's
  // number from the console. The arc may sit on an enemy for a whole magazine
  // without the shield ever coming up, and that is the intended shape: turning
  // costs nothing, holding costs the battery.
  const expected = contact === undefined ? expectedThreatBearing(world, memory) : contact.bearing;
  const aim = bearingVector(expected ?? world.shield.angle);

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
  // The barrel runs hot now, so a shot spent off-bearing is a shot the next
  // target does not get. Holding fire above the ceiling is what buys the ace
  // its accuracy back.
  const cannon = world.cannon;
  const cool =
    cannon === undefined ||
    (!cannon.overheated && cannon.heat <= cannon.capacity * (profile.cannonHeatCeiling ?? 1));
  const cone = firingCone(speed, target, world, profile.cannonConeRadians, reach);
  const firing = cool && Math.abs(shortestAngleDelta(world.turretAngle, bearing)) <= cone;
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

  // A missile is flown, a bullet is extended: the straight line a missile is not
  // yet on blinks in and out of an intercept as it turns, and the break blinks
  // with it. Measured over forty runs opening on the boss wave, the pilot
  // alternated between breaking and holding station 7213 times, the requested
  // course swung 0.57 rad every tick, and the ship averaged 134 units per second
  // of a possible 320 — slower than the missiles chasing it.
  const threats = [];
  if (profile.evadeMissiles) {
    for (const missile of world.missiles) {
      const forecast = forecastMissileContact(world.ship, world.ship.radius, missile);
      if (forecast !== undefined) {
        threats.push({ threat: missile, seconds: forecast.seconds, kind: "missile" });
      }
    }
  }
  if (profile.dodgeBullets) {
    for (const bullet of world.bullets) {
      const seconds = timeToContact(world.ship, world.ship.radius, bullet);
      if (seconds !== undefined) threats.push({ threat: bullet, seconds, kind: "bullet" });
    }
    for (const rock of world.asteroids) {
      const seconds = timeToContact(world.ship, world.ship.radius, rock);
      if (seconds !== undefined) threats.push({ threat: rock, seconds, kind: "asteroid" });
    }
  }

  let soonest;
  for (const candidate of threats) {
    if (candidate.seconds > horizonSeconds) continue;
    if (soonest === undefined || candidate.seconds < soonest.seconds) soonest = candidate;
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
  const vector =
    left.x * inward.x + left.y * inward.y >= right.x * inward.x + right.y * inward.y ? left : right;
  return { vector, kind: soonest.kind };
}

/**
 * The same point, pulled back onto the arena if it fell outside. The simulation
 * holds every ship inside that circle, so a guess beyond it is one no shooter
 * can occupy — and walking to it means walking into the wall and sitting there
 * until the guess times out.
 */
function insideArena(world, point) {
  const centreX = world.worldWidth / 2;
  const centreY = world.worldHeight / 2;
  const offsetX = point.x - centreX;
  const offsetY = point.y - centreY;
  const distance = Math.hypot(offsetX, offsetY);
  if (distance <= world.arenaRadius) return point;
  const scale = world.arenaRadius / distance;
  return { x: centreX + offsetX * scale, y: centreY + offsetY * scale };
}

/**
 * Bearing back along the course of the nearest shot crossing the screen. A
 * sniper reaches almost three times further than the camera frames and a boss
 * launches from beyond it too, so their shots are the only evidence of them
 * the bot ever gets. Walking one back points at whatever fired it.
 */
export function huntVector(world, memory, nowMs) {
  let nearest;
  for (const shot of [...world.bullets, ...world.missiles]) {
    if (Math.hypot(shot.velocityX, shot.velocityY) <= Number.EPSILON) continue;
    const distance = distanceBetween(world.ship, shot);
    if (nearest !== undefined && distance >= nearest.distance) continue;
    nearest = { distance, bearing: Math.atan2(-shot.velocityY, -shot.velocityX) };
  }

  if (nearest !== undefined) {
    // A point rather than a bearing, so the guess stays geometrically true as
    // the ship moves. One frame out is where an out-ranging archetype sits, and
    // never past the rim, where none can be. The course is read off the point
    // for the same reason, so a guess that was pulled in is also flown to where
    // it now is rather than along the bearing it came from.
    memory.firedFrom = insideArena(world, {
      x: world.ship.x + Math.cos(nearest.bearing) * world.cameraViewWidth,
      y: world.ship.y + Math.sin(nearest.bearing) * world.cameraViewWidth
    });
    memory.firedFromAtMs = nowMs;
    return normalize({
      x: memory.firedFrom.x - world.ship.x,
      y: memory.firedFrom.y - world.ship.y
    });
  }

  if (memory.firedFrom === undefined) return undefined;
  const toSource = {
    x: memory.firedFrom.x - world.ship.x,
    y: memory.firedFrom.y - world.ship.y
  };
  // Spent when it goes stale or when the bot gets there and finds nothing.
  if (
    nowMs - memory.firedFromAtMs > FIRE_MEMORY_MS ||
    Math.hypot(toSource.x, toSource.y) < FIRE_SOURCE_ARRIVAL
  ) {
    memory.firedFrom = undefined;
    return undefined;
  }
  return normalize(toSource);
}

/**
 * Nothing worth shooting is on screen. Standing still is the one thing the bot
 * must not do here: several archetypes out-range the camera frame, so parking
 * means being shot to pieces by something that never comes into view. Incoming
 * fire is visible even when its owner is not, so the bot walks the shots back
 * to their source; with the screen truly empty it heads for the middle of the
 * arena and sweeps there, which is where the frame covers the most ground.
 */
/**
 * The closest drop worth breaking off for, with a stable tie-break like every
 * other pick. A repair on a full hull returns nothing and a cell on a full
 * battery the same, so neither is worth a course change; inside the collection
 * window the wave is already won and everything on the field is taken.
 */
function chooseSalvage(world) {
  const windowOpen = (world.salvageWindowSeconds ?? 0) > 0;
  let nearest;
  for (const drop of world.loot ?? []) {
    const distance = distanceBetween(world.ship, drop);
    if (!windowOpen && (distance > SALVAGE_DETOUR_UNITS || !worthTaking(world, drop))) continue;
    const closer =
      nearest === undefined ||
      distance < nearest.distance ||
      (distance === nearest.distance && compareEntities(drop, nearest.drop) < 0);
    if (closer) nearest = { distance, drop };
  }
  return nearest?.drop;
}

/** Whether the drop would return most of what it carries. */
function worthTaking(world, drop) {
  const missing =
    drop.kind === "repair"
      ? world.ship.maxHp - world.ship.hp
      : world.shield.capacity - world.shield.energy;
  return missing >= drop.amount * SALVAGE_WORTH_SHARE;
}

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
function traverseLosing(world, target, options, memory) {
  const rate = options.turretRate ?? TURRET_RATE_PER_SECOND;
  const sweep = Math.abs(bearingRate(world, target));
  const enter = rate * TRAVERSE_MARGIN;
  // Held per target: the geometry that made the call belongs to that target,
  // so a new one is judged from scratch rather than inheriting the verdict.
  const held = memory.closingTargetId === target.entityId && memory.closing === true;
  const closing = sweep > enter * (held ? BAND_RELEASE : 1);
  memory.closingTargetId = target.entityId;
  memory.closing = closing;
  return closing;
}

/**
 * On station means inside the stand-off band, and once on station it takes a
 * wider excursion to be off it again. Same reason as `traverseLosing`: without
 * the widening, holding and orbiting trade places on the band edge and the
 * requested course swings across the target every other tick.
 */
function onStation(distance, standoff, target, memory) {
  const band = standoff * STANDOFF_BAND;
  const held = memory.holdingTargetId === target.entityId && memory.holding === true;
  const holding = Math.abs(distance - standoff) <= (held ? band / BAND_RELEASE : band);
  memory.holdingTargetId = target.entityId;
  memory.holding = holding;
  return holding;
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
/**
 * Turns a desired course into the spin and push a live pilot's keyboard sends.
 * The core takes a different branch for each: given an intent the hull spins at
 * the requested rate and thrust runs along the nose, and without one it chases
 * an absolute bearing and drifts sideways to the hull. Flying the bot on a
 * bearing therefore put it on a control model no player has — the hull settled
 * onto a course and swung back through it, which is the doubling-back the
 * demonstration showed and the live game does not.
 */
export function helmIntent(vector, heading, memory, mayReverse = true) {
  if (Math.hypot(vector.x, vector.y) <= Number.EPSILON) return { turn: 0, thrust: 0 };
  const bearing = Math.atan2(vector.y, vector.x);
  const ahead = shortestAngleDelta(heading, bearing);
  // Past the beam it is quicker to back up than to swing the hull all the way
  // round, and it leaves the nose gun pointed at what was being circled. Held
  // once taken, for the same reason the manoeuvre bands are held.
  //
  // What it is never worth is a crossing. Reverse is two fifths of the speed,
  // so it pays back the second the hull spends turning only over a couple of
  // hundred units; a run to the far side of the arena flown backwards costs
  // more than the turn several times over. With nothing on the screen there is
  // also no nose to keep pointed at anything, which was the whole reason to
  // back up. Measured over forty runs, the bot flew 26.5% of the fight in
  // reverse and 58.1% of that was one manoeuvre: the crossing to the middle of
  // the arena, begun at the rim with the nose pointing off it.
  const reversing =
    mayReverse &&
    (memory.reversing === true
      ? Math.abs(ahead) > HELM_REVERSE_RADIANS - HELM_REVERSE_MARGIN
      : Math.abs(ahead) > HELM_REVERSE_RADIANS);
  memory.reversing = reversing;
  const error = reversing ? shortestAngleDelta(heading, bearing + Math.PI) : ahead;
  return {
    turn: Math.max(-1, Math.min(1, error / HELM_SETTLE_RADIANS)),
    // Proportional to how well the nose is lined up, so a broadside course
    // spends the tick turning rather than flying off at an angle to its own aim.
    thrust: (reversing ? -1 : 1) * Math.max(0, Math.cos(error))
  };
}

export function planPilot(world, profile, memory, options = {}) {
  const plan = planPilotCourse(world, profile, memory, options);
  return {
    ...plan,
    ...helmIntent(plan.vector, world.ship.heading, memory, plan.crossing !== true)
  };
}

function planPilotCourse(world, profile, memory, options) {
  const nowMs = options.nowMs ?? world.sampledAtMs;
  const ranked = rankTargets(world, options);
  // The turret keeps the crew's commitment, which may well be a missile — it
  // traverses on its own and owes the hull nothing. The pilot presses ships,
  // because on this hull the nose is the engine as well as a gun: aiming it at
  // a missile is flying at a missile, and while it did that the boss went
  // untouched from full health to half and no further.
  const committed = commitTarget(ranked, profile, memory, nowMs, world);
  const committedRole = ranked.find(({ entity }) => entity.entityId === committed?.entityId)?.role;
  const target =
    committedRole === "enemy" ? committed : ranked.find(({ role }) => role === "enemy")?.entity;
  const escape = escapeVector(world, profile);

  const speed = options.mgSpeed ?? MG_PROJECTILE_SPEED;
  // The nose gun fires along the hull, which swings at twice the turret rate,
  // so the same allowance for getting there applies with a doubled rate.
  const noseRate = (options.turretRate ?? TURRET_RATE_PER_SECOND) * 2;
  const solve = (entity) =>
    entity === undefined
      ? undefined
      : leadWithTraverse(world, entity, speed, profile, memory, world.ship.heading, noseRate);
  // Where the hull is being flown. The ladder below steers by this.
  const bearing = solve(target);
  // What the gun would hit right now, which is not always what is being flown
  // at: a missile crossing the bore is free damage and costs the course nothing.
  const noseBearing = committed === target ? bearing : solve(committed);
  const noseCone = (entity) =>
    entity === undefined
      ? profile.mgConeRadians
      : firingCone(speed, entity, world, profile.mgConeRadians, profile.mgConeRadians);
  const withinCone = (angle, entity) =>
    angle !== undefined &&
    Math.abs(shortestAngleDelta(world.ship.heading, angle)) <= noseCone(entity);
  const onAxis = withinCone(bearing, target);
  const mgFiring =
    withinCone(noseBearing, committed === target ? target : committed) &&
    !world.machineGun.overheated &&
    world.machineGun.heat <= world.machineGun.capacity * profile.mgHeatCeiling;

  // Salvage is the only hull a crew wins back inside a run, so it outranks the
  // hunt whenever it actually returns something. Mid-fight the detour is capped
  // and the drop has to be worth taking; once the wave is won the window is all
  // the time there is, so everything on the field counts.
  const drop = chooseSalvage(world);

  // The break outranks every manoeuvre, but the gun does not stop: firing is a
  // question of where the nose already points, and a long evasion swings it
  // across targets that are worth the burst.
  //
  // A rock is the exception. It is slow, it can be shot, the shield covers it,
  // and it will still be dodgeable in a second - while the repair on the field
  // is on a fifteen-second clock. Breaking from rocks is what made the bot look
  // like it was chasing them instead of collecting: on a field of ambient
  // asteroids the break fires over and over and the drop is never reached.
  if (escape !== undefined && !(escape.kind === "asteroid" && drop !== undefined)) {
    return { vector: escape.vector, mgFiring };
  }

  if (drop !== undefined) {
    return {
      vector: normalize({ x: drop.x - world.ship.x, y: drop.y - world.ship.y }),
      mgFiring,
      crossing: true
    };
  }

  // Without the orbit skill the pilot keeps the old circular patrol.
  if (!profile.orbit) return { vector: pilotVector(nowMs), mgFiring };

  // A rock on screen is work for the guns, never a reason to stop hunting: the
  // ships that actually kill the crew shoot from outside the camera frame, and
  // the turret keeps servicing the rock while the pilot goes after them.
  // Nothing to press: walk the shots back to whoever is firing them.
  // Nothing to press and nothing to keep in the bore: whatever this course is,
  // it is a crossing rather than a manoeuvre, so the hull turns onto it.
  if (target === undefined) {
    return {
      vector: huntVector(world, memory, nowMs) ?? searchVector(world, memory),
      mgFiring,
      crossing: true
    };
  }

  // Holding a ring around a target the turret cannot track is the stalemate:
  // close on the intercept point instead and let the nose gun finish it.
  if (traverseLosing(world, target, options, memory)) {
    return { vector: bearingVector(bearing), mgFiring };
  }

  const distance = distanceBetween(world.ship, target);
  const standoff = effectiveStandoff(world, profile);
  if (onStation(distance, standoff, target, memory)) {
    return { vector: onAxis ? ZERO_VECTOR : bearingVector(bearing), mgFiring };
  }
  return { vector: orbitVector(world, target, profile, memory, distance), mgFiring };
}
