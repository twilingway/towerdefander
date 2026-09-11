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
 * One step of the ring. The safe radius runs from the previous phase's radius
 * to this one across `durationTicks`, so the boundary moves rather than jumps.
 */
export interface ArenaRingPhase {
  readonly radius: number;
  readonly durationTicks: number;
  /** Hull damage a second outside the boundary, at the depth the ship is at. */
  readonly damagePerSecond: number;
}

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
export interface ArenaMatchConfig {
  readonly ship: SpaceshipSimulationConfig;
  readonly arenaRadius: number;
  readonly spawnRadius: number;
  readonly shipCount: number;
  readonly matchTickLimit: number;
  readonly ringPhases: readonly ArenaRingPhase[];
  readonly caps: ArenaMatchCaps;
}

export interface ArenaMatchState {
  readonly clock: SimulationClock;
  readonly matchSeed: number;
  readonly phase: ArenaMatchPhase;
  readonly outcome: ArenaMatchOutcome | null;
  readonly winnerShipId: string | null;

  readonly ringPhaseIndex: number;
  readonly ringRadius: number;
  readonly nextRingRadius: number;
  readonly ringPhaseTicksRemaining: number;

  readonly ships: readonly ArenaShipState[];
  readonly projectiles: readonly ArenaProjectileState[];
  readonly beams: readonly ArenaBeamState[];
  readonly nextProjectileSequence: number;
}
