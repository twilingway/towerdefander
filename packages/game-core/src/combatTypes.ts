import type { ShipStatEffect, ShipStats } from "./shipStats.ts";

import { type CollisionCandidate, type MovingEntity } from "./spatialGrid.ts";
import { type CombatRunStats } from "./runStats.ts";

export type { CollisionCandidate, MovingEntity };

export type EncounterPhase = "combat" | "intermission" | "result";
export type TerminalOutcome = "defeat" | "victory";
export type DefeatReason = "spaceship_destroyed" | "wave_timeout";
export type GameplayRole = "pilot" | "gunner" | "shield";
/**
 * Which barrel fired. Declared here rather than next to the weapon step because
 * the collision resolver needs it to attribute a hit, and `combatTypes` is the
 * module both sides already depend on.
 */
export type FriendlyWeaponSource = "cannon" | "machineGun";
/** Catalogue id, not a fixed enum: operators add archetypes from the console. */
export type EnemyKind = string;
export const ASTEROID_SPAWN_KIND = "asteroid" as const;
/** A catalogue id, or ASTEROID_SPAWN_KIND for the ambient hazard. */
export type SpawnKind = EnemyKind;

/** A preset id, not a fixed enum: the modules live in the balance catalogue. */
export type ModuleId = string;

/** One card of a hull's tree, as the simulation receives it. */
export interface ShipModuleDefinition {
  readonly id: ModuleId;
  readonly role: GameplayRole;
  /** The module's name. The numbers live in the effects, never in the name. */
  readonly label: string;
  readonly effects: readonly ShipStatEffect[];
}

export interface CombatCaps {
  readonly enemyShips: number;
  readonly asteroids: number;
  readonly lootDrops: number;
  readonly hostileProjectiles: number;
  readonly homingMissiles: number;
  readonly friendlyProjectiles: number;
  readonly dynamicEntities: number;
}

/**
 * How a friendly barrel delivers its damage. Kinetic is a bullet with a flight
 * time, laser resolves in the tick it fires, missile turns after a target it
 * picked at launch. Fixed for the run: the hull brings it, no module edits it.
 */
export const FRIENDLY_WEAPON_KINDS = ["kinetic", "laser", "missile"] as const;
export type FriendlyWeaponKind = (typeof FRIENDLY_WEAPON_KINDS)[number];

export type EnemyWeaponKind = "bullet" | "missile";

export interface EnemyWeaponTuning {
  readonly kind: EnemyWeaponKind;
  readonly cooldownTicks: number;
  readonly damage: number;
  readonly shieldHitCost: number;
  readonly projectileRadius: number;
  readonly projectileSpeedPerSecond: number;
  readonly projectileLifetimeTicks: number;
  /** World units to the spaceship at which this weapon opens fire. */
  readonly engagementRange: number;
  readonly turnRatePerSecond: number;
  readonly burstCount: number;
  readonly burstSpreadRadians: number;
  /** Look of the shots this barrel fires; null leaves them the display default. */
  readonly visual: EntityVisual | null;
}

export const SPAWN_SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type SpawnSector = (typeof SPAWN_SECTORS)[number];

export interface WaveSpawnEntry {
  readonly kind: SpawnKind;
  readonly count: number;
  readonly spawnIntervalTicks: number;
  /** Empty means the whole circumference. */
  readonly sectors: readonly SpawnSector[];
  /** Overrides the wave and director multipliers for this group only. */
  readonly hpMultiplier: number | null;
  readonly tempoMultiplier: number | null;
}

export interface WaveDefinition {
  readonly entries: readonly WaveSpawnEntry[];
  readonly hpMultiplier: number | null;
  readonly tempoMultiplier: number | null;
}

export interface DirectorTuning {
  readonly baseBudget: number;
  readonly budgetGrowth: number;
  readonly budgetCap: number;
  readonly hpGrowth: number;
  readonly hpMultiplierCap: number;
  readonly tempoGrowth: number;
  readonly tempoMultiplierCap: number;
  readonly bossWaveInterval: number | null;
}

export interface WaveCampaign {
  readonly waves: readonly WaveDefinition[];
  readonly director: DirectorTuning;
}

export type EnemySpawnPolicy = "standard" | "boss";

/**
 * A silhouette id from the shared visual catalogue. The simulation treats it as
 * opaque: which ids exist is settled by the balance schema in `protocol`, and
 * the display falls back on its own when a preset names one it cannot draw.
 */
/** The hull gun, which also records where it turns about. */
export type TurretVisual =
  | (EntityVisual & {
      /** Where on the hull it is bolted, from the centre; turns with the hull. */
      readonly mountX: number;
      readonly mountY: number;
      /** Nudge of the drawing about that mount; turns with the weapon. */
      readonly pivotX: number;
      readonly pivotY: number;
    })
  | null;

export interface EntityVisual {
  readonly shape: string;
  /** Drawn size relative to the hit radius; the hitbox itself never changes. */
  readonly modelScale: number;
}

export interface EnemyVisual extends EntityVisual {
  readonly showHealthBar: boolean;
}

/**
 * How well an enemy plays, as opposed to what it is. One algorithm reads the
 * profile, so the levels differ by numbers rather than by branches and can be
 * compared against each other and against the enemy that predated them.
 */
export const ENEMY_SKILL_LEVELS = ["rookie", "veteran", "ace"] as const;
export type EnemySkillLevel = (typeof ENEMY_SKILL_LEVELS)[number];

export interface EnemySkillProfile {
  /** Ticks between refreshes of the remembered ship position and velocity. */
  readonly reactionTicks: number;
  /** Seeded spread on the barrel, in radians. */
  readonly aimJitterRadians: number;
  /** 0 fires where the ship is, 1 where it is going to be. */
  readonly leadFactor: number;
  /** Share of the speed budget spent circling rather than closing. */
  readonly orbitShare: number;
  /** Width of the band over which closing blends into circling. */
  readonly rangeBandUnits: number;
  /** Weight of the push away from neighbours that crowd in too close. */
  readonly separationWeight: number;
  /** How far the swarm spreads around the ship instead of massing on one side. */
  readonly flankSpread: number;
  /** Ticks ahead an incoming friendly shot is dodged; 0 never dodges. */
  readonly evadeHorizonTicks: number;
  /** HP fraction below which the enemy backs off; 0 never retreats. */
  readonly retreatHpFraction: number;
  /** Multiplier on the fighting distance while retreating. */
  readonly retreatStandoffFactor: number;
}

export interface EnemySkillTuning {
  /**
   * Whole-step difficulty shift applied to every archetype at once, so the
   * spread the operator laid out across the catalogue survives it.
   */
  readonly offset: number;
  readonly profiles: Readonly<Record<EnemySkillLevel, EnemySkillProfile>>;
}

export interface EnemyArchetype {
  readonly hp: number;
  readonly radius: number;
  readonly speedPerSecond: number;
  readonly preferredDistance: number;
  /**
   * How hard the hull is to turn. The ship carries angular momentum the way the
   * player's does, so a heavy archetype swings past its course and a light one
   * snaps onto it; without these a reversal happened inside a single tick.
   */
  readonly turnRatePerSecond: number;
  readonly turnAccelerationPerSecondSquared: number;
  readonly turnBrakingPerSecondSquared: number;
  /** Which skill profile this archetype plays at, before the global offset. */
  readonly combatSkill: EnemySkillLevel;
  /** At least one; each barrel keeps its own cooldown. */
  readonly weapons: readonly EnemyWeaponTuning[];
  readonly visual: EnemyVisual;
  readonly label: string;
  readonly spawnPolicy: EnemySpawnPolicy;
  readonly spawnCost: number;
  readonly unlockWave: number;
  readonly scoreReward: number;
  readonly creditReward: number;
  /** Probability in [0, 1] that killing this archetype leaves salvage behind. */
  readonly lootChance: number;
}

export interface CombatConfig {
  readonly fixedStepMs: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly arenaRadius: number;
  readonly spaceshipMaxHp: number;
  readonly shieldRadius: number;
  readonly shieldArcRadians: number;
  readonly shieldCapacity: number;
  readonly asteroidShieldHitCost: number;
  readonly asteroidDamage: number;
  readonly friendlyProjectileDamage: number;
  readonly enemySpawnIntervalTicks: number;
  readonly ambientAsteroidIntervalMinTicks: number;
  readonly ambientAsteroidIntervalMaxTicks: number;
  readonly intermissionTicks: number;
  readonly waveCampaign: WaveCampaign;
  readonly enemyArchetypes: Readonly<Record<EnemyKind, EnemyArchetype>>;
  readonly enemySkill: EnemySkillTuning;

  readonly asteroidHp: number;
  readonly asteroidRadius: number;
  readonly asteroidSpeedPerSecond: number;
  readonly asteroidLifetimeTicks: number;
  readonly asteroidSpawnCost: number;
  readonly asteroidScoreReward: number;
  readonly asteroidCreditReward: number;
  /** Hull points one repair drop returns, and shield energy one cell returns. */
  readonly lootRepairAmount: number;
  readonly lootShieldAmount: number;
  /** A boss always leaves this instead: the reward for taking a boss wave. */
  readonly lootBossRepairAmount: number;
  readonly lootLifetimeTicks: number;
  readonly lootDropRadius: number;
  /** Inside this distance a drop stops drifting and comes to the ship. */
  readonly lootMagnetRadius: number;
  readonly lootMagnetAccelerationPerSecondSquared: number;
  /**
   * How fast inherited speed bleeds off. A drop keeps the dead enemy's motion
   * so it reads as wreckage, but an interceptor's salvage must not sail across
   * the whole arena before anyone can reach it.
   */
  readonly lootDriftDampingPerSecond: number;
  /**
   * How long a cleared wave stays open while salvage is still on the field.
   * A boss wave gets its own, longer number: its repair is the largest of the
   * run and it lands on the very tick the wave would otherwise end.
   */
  readonly lootWindowTicks: number;
  readonly lootBossWindowTicks: number;
  /** Look of the ambient hazard; null keeps the display's own rock. */
  readonly asteroidVisual: EntityVisual | null;
  readonly missileInterceptScoreReward: number;
  readonly worldPadding: number;
  readonly spatialCellSize: number;
  readonly caps: CombatCaps;
  /**
   * The tree of the hull this run is played on, already resolved: the
   * simulation is handed the chosen ship's tiers and never learns that a
   * catalogue of hulls exists.
   */
  readonly moduleTiers: readonly (readonly ShipModuleDefinition[])[];
  /** Offered on every intermission once the tiers are spent; repeatable. */
  readonly endlessTier: readonly ShipModuleDefinition[];
}

export interface UpgradeCard {
  readonly upgradeId: ModuleId;
  readonly role: GameplayRole;
  readonly label: string;
  /** What the module does. Clients caption the card from these, not from prose. */
  readonly effects: readonly ShipStatEffect[];
  readonly price: 5;
}

export interface TeamUpgradeOffer {
  readonly offerId: string;
  readonly waveNumber: number;
  /** Which tier of the tree these cards came from; 1-based, 0 for the tail. */
  readonly tier: number;
  readonly cards: readonly UpgradeCard[];
}

export interface TeamUpgradeVote {
  readonly role: GameplayRole;
  readonly upgradeId: ModuleId;
  readonly revision: number;
}

export type TeamUpgradeVotes = Readonly<Record<GameplayRole, TeamUpgradeVote | null>>;
export interface TeamUpgradeSelection {
  readonly waveNumber: number;
  readonly offerId: string;
  readonly upgradeId: ModuleId;
  readonly role: GameplayRole;
  readonly price: 5;
}

/**
 * What an enemy believes about the ship, refreshed every `reactionTicks` and
 * carried forward on its own velocity in between. Internal: it never reaches a
 * snapshot, because the client sees only where the enemy ended up.
 */
export interface EnemyPerception {
  /** Tick the snapshot was taken at; -1 means the enemy has never looked. */
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
}

export interface CombatEnemyState extends MovingEntity {
  readonly kind: EnemyKind;
  readonly heading: number;
  /** Spin the hull still carries. Internal: the display only gets `heading`. */
  readonly angularVelocity: number;
  /**
   * Which way round the ship this enemy circles, `1` or `-1`. Chosen at spawn
   * and reversed only when the arena wall leaves the current side no room.
   * Internal: it never reaches a snapshot.
   */
  readonly orbitSign: number;
  readonly hp: number;
  readonly maxHp: number;
  /** One entry per archetype weapon, in the archetype's order. */
  readonly weaponCooldownTicks: readonly number[];
  readonly perception: EnemyPerception;
  /**
   * Seeded stream the aim spread draws from, advanced only on a tick this
   * enemy actually fires. Internal: it never reaches a snapshot.
   */
  readonly aimRngState: number;
}

export interface AsteroidState extends MovingEntity {
  readonly origin: "wave" | "ambient";
  readonly hp: number;
  readonly maxHp: number;
  readonly damage: number;
}

/** What a drop restores. Both are clamped by the ship's current maximum. */
export type LootKind = "repair" | "shieldCell";

/**
 * Salvage left by a destroyed enemy. Lives like an asteroid — drifts, ages,
 * leaves the arena — but exists to be caught rather than avoided: inside the
 * magnet radius it accelerates at the ship, and touching the hull spends it.
 */
export interface LootDropState extends MovingEntity {
  readonly kind: LootKind;
  readonly amount: number;
  readonly lifetimeTicks: number;
}

export interface HostileProjectileState extends MovingEntity {
  readonly damage: number;
  readonly shieldHitCost: number;
  readonly lifetimeTicks: number;
  readonly visual: EntityVisual | null;
}

export interface HomingMissileState extends MovingEntity {
  readonly heading: number;
  readonly damage: number;
  readonly shieldHitCost: number;
  readonly lifetimeTicks: number;
  readonly speedPerSecond: number;
  readonly turnRatePerSecond: number;
  readonly visual: EntityVisual | null;
}

export interface PendingSpawn {
  readonly kind: SpawnKind;
  readonly planSequence: number;
  readonly spawnIntervalTicks: number;
  readonly sectors: readonly SpawnSector[];
  readonly hpMultiplier: number | null;
  readonly tempoMultiplier: number | null;
}

export interface CombatStateFields {
  readonly runSeed: number;
  readonly spawnRngState: number;
  readonly ambientAsteroidRngState: number;
  /** Drop rolls for the current wave, derived fresh from the run seed and wave. */
  readonly lootRngState: number;
  readonly ambientAsteroidSpawnDueTick: number | null;
  readonly spaceshipHp: number;
  readonly encounterPhase: EncounterPhase;
  readonly outcome: TerminalOutcome | null;
  readonly defeatReason: DefeatReason | null;
  readonly waveNumber: number;
  readonly encounterTick: number;
  /**
   * Ticks since either side last drew blood. Enemies close in as it grows, so a
   * fight where nobody can land a hit resolves instead of running forever.
   * Internal: it never reaches a snapshot.
   */
  readonly stalemateTicks: number;
  readonly score: number;
  readonly credits: number;
  readonly nextSpawnSequence: number;
  readonly nextWaveSpawnTick: number;
  readonly pendingSpawns: readonly PendingSpawn[];
  readonly enemies: readonly CombatEnemyState[];
  readonly asteroids: readonly AsteroidState[];
  readonly lootDrops: readonly LootDropState[];
  /**
   * Ticks left in the collection window that holds a cleared wave open. Zero
   * while the wave is still being fought, and zero again once it is over.
   */
  readonly lootWindowTicksRemaining: number;
  /**
   * The ship's own numbers for this run: the preset's base with every purchased
   * module applied. The simulation reads them from here and never from the
   * config, so a module cannot be silently ignored by one caller.
   */
  /** Laser pulses fired in the last couple of ticks; display-only, never a cap. */
  readonly laserBeams: readonly FriendlyProjectileLike[];
  readonly ship: ShipStats;
  /** Append-only, in purchase order; the stats above are derived from it. */
  readonly purchasedModules: readonly ModuleId[];
  readonly hostileProjectiles: readonly HostileProjectileState[];
  readonly homingMissiles: readonly HomingMissileState[];
  readonly teamUpgradeOffer: TeamUpgradeOffer | null;
  readonly teamUpgradeVotes: TeamUpgradeVotes;
  readonly teamUpgradeSelection: TeamUpgradeSelection | null;
  /** Measurement only. Never projected into the room schema, never on the wire. */
  readonly runStats: CombatRunStats;
}

export interface FriendlyProjectileLike extends MovingEntity {
  readonly damage: number;
  readonly source: FriendlyWeaponSource;
}

/**
 * A laser pulse: the same shape as any other friendly shot, from the muzzle to
 * the end of its reach, and resolved in the tick it was fired. It is not an
 * entity — it takes no room in the caps and is kept for two ticks only so the
 * display has something to draw.
 */
export type LaserBeamState = FriendlyProjectileLike;

export interface CombatStepState extends CombatStateFields {
  readonly clock: { readonly tick: number };
  readonly spaceship: {
    readonly x: number;
    readonly y: number;
    readonly previousX: number;
    readonly previousY: number;
    readonly radius: number;
  };
  readonly shieldAngle: number;
  readonly shieldActive: boolean;
  readonly shieldEnergy: number;
  readonly shieldRearmRequired: boolean;
  readonly projectiles: readonly FriendlyProjectileLike[];
}

export interface CombatStepResult extends CombatStateFields {
  readonly shieldActive: boolean;
  readonly shieldEnergy: number;
  readonly shieldRearmRequired: boolean;
  readonly projectiles: readonly FriendlyProjectileLike[];
}

export interface WaveDifficulty {
  readonly budget: number;
  readonly hpMultiplier: number;
  readonly tempoMultiplier: number;
}

export interface UpgradeVoteCommand {
  readonly role: GameplayRole;
  readonly waveNumber: number;
  readonly offerId: string;
  readonly upgradeId: ModuleId;
  readonly revision: number;
}

export interface UpgradeVoteResult<TState extends CombatStateFields> {
  readonly status: "accepted" | "stale_action" | "action_not_available";
  readonly state: TState;
}
