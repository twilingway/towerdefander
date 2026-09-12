import { type ArenaZone } from "./arenaZones.ts";
import { type SimulationClock } from "./primitives.ts";
import { type ShipStats } from "./shipStats.ts";
import {
  type FriendlyWeaponKind,
  type ProjectileState,
  type ShieldPhase,
  type SpaceshipKinematics,
  type SpaceshipSimulationConfig,
  type Vector2
} from "./spaceshipSimulation.ts";

/** Who works the levers of one hull: a connected client, or the server itself. */
export type ArenaShipControl = "human" | "bot";

export type ArenaMatchPhase = "combat" | "result";

/**
 * How a match ended. `lastStanding` is the ordinary win; `timeLimit` hands it
 * to the healthiest hull left; `draw` is that comparison coming out even.
 */
export type ArenaMatchOutcome = "lastStanding" | "timeLimit" | "draw";

/**
 * One hull in the arena, with every system a crew ship carries.
 *
 * This is the whole reason the arena is a second simulation: the co-op state
 * keeps exactly these fields flat at its root, one set of them, and an enemy
 * carries neither a shield nor a turret of its own.
 */
export interface ArenaShipState {
  readonly id: string;
  /** Position in the spawn ring, stable for the whole match. */
  readonly slot: number;
  readonly control: ArenaShipControl;
  /** Which set of autopilot numbers drives this hull; null for a human. */
  readonly botLevel: string | null;
  /** The bot's own seeded stream, advanced only on a tick it decides. */
  readonly botRngState: number;

  readonly spaceship: SpaceshipKinematics;
  readonly heading: number;
  readonly headingTargetAngle: number | null;
  readonly headingAngularVelocity: number;

  readonly turretAngle: number;
  readonly turretTargetAngle: number | null;
  readonly turretAngularVelocity: number;
  readonly cannonHeat: number;
  readonly cannonOverheated: boolean;
  readonly lastFiredTick: number | null;
  readonly mgHeat: number;
  readonly mgOverheated: boolean;
  readonly lastMgFiredTick: number | null;
  /**
   * Shots this hull has fired, ever.
   *
   * A counter rather than a flag, because the display samples it: a muzzle
   * flash has to be played for every shot that happened between two patches,
   * and a boolean would lose the second of a pair fired in the same frame.
   */
  readonly shotsFired: number;

  readonly shieldAngle: number;
  readonly shieldTargetAngle: number | null;
  readonly shieldAngularVelocity: number;
  readonly shieldActive: boolean;
  readonly shieldEnergy: number;
  readonly shieldRearmRequired: boolean;
  readonly shieldPhase: ShieldPhase;
  readonly shieldPhaseTicks: number;

  readonly hp: number;
  readonly maxHp: number;
  /** The hull's numbers for this match, fixed at spawn: no modules in a match. */
  readonly stats: ShipStats;
  readonly cannonKind: FriendlyWeaponKind;
  readonly mgKind: FriendlyWeaponKind;

  readonly alive: boolean;
  readonly eliminatedAtTick: number | null;
  /** Who landed the killing blow, or null when the ring did it. */
  readonly eliminatedBy: string | null;
}

/** A shot knows whose it is, because in the arena every hull is a target. */
export interface ArenaProjectileState extends ProjectileState {
  readonly ownerShipId: string;
}

/** A beam lives for a couple of ticks so the display has something to draw. */
export interface ArenaBeamState {
  readonly id: string;
  readonly ownerShipId: string;
  readonly previousX: number;
  readonly previousY: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly spawnedTick: number;
}

/**
 * What the closed part of the field takes a second, as a share of the hull's
 * own maximum.
 *
 * A share rather than a number of points, so a closed zone means the same
 * thing to every hull however much health it carries.
 */

/** What one hull asks for this tick, already validated by whoever owns it. */
export interface ArenaShipIntent {
  readonly driveVector: Vector2;
  readonly turn: number | null;
  readonly thrust: number | null;
  readonly headingTargetAngle: number | null;
  readonly turretTargetAngle: number | null;
  readonly turretTurn: number | null;
  readonly firing: boolean;
  readonly mgFiring: boolean;
  readonly shieldTargetAngle: number | null;
  readonly shieldActive: boolean;
}

export interface ArenaMatchCaps {
  readonly ships: number;
  readonly projectiles: number;
  readonly homingMissiles: number;
  readonly dynamicEntities: number;
}

/**
 * The numbers a match runs on: the ship physics of the co-op config, plus what
 * only the arena has. The physics is shared deliberately - a hull that flies
 * differently in the two modes would make every measurement of one useless for
 * the other.
 */
/**
 * How long a hull lives in the arena, relative to the campaign it is balanced
 * in. Sixteen ships firing at each other is a density the campaign never has:
 * at campaign numbers a match resolved in twenty seconds, before the ring had
 * moved once. These two scale the hull and the shot instead of forking the
 * catalogue, so a change to the ship still reaches both modes.
 */
export interface ArenaShipScaling {
  readonly hull: number;
  readonly damage: number;
}

export interface ArenaMatchConfig {
  readonly ship: SpaceshipSimulationConfig;
  readonly shipScaling: ArenaShipScaling;
  readonly arenaRadius: number;
  readonly spawnRadius: number;
  /**
   * Where hulls start, in arena coordinates. Null means the even spiral this
   * module computes; a preset that has been edited hands its own marks here,
   * which is what makes the layout the operator's rather than the code's.
   */
  readonly spawnMarks: readonly { readonly x: number; readonly y: number }[] | null;
  readonly shipCount: number;
  readonly matchTickLimit: number;
  /** The sheet the field is cut into; see `arenaZones.ts`. */
  readonly zoneColumns: number;
  readonly zoneRows: number;
  /** How often the next zone is picked, and how long its warning lasts. */
  readonly zoneIntervalTicks: number;
  /** Rectangles taken on each beat; the sheet moves as a band, not a tile. */
  readonly zonesPerClosure: number;
  readonly zoneWarningTicks: number;
  /**
   * The zone bites on a beat rather than continuously: every
   * `zoneDamageIntervalTicks` it takes `zoneDamageShareOfMaxHp` of the hull's
   * maximum. Six beats kill a full hull, which is what makes the escape a
   * decision - you can cross a closed zone, you cannot live in one - and what
   * makes a repair inside it worth something.
   */
  readonly zoneDamageIntervalTicks: number;
  /**
   * What one beat takes, as a share of the hull's own maximum.
   *
   * A sixth: six beats kill a hull that entered whole, and the share is of the
   * maximum rather than of what is left, so a hull that repairs between beats
   * genuinely outlasts the zone. That is the difference between a countdown a
   * player can fight and one they cannot.
   */
  readonly zoneDamageShareOfMaxHp: number;
  readonly caps: ArenaMatchCaps;
}

export interface ArenaMatchState {
  readonly clock: SimulationClock;
  readonly matchSeed: number;
  readonly phase: ArenaMatchPhase;
  readonly outcome: ArenaMatchOutcome | null;
  readonly winnerShipId: string | null;

  /** The sheet of zones and their states, in the order they were built. */
  readonly zones: readonly ArenaZone[];
  readonly ticksUntilNextClosure: number;
  /** Ticks until the closed zones take their next bite. */
  readonly ticksUntilZoneDamage: number;

  readonly ships: readonly ArenaShipState[];
  readonly projectiles: readonly ArenaProjectileState[];
  readonly beams: readonly ArenaBeamState[];
  readonly nextProjectileSequence: number;
}
