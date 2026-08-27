import { type CollisionCandidate, type MovingEntity } from "./spatialGrid.ts";

export type { CollisionCandidate, MovingEntity };

export type EncounterPhase = "combat" | "intermission" | "result";
export type TerminalOutcome = "defeat" | "victory";
export type DefeatReason = "spaceship_destroyed" | "wave_timeout";
export type GameplayRole = "pilot" | "gunner" | "shield";
/** Catalogue id, not a fixed enum: operators add archetypes from the console. */
export type EnemyKind = string;
export const ASTEROID_SPAWN_KIND = "asteroid" as const;
/** A catalogue id, or ASTEROID_SPAWN_KIND for the ambient hazard. */
export type SpawnKind = EnemyKind;

export type UpgradeId =
  | "pilot_speed"
  | "pilot_acceleration"
  | "pilot_hull"
  | "gunner_damage"
  | "gunner_cooldown"
  | "gunner_projectile_speed"
  | "shield_capacity"
  | "shield_recharge"
  | "shield_arc";

export interface CombatCaps {
  readonly enemyShips: number;
  readonly asteroids: number;
  readonly hostileProjectiles: number;
  readonly homingMissiles: number;
  readonly friendlyProjectiles: number;
  readonly dynamicEntities: number;
}

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
  /** At least one; each barrel keeps its own cooldown. */
  readonly weapons: readonly EnemyWeaponTuning[];
  readonly visual: EnemyVisual;
  readonly label: string;
  readonly spawnPolicy: EnemySpawnPolicy;
  readonly spawnCost: number;
  readonly unlockWave: number;
  readonly scoreReward: number;
  readonly creditReward: number;
}

export interface CombatConfig {
  readonly fixedStepMs: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly arenaRadius: number;
  readonly spaceshipMaxHp: number;
  readonly shieldRadius: number;
  readonly shieldArcRadians: number;
  readonly asteroidShieldHitCost: number;
  readonly asteroidDamage: number;
  readonly friendlyProjectileDamage: number;
  readonly enemySpawnIntervalTicks: number;
  readonly ambientAsteroidIntervalMinTicks: number;
  readonly ambientAsteroidIntervalMaxTicks: number;
  readonly intermissionTicks: number;
  readonly waveCampaign: WaveCampaign;
  readonly enemyArchetypes: Readonly<Record<EnemyKind, EnemyArchetype>>;

  readonly asteroidHp: number;
  readonly asteroidRadius: number;
  readonly asteroidSpeedPerSecond: number;
  readonly asteroidLifetimeTicks: number;
  readonly asteroidSpawnCost: number;
  readonly asteroidScoreReward: number;
  readonly asteroidCreditReward: number;
  /** Look of the ambient hazard; null keeps the display's own rock. */
  readonly asteroidVisual: EntityVisual | null;
  readonly missileInterceptScoreReward: number;
  readonly worldPadding: number;
  readonly spatialCellSize: number;
  readonly caps: CombatCaps;
}

export interface PilotModifiers {
  readonly speedMultiplier: number;
  readonly accelerationMultiplier: number;
  readonly maxHpBonus: number;
}

export interface GunnerModifiers {
  readonly damageMultiplier: number;
  readonly cooldownMultiplier: number;
  readonly projectileSpeedMultiplier: number;
}

export interface ShieldModifiers {
  readonly capacityBonus: number;
  readonly rechargeMultiplier: number;
  readonly arcWidthBonus: number;
}

export interface RoleModifiers {
  readonly pilot: PilotModifiers;
  readonly gunner: GunnerModifiers;
  readonly shield: ShieldModifiers;
}

export interface UpgradeCard {
  readonly upgradeId: UpgradeId;
  readonly role: GameplayRole;
  readonly label: string;
  readonly value: number;
  readonly price: 5;
}

export interface TeamUpgradeOffer {
  readonly offerId: string;
  readonly waveNumber: number;
  readonly cards: readonly UpgradeCard[];
}

export interface TeamUpgradeVote {
  readonly role: GameplayRole;
  readonly upgradeId: UpgradeId;
  readonly revision: number;
}

export type TeamUpgradeVotes = Readonly<Record<GameplayRole, TeamUpgradeVote | null>>;
export interface TeamUpgradeSelection {
  readonly waveNumber: number;
  readonly offerId: string;
  readonly upgradeId: UpgradeId;
  readonly role: GameplayRole;
  readonly price: 5;
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
}

export interface AsteroidState extends MovingEntity {
  readonly origin: "wave" | "ambient";
  readonly hp: number;
  readonly maxHp: number;
  readonly damage: number;
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
  readonly offerRngState: number;
  readonly ambientAsteroidRngState: number;
  readonly ambientAsteroidSpawnDueTick: number | null;
  readonly spaceshipHp: number;
  readonly spaceshipMaxHp: number;
  readonly encounterPhase: EncounterPhase;
  readonly outcome: TerminalOutcome | null;
  readonly defeatReason: DefeatReason | null;
  readonly waveNumber: number;
  readonly encounterTick: number;
  readonly score: number;
  readonly credits: number;
  readonly nextSpawnSequence: number;
  readonly nextWaveSpawnTick: number;
  readonly pendingSpawns: readonly PendingSpawn[];
  readonly enemies: readonly CombatEnemyState[];
  readonly asteroids: readonly AsteroidState[];
  readonly hostileProjectiles: readonly HostileProjectileState[];
  readonly homingMissiles: readonly HomingMissileState[];
  readonly roleModifiers: RoleModifiers;
  readonly teamUpgradeOffer: TeamUpgradeOffer | null;
  readonly teamUpgradeVotes: TeamUpgradeVotes;
  readonly teamUpgradeSelection: TeamUpgradeSelection | null;
}

export interface FriendlyProjectileLike extends MovingEntity {
  readonly damage: number;
}

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
  readonly upgradeId: UpgradeId;
  readonly revision: number;
}

export interface UpgradeVoteResult<TState extends CombatStateFields> {
  readonly status: "accepted" | "stale_action" | "action_not_available";
  readonly state: TState;
}
