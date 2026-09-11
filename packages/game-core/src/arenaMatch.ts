import { constrainMovingCircleToArena } from "./arenaGeometry.ts";
import {
  expireArenaBeams,
  fireArenaWeapons,
  moveArenaProjectiles,
  resolveArenaHits
} from "./arenaMatchCombat.ts";
import {
  type ArenaMatchConfig,
  type ArenaMatchState,
  type ArenaShipIntent,
  type ArenaShipState
} from "./arenaMatchTypes.ts";
import { type ArenaZone } from "./arenaZones.ts";
import {
  advanceArenaZones,
  createArenaZones,
  isInClosedZone,
  zoneDamageForBite
} from "./arenaZones.ts";
import { advanceClock, createSeededRandom } from "./primitives.ts";
import { advanceAngularTraverse, canonicalizeAngle, clamp } from "./simulationMath.ts";
import { advanceShipPose, type ShipPose } from "./shipPose.ts";
import { shipStatsFromConfig, type ShipStats } from "./shipStats.ts";
import { type FriendlyWeaponKind, type ShieldPhase } from "./spaceshipSimulation.ts";

/** A hull that asked for nothing this tick: drifting, silent, shield where it was. */
export const IDLE_ARENA_INTENT: ArenaShipIntent = {
  driveVector: { x: 0, y: 0 },
  turn: null,
  thrust: null,
  headingTargetAngle: null,
  turretTargetAngle: null,
  turretTurn: null,
  firing: false,
  mgFiring: false,
  shieldTargetAngle: null,
  shieldActive: false
};

export interface ArenaShipSeat {
  readonly control: ArenaShipState["control"];
  readonly botLevel: string | null;
  /** Overrides for this hull, if it is not flying the config's own numbers. */
  readonly stats?: ShipStats;
  readonly cannonKind?: FriendlyWeaponKind;
  readonly mgKind?: FriendlyWeaponKind;
}

/**
 * Sixteen hulls on a circle, noses inward.
 *
 * The slot decides the seat and the seat never moves, so a match replayed from
 * the same seed starts identically - which is what makes a bot-only run usable
 * as a measurement rather than as an anecdote.
 */
export function createArenaMatch(
  config: ArenaMatchConfig,
  matchSeed: number,
  seats: readonly ArenaShipSeat[]
): ArenaMatchState {
  const campaignStats = shipStatsFromConfig(config.ship);
  const baseStats: ShipStats = {
    ...campaignStats,
    spaceshipMaxHp: campaignStats.spaceshipMaxHp * config.shipScaling.hull,
    friendlyProjectileDamage: campaignStats.friendlyProjectileDamage * config.shipScaling.damage,
    mgDamage: campaignStats.mgDamage * config.shipScaling.damage
  };
  /*
   * Sixteen fixed marks, handed out at random.
   *
   * Vogel's spiral - the golden angle with a square-root radius - is the
   * cheapest way to cover a disc evenly: every mark ends up about as far from
   * its neighbours as every other, with no ring for a crowd to line up on and
   * no pile in the middle. The marks never move, so the field is the same shape
   * every match; what the seed decides is who stands where, which is the part
   * that has to be different.
   */
  const random = createSeededRandom(matchSeed);
  /*
   * World coordinates, not disc-centred ones.
   *
   * `advanceShipPose` holds a hull inside a circle centred on the middle of the
   * world - the same clamp the campaign flies under - so an arena written
   * around zero had every ship pinned to the wall on its first step, which is
   * exactly what the early matches looked like. The marks and the zones are
   * authored around zero because that is the frame an operator thinks in, and
   * the centre is added here, once.
   */
  const centre = arenaCentre(config);
  const marks = (config.spawnMarks ?? arenaSpawnMarks(config.shipCount, config.spawnRadius)).map(
    (mark) => ({ x: mark.x + centre.x, y: mark.y + centre.y })
  );
  const order = marks.map((_mark, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random.next() * (index + 1));
    const held = order[index];
    const other = order[swap];
    if (held === undefined || other === undefined) continue;
    order[index] = other;
    order[swap] = held;
  }

  const ships = seats.slice(0, config.shipCount).map((seat, slot) => {
    const mark = marks[order[slot] ?? slot] ?? { x: 0, y: 0 };
    const { x, y } = mark;
    // Facing nowhere in particular, which is what "the match just started"
    // looks like when nobody was lined up on a rim.
    const heading = canonicalizeAngle(random.next() * Math.PI * 2);
    const stats = seat.stats ?? baseStats;
    return {
      id: `ship-${String(slot + 1)}`,
      slot,
      control: seat.control,
      botLevel: seat.botLevel,
      botRngState: (matchSeed ^ Math.imul(slot + 1, 0x9e37_79b1)) >>> 0 || 0x6d2b_79f5,
      spaceship: { x, y, previousX: x, previousY: y, velocity: { x: 0, y: 0 } },
      heading,
      headingTargetAngle: null,
      headingAngularVelocity: 0,
      turretAngle: heading,
      turretTargetAngle: null,
      turretAngularVelocity: 0,
      cannonHeat: 0,
      cannonOverheated: false,
      lastFiredTick: null,
      mgHeat: 0,
      mgOverheated: false,
      lastMgFiredTick: null,
      shieldAngle: heading,
      shieldTargetAngle: null,
      shieldAngularVelocity: 0,
      shieldActive: false,
      shieldEnergy: stats.shieldCapacity,
      shieldRearmRequired: false,
      shieldPhase: "down" as ShieldPhase,
      shieldPhaseTicks: 0,
      hp: stats.spaceshipMaxHp,
      maxHp: stats.spaceshipMaxHp,
      stats,
      cannonKind: seat.cannonKind ?? config.ship.cannonWeaponKind,
      mgKind: seat.mgKind ?? config.ship.mgWeaponKind,
      alive: true,
      eliminatedAtTick: null,
      eliminatedBy: null
    } satisfies ArenaShipState;
  });

  return {
    clock: { tick: 0, elapsedMs: 0 },
    matchSeed,
    phase: "combat",
    outcome: null,
    winnerShipId: null,
    zones: createArenaZones(config),
    ticksUntilNextClosure: config.zoneIntervalTicks,
    ticksUntilZoneDamage: config.zoneDamageIntervalTicks,
    ships,
    projectiles: [],
    beams: [],
    nextProjectileSequence: 1
  };
}

/** The middle of the world, which is the middle of the arena disc. */
export function arenaCentre(config: ArenaMatchConfig): { readonly x: number; readonly y: number } {
  return { x: config.ship.worldWidth / 2, y: config.ship.worldHeight / 2 };
}

/**
 * The match's spawn marks: fixed, even, and the same every time.
 *
 * Exported because they are a property of the arena rather than of a match - a
 * display can draw them, a test can measure them, and a future mode can spawn
 * a wave on them.
 */
export function arenaSpawnMarks(
  count: number,
  radius: number
): readonly { readonly x: number; readonly y: number }[] {
  // The golden angle. Successive marks land as far from each other as the
  // circle allows, which is what makes the spacing come out even.
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_unused, index) => {
    const distance = radius * Math.sqrt((index + 0.5) / count);
    const angle = index * goldenAngle;
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  });
}

/** One fixed step of a match: pure, and the only place arena arithmetic lives. */
export function advanceArenaMatch(
  state: ArenaMatchState,
  intents: ReadonlyMap<string, ArenaShipIntent>,
  config: ArenaMatchConfig
): ArenaMatchState {
  if (state.phase === "result") return state;

  const clock = advanceClock(state.clock, config.ship.fixedStepMs);
  const tick = clock.tick;
  const sheet = advanceArenaZones(state.zones, state.ships, state.ticksUntilNextClosure, config);

  let projectileSequence = state.nextProjectileSequence;
  const ships: ArenaShipState[] = [];
  const spawned: ArenaMatchState["projectiles"][number][] = [];
  const beams = [...expireArenaBeams(state.beams, tick)];

  for (const ship of state.ships) {
    if (!ship.alive) {
      ships.push(ship);
      continue;
    }

    const intent = intents.get(ship.id) ?? IDLE_ARENA_INTENT;
    const moved = advanceShipSystems(ship, intent, config);
    const roomForProjectile =
      state.projectiles.length + spawned.length < config.caps.projectiles &&
      state.projectiles.length + spawned.length + state.ships.length < config.caps.dynamicEntities;

    const fired = fireArenaWeapons(
      moved,
      intent,
      tick,
      projectileSequence,
      roomForProjectile,
      config
    );
    projectileSequence = fired.nextProjectileSequence;
    spawned.push(...fired.projectiles);
    beams.push(...fired.beams);
    ships.push(fired.ship);
  }

  const flying = [
    ...moveArenaProjectiles(state.projectiles, tick, config, arenaCentre(config)),
    ...spawned
  ];
  const resolved = resolveArenaHits(ships, flying, config);
  const biting = state.ticksUntilZoneDamage <= 1;
  const burned = biting ? applyZoneDamage(resolved.ships, sheet.zones, config) : resolved.ships;
  const settled = settleEliminations(burned, tick);
  const verdict = matchVerdict(settled, tick, config);

  return {
    ...state,
    clock,
    phase: verdict.phase,
    outcome: verdict.outcome,
    winnerShipId: verdict.winnerShipId,
    zones: sheet.zones,
    ticksUntilNextClosure: sheet.ticksUntilNextClosure,
    ticksUntilZoneDamage: biting ? config.zoneDamageIntervalTicks : state.ticksUntilZoneDamage - 1,
    ships: settled,
    projectiles: resolved.projectiles,
    beams,
    nextProjectileSequence: projectileSequence
  };
}

function advanceShipSystems(
  ship: ArenaShipState,
  intent: ArenaShipIntent,
  config: ArenaMatchConfig
): ArenaShipState {
  const stats = ship.stats;
  const secondsPerStep = config.ship.fixedStepMs / 1000;

  const pose: ShipPose = {
    spaceship: ship.spaceship,
    heading: ship.heading,
    headingTargetAngle: intent.headingTargetAngle,
    headingAngularVelocity: ship.headingAngularVelocity,
    turretAngle: ship.turretAngle,
    turretTargetAngle: intent.turretTargetAngle,
    turretAngularVelocity: ship.turretAngularVelocity
  };
  const advanced = advanceShipPose(
    pose,
    {
      driveVector: intent.driveVector,
      turn: intent.turn,
      thrust: intent.thrust,
      headingTargetAngle: intent.headingTargetAngle,
      turretTargetAngle: intent.turretTargetAngle,
      turretTurn: intent.turretTurn
    },
    config.ship,
    stats
  );

  // The wall is hard, the ring is not: a hull is held inside the arena circle
  // and punished for leaving the safe radius, and those are two different edges.
  const constrained = constrainMovingCircleToArena(
    {
      x: advanced.spaceship.x,
      y: advanced.spaceship.y,
      velocity: advanced.spaceship.velocity,
      radius: stats.spaceshipRadius
    },
    { centerX: arenaCentre(config).x, centerY: arenaCentre(config).y, radius: config.arenaRadius }
  );

  const shield = advanceShield(ship, intent, secondsPerStep);
  const shieldTraverse = advanceAngularTraverse(
    {
      angle: ship.shieldAngle,
      targetAngle: intent.shieldTargetAngle,
      angularVelocity: ship.shieldAngularVelocity
    },
    {
      maxAngularSpeed: stats.shieldMaxAngularSpeedPerSecond,
      angularAcceleration: stats.shieldAngularAccelerationPerSecondSquared,
      angularBraking: stats.shieldAngularBrakingPerSecondSquared,
      secondsPerStep
    }
  );

  return {
    ...ship,
    spaceship: {
      x: constrained.x,
      y: constrained.y,
      previousX: ship.spaceship.x,
      previousY: ship.spaceship.y,
      velocity: constrained.velocity
    },
    heading: advanced.heading,
    headingTargetAngle: advanced.headingTargetAngle,
    headingAngularVelocity: advanced.headingAngularVelocity,
    turretAngle: advanced.turretAngle,
    turretTargetAngle: advanced.turretTargetAngle,
    turretAngularVelocity: advanced.turretAngularVelocity,
    shieldAngle: shieldTraverse.angle,
    shieldTargetAngle: shieldTraverse.targetAngle,
    shieldAngularVelocity: shieldTraverse.angularVelocity,
    ...shield
  };
}

/**
 * The shield's cycle, in the arena's own words.
 *
 * The co-op keeps this inline in its step and reaches into its own state for
 * it; the phases and their meaning are the same here - raise, hold, cool - so a
 * player who learned the shield in the campaign is not learning it again.
 */
function advanceShield(
  ship: ArenaShipState,
  intent: ArenaShipIntent,
  secondsPerStep: number
): Pick<
  ArenaShipState,
  "shieldActive" | "shieldEnergy" | "shieldPhase" | "shieldPhaseTicks" | "shieldRearmRequired"
> {
  const stats = ship.stats;
  const wanted = intent.shieldActive && !ship.shieldRearmRequired;
  let phase = ship.shieldPhase;
  let phaseTicks = ship.shieldPhaseTicks + 1;

  if (phase === "down" && wanted && ship.shieldEnergy > 0) {
    phase = "raising";
    phaseTicks = 0;
  } else if (phase === "raising" && phaseTicks >= stats.shieldEngageTicks) {
    phase = "up";
    phaseTicks = 0;
  } else if (phase === "up" && !wanted && phaseTicks >= stats.shieldMinimumUpTicks) {
    phase = "cooling";
    phaseTicks = 0;
  } else if (phase === "cooling" && phaseTicks >= stats.shieldCooldownTicks) {
    phase = "down";
    phaseTicks = 0;
  }

  const holding = phase === "up";
  const energy = clamp(
    holding
      ? ship.shieldEnergy - stats.shieldDrainPerSecond * secondsPerStep
      : ship.shieldEnergy + stats.shieldRechargePerSecond * secondsPerStep,
    0,
    stats.shieldCapacity
  );
  const depleted = holding && energy === 0;
  if (depleted) {
    phase = "cooling";
    phaseTicks = 0;
  }

  return {
    shieldActive: holding && !depleted,
    shieldEnergy: energy,
    shieldPhase: phase,
    shieldPhaseTicks: phaseTicks,
    shieldRearmRequired: depleted
      ? true
      : ship.shieldRearmRequired && energy < stats.shieldRearmEnergy
  };
}

/**
 * The closed part of the field, applied to whoever is standing in it.
 *
 * Straight to the hull, past the shield and its arc: a shield that stopped this
 * would let a hull tank sit in a dead zone and wait the match out, which is the
 * one thing the sheet exists to prevent.
 */
function applyZoneDamage(
  ships: readonly ArenaShipState[],
  zones: readonly ArenaZone[],
  config: ArenaMatchConfig
): readonly ArenaShipState[] {
  return ships.map((ship) => {
    if (!ship.alive) return ship;
    if (!isInClosedZone(ship, zones)) return ship;
    const remaining = ship.hp - zoneDamageForBite(ship, zones, config);
    // Six sixths are a whole hull in arithmetic and a hair over one in floating
    // point; the beat is meant to be countable, so the sixth one finishes it.
    const alive = remaining > 1e-6;
    return { ...ship, hp: alive ? remaining : 0, alive };
  });
}

function settleEliminations(
  ships: readonly ArenaShipState[],
  tick: number
): readonly ArenaShipState[] {
  return ships.map((ship) =>
    ship.alive || ship.eliminatedAtTick !== null ? ship : { ...ship, eliminatedAtTick: tick }
  );
}

function matchVerdict(
  ships: readonly ArenaShipState[],
  tick: number,
  config: ArenaMatchConfig
): Pick<ArenaMatchState, "phase" | "outcome" | "winnerShipId"> {
  const alive = ships.filter((ship) => ship.alive);
  const first = alive[0];
  if (first === undefined) {
    return { phase: "result", outcome: "draw", winnerShipId: null };
  }
  if (alive.length === 1) {
    return { phase: "result", outcome: "lastStanding", winnerShipId: first.id };
  }
  if (tick < config.matchTickLimit) {
    return { phase: "combat", outcome: null, winnerShipId: null };
  }

  const best = alive.reduce((leader, ship) => (ship.hp > leader.hp ? ship : leader), first);
  const tied = alive.filter((ship) => ship.hp === best.hp).length > 1;
  return tied
    ? { phase: "result", outcome: "draw", winnerShipId: null }
    : { phase: "result", outcome: "timeLimit", winnerShipId: best.id };
}
