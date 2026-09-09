/**
 * What the crew policy is, as a type.
 *
 * The policy itself is plain JavaScript next to this file, for the reason its
 * ESLint exemption states: the measurement harness loads it from plain node, so
 * it carries no relative runtime imports and no types. This declares its public
 * surface so the room can type-check against it - and so a rename or a changed
 * argument stops being something only a browser run would notice.
 *
 * Written by hand rather than inferred, which is a real cost: the shapes here
 * have to be kept true to the module beside them. The bound on that cost is
 * that the surface is the twenty-five exports below, and the world is built in
 * one place.
 */
import type {
  AutopilotLevel,
  AutopilotProfile,
  FriendlyWeaponKind
} from "@spaceship-defender/protocol";

/** A point, a velocity and a size: what the policy needs of anything in the arena. */
export interface PolicyEntity {
  readonly entityId: string;
  readonly spawnSequence: number;
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly radius: number;
}

export interface PolicyEnemy extends PolicyEntity {
  readonly kind: string;
  readonly heading: number;
  readonly hp: number;
  readonly maxHp: number;
}

export interface PolicyMissile extends PolicyEntity {
  readonly heading: number;
}

export interface PolicyAsteroid extends PolicyEntity {
  readonly hp: number;
  readonly maxHp: number;
}

export interface PolicyLoot extends PolicyEntity {
  readonly kind: string;
  readonly amount: number;
}

/**
 * The arena as one seat sees it.
 *
 * Deliberately the client's slice rather than the simulation: the entity lists
 * are filtered to what fits in the camera frame, because the policy is a model
 * of a player and a player cannot dodge what is off screen. Every measurement
 * of survivability was taken against a bot bounded this way.
 */
export interface PolicyWorld {
  readonly sampledAtMs: number;
  readonly tick: number;
  readonly phase: string;
  readonly waveNumber: number;
  readonly salvageWindowSeconds: number;
  readonly cameraViewWidth: number;
  readonly arenaRadius: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly shieldRadius: number;
  readonly turretAngle: number;
  readonly ship: {
    readonly x: number;
    readonly y: number;
    readonly heading: number;
    readonly velocityX: number;
    readonly velocityY: number;
    readonly radius: number;
    readonly hp: number;
    readonly maxHp: number;
  };
  readonly shield: {
    readonly angle: number;
    readonly active: boolean;
    readonly energy: number;
    readonly capacity: number;
    readonly arcHalfAngle: number;
  };
  readonly cannon: {
    readonly heat: number;
    readonly capacity: number;
    readonly overheated: boolean;
    readonly reach: number;
  };
  readonly machineGun: {
    readonly heat: number;
    readonly capacity: number;
    readonly overheated: boolean;
  };
  readonly enemies: readonly PolicyEnemy[];
  readonly missiles: readonly PolicyMissile[];
  readonly bullets: readonly PolicyEntity[];
  readonly asteroids: readonly PolicyAsteroid[];
  readonly loot: readonly PolicyLoot[];
}

/**
 * What the policy remembers between ticks, and the reason it is not a pure
 * function of the world: a committed target, the shield's last state, where the
 * last shot came from, and its own seeded random stream.
 */
export interface PolicyMemory {
  targetId: string | undefined;
  committedAtMs: number;
  rankedAtMs: number;
  shieldActive: boolean;
  firedFrom: { x: number; y: number } | undefined;
  firedFromAtMs: number;
  [key: string]: unknown;
}

/** What the harness hands in beside the world: the numbers a run is fixed at. */
export interface PolicyOptions {
  readonly archetypes?: Record<string, unknown>;
  readonly cannonSpeed?: number;
  readonly mgSpeed?: number;
  readonly turretRate?: number;
  readonly nowMs?: number;
}

export interface Vector {
  readonly x: number;
  readonly y: number;
}

export interface ShieldPlan {
  readonly aim: Vector;
  readonly active: boolean;
}

export interface GunnerPlan {
  readonly aim: Vector;
  readonly strength: number;
  readonly cannon: boolean;
  readonly machineGun: boolean;
}

export interface PilotPlan {
  readonly turn: number;
  readonly thrust: number;
}

export interface RankedTarget {
  readonly entity: PolicyEnemy | PolicyAsteroid | PolicyMissile;
  readonly weight: number;
}

export interface ShieldContact {
  readonly seconds: number;
  readonly bearing: number;
  readonly weight: number;
}

export const HITSCAN_SPEED: number;

export function interceptAim(
  spaceship: Vector,
  target: PolicyEntity | undefined,
  projectileSpeed?: number
): Vector;
export function directAim(spaceship: Vector, target: PolicyEntity | undefined): Vector;
export function nextShieldActive(current: boolean, energy: number): boolean;
export function runWaveKey(runNumber: number, waveNumber: number): string;
export function normalize(vector: Vector): Vector;
export function resolveAutopilotProfile(
  autopilot: unknown,
  level: AutopilotLevel,
  turretKind: FriendlyWeaponKind
): AutopilotProfile;
export function leadSpeedFor(kind: FriendlyWeaponKind, projectileSpeed: number): number;
export function createAutopilotMemory(seed?: number): PolicyMemory;
export function canonicalizeAngle(angle: number): number;
export function shortestAngleDelta(current: number, target: number): number;
export function timeToContact(
  ship: PolicyWorld["ship"] | Vector,
  reach: number,
  entity: PolicyEntity
): number | undefined;
export function measureAngularRates(
  previous: PolicyWorld | undefined,
  next: PolicyWorld
): { readonly heading: number; readonly turret: number };
export function extrapolateWorld(
  world: PolicyWorld,
  nowMs: number,
  options?: PolicyOptions
): PolicyWorld;
export function rankTargets(world: PolicyWorld, options?: PolicyOptions): readonly RankedTarget[];
export function commitTarget(
  ranked: readonly RankedTarget[],
  profile: AutopilotProfile,
  memory: PolicyMemory,
  nowMs: number,
  world: PolicyWorld
): RankedTarget | undefined;
export function aimBearing(
  world: PolicyWorld,
  target: PolicyEntity,
  projectileSpeed: number,
  profile: AutopilotProfile,
  memory: PolicyMemory
): number;
export function nextShieldContact(
  world: PolicyWorld,
  options?: PolicyOptions
): ShieldContact | undefined;
export function planShield(
  world: PolicyWorld,
  profile: AutopilotProfile,
  memory: PolicyMemory,
  options?: PolicyOptions
): ShieldPlan;
export function planGunner(
  world: PolicyWorld,
  profile: AutopilotProfile,
  memory: PolicyMemory,
  options?: PolicyOptions
): GunnerPlan;
export function huntVector(world: PolicyWorld, memory: PolicyMemory, nowMs: number): Vector;
export function effectiveStandoff(
  world: PolicyWorld,
  profile: AutopilotProfile,
  reach: number
): number;
export function bearingRate(world: PolicyWorld, target: PolicyEntity): number;
export function helmIntent(
  vector: Vector,
  heading: number,
  memory: PolicyMemory,
  mayReverse?: boolean
): PilotPlan;
export function planPilot(
  world: PolicyWorld,
  profile: AutopilotProfile,
  memory: PolicyMemory,
  options?: PolicyOptions
): PilotPlan;
