import { canonicalizeAngle, shortestAngleDelta, type Vector2 } from "./spaceshipSimulation.js";
import {
  constrainMovingCircleToArena,
  isWithinCircularEnvelope,
  type ArenaCircle
} from "./arenaGeometry.js";

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
  readonly turnRatePerSecond: number;
  readonly burstCount: number;
  readonly burstSpreadRadians: number;
}

export const SPAWN_SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type SpawnSector = (typeof SPAWN_SECTORS)[number];

export interface WaveSpawnEntry {
  readonly kind: SpawnKind;
  readonly count: number;
  readonly spawnIntervalTicks: number;
  /** Empty means the whole circumference. */
  readonly sectors: readonly SpawnSector[];
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

export const ENEMY_SHAPES = [
  "arrowhead",
  "block",
  "diamond",
  "dart",
  "hexagon",
  "cross",
  "ring",
  "spike"
] as const;
export type EnemyShape = (typeof ENEMY_SHAPES)[number];

export interface EnemyVisual {
  readonly shape: EnemyShape;
  readonly color: string;
  readonly outline: string;
  readonly showHealthBar: boolean;
}

export interface EnemyArchetype {
  readonly hp: number;
  readonly radius: number;
  readonly speedPerSecond: number;
  readonly preferredDistance: number;
  readonly weapon: EnemyWeaponTuning;
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

interface MovingEntity {
  readonly id: string;
  readonly spawnSequence: number;
  readonly previousX: number;
  readonly previousY: number;
  readonly x: number;
  readonly y: number;
  readonly velocity: Vector2;
  readonly radius: number;
  readonly spawnedTick: number;
}

export interface CombatEnemyState extends MovingEntity {
  readonly kind: EnemyKind;
  readonly heading: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly attackCooldownTicks: number;
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
}

export interface HomingMissileState extends MovingEntity {
  readonly heading: number;
  readonly damage: number;
  readonly shieldHitCost: number;
  readonly lifetimeTicks: number;
  readonly speedPerSecond: number;
  readonly turnRatePerSecond: number;
}

export interface PendingSpawn {
  readonly kind: SpawnKind;
  readonly planSequence: number;
  readonly spawnIntervalTicks: number;
  readonly sectors: readonly SpawnSector[];
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

const ROLES: readonly GameplayRole[] = ["pilot", "gunner", "shield"];
const UINT32_MAX = 0xffff_ffff;
const SPAWN_DOMAIN = 0x5350_4157;
const OFFER_DOMAIN = 0x4f46_4652;
const AMBIENT_ASTEROID_DOMAIN = 0x414d_4254;
const MAX_PUBLIC_TRANSIENT_PADDING = 256;
export const TEAM_UPGRADE_PRICE = 5 as const;

export function validateRunSeed(runSeed: number): void {
  if (!Number.isInteger(runSeed) || runSeed <= 0 || runSeed > UINT32_MAX) {
    throw new RangeError("runSeed must be a non-zero uint32");
  }
}

export function validateCombatConfig(config: CombatConfig): void {
  if (config.fixedStepMs !== 50) {
    throw new RangeError("fixedStepMs must be exactly 50 for combat simulation");
  }
  const positiveIntegers: readonly (readonly [string, number])[] = [
    ["enemySpawnIntervalTicks", config.enemySpawnIntervalTicks],
    ["ambientAsteroidIntervalMinTicks", config.ambientAsteroidIntervalMinTicks],
    ["ambientAsteroidIntervalMaxTicks", config.ambientAsteroidIntervalMaxTicks],
    ["intermissionTicks", config.intermissionTicks],
    ["waveCampaign.director.baseBudget", config.waveCampaign.director.baseBudget],
    ["waveCampaign.director.budgetGrowth", config.waveCampaign.director.budgetGrowth],
    ["waveCampaign.director.budgetCap", config.waveCampaign.director.budgetCap],
    ["asteroidLifetimeTicks", config.asteroidLifetimeTicks],
    ["asteroidSpawnCost", config.asteroidSpawnCost],
    ["caps.enemyShips", config.caps.enemyShips],
    ["caps.asteroids", config.caps.asteroids],
    ["caps.hostileProjectiles", config.caps.hostileProjectiles],
    ["caps.homingMissiles", config.caps.homingMissiles],
    ["caps.friendlyProjectiles", config.caps.friendlyProjectiles],
    ["caps.dynamicEntities", config.caps.dynamicEntities]
  ];
  for (const [name, value] of positiveIntegers) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }

  const positiveFinite: readonly (readonly [string, number])[] = [
    ["worldWidth", config.worldWidth],
    ["worldHeight", config.worldHeight],
    ["arenaRadius", config.arenaRadius],
    ["spaceshipMaxHp", config.spaceshipMaxHp],
    ["shieldRadius", config.shieldRadius],
    ["shieldArcRadians", config.shieldArcRadians],
    ["asteroidShieldHitCost", config.asteroidShieldHitCost],
    ["asteroidDamage", config.asteroidDamage],
    ["friendlyProjectileDamage", config.friendlyProjectileDamage],
    ["waveCampaign.director.hpGrowth", config.waveCampaign.director.hpGrowth],
    ["waveCampaign.director.hpMultiplierCap", config.waveCampaign.director.hpMultiplierCap],
    ["waveCampaign.director.tempoGrowth", config.waveCampaign.director.tempoGrowth],
    ["waveCampaign.director.tempoMultiplierCap", config.waveCampaign.director.tempoMultiplierCap],
    ["asteroidHp", config.asteroidHp],
    ["asteroidRadius", config.asteroidRadius],
    ["asteroidSpeedPerSecond", config.asteroidSpeedPerSecond],
    ["worldPadding", config.worldPadding],
    ["spatialCellSize", config.spatialCellSize]
  ];
  for (const [name, value] of positiveFinite) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number`);
    }
  }
  const nonNegativeFinite: readonly (readonly [string, number])[] = [
    ["asteroidScoreReward", config.asteroidScoreReward],
    ["asteroidCreditReward", config.asteroidCreditReward],
    ["missileInterceptScoreReward", config.missileInterceptScoreReward]
  ];
  for (const [name, value] of nonNegativeFinite) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative finite number`);
    }
  }
  validateEnemyArchetypes(config);
  validateWaveCampaign(config);
  if (config.shieldArcRadians > Math.PI * 2) {
    throw new RangeError("shieldArcRadians cannot exceed a full circle");
  }
  if (config.worldWidth !== config.worldHeight || config.worldWidth !== config.arenaRadius * 2) {
    throw new RangeError("worldWidth and worldHeight must equal the arena diameter");
  }
  if (config.ambientAsteroidIntervalMinTicks > config.ambientAsteroidIntervalMaxTicks) {
    throw new RangeError(
      "ambientAsteroidIntervalMinTicks cannot exceed ambientAsteroidIntervalMaxTicks"
    );
  }
  for (const archetype of Object.values(config.enemyArchetypes)) {
    if (archetype.radius > config.arenaRadius) {
      throw new RangeError("enemy ship radii must fit inside the circular arena");
    }
  }
  if (config.worldPadding > MAX_PUBLIC_TRANSIENT_PADDING) {
    throw new RangeError("worldPadding cannot exceed the public transient envelope");
  }
  if (config.asteroidRadius > config.worldPadding) {
    throw new RangeError("worldPadding must fit an asteroid spawned on the arena perimeter");
  }
  const typedCapTotal =
    config.caps.enemyShips +
    config.caps.asteroids +
    config.caps.hostileProjectiles +
    config.caps.homingMissiles +
    config.caps.friendlyProjectiles;
  if (config.caps.dynamicEntities > typedCapTotal) {
    throw new RangeError("dynamicEntities cap cannot exceed the sum of typed caps");
  }
}

/** Config validation guarantees the id resolves; this keeps the hot path honest. */
export function getEnemyArchetype(config: CombatConfig, kind: EnemyKind): EnemyArchetype {
  return archetypeOf(config, kind);
}

function archetypeOf(config: CombatConfig, kind: EnemyKind): EnemyArchetype {
  const archetype = config.enemyArchetypes[kind];
  if (archetype === undefined) {
    throw new RangeError(`enemyArchetypes has no archetype "${kind}"`);
  }
  return archetype;
}

function enemyKindsOf(config: CombatConfig): readonly EnemyKind[] {
  return Object.keys(config.enemyArchetypes);
}

function validateEnemyArchetypes(config: CombatConfig): void {
  const kinds = enemyKindsOf(config);
  if (kinds.length === 0) {
    throw new RangeError("enemyArchetypes must describe at least one archetype");
  }
  if (Object.hasOwn(config.enemyArchetypes, "asteroid")) {
    throw new RangeError('"asteroid" is the ambient hazard and cannot be an archetype id');
  }
  for (const kind of kinds) {
    const archetype = archetypeOf(config, kind);
    if (!ENEMY_SHAPES.includes(archetype.visual.shape)) {
      throw new RangeError(`${kind}.visual.shape is not a shape the display can draw`);
    }
    if (archetype.label.length === 0) {
      throw new RangeError(`${kind}.label must not be empty`);
    }
    const positiveIntegers: readonly (readonly [string, number])[] = [
      ["unlockWave", archetype.unlockWave],
      ["weapon.cooldownTicks", archetype.weapon.cooldownTicks],
      ["weapon.projectileLifetimeTicks", archetype.weapon.projectileLifetimeTicks],
      ["weapon.burstCount", archetype.weapon.burstCount]
    ];
    for (const [name, value] of positiveIntegers) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError(`${kind}.${name} must be a positive safe integer`);
      }
    }
    const positiveFinite: readonly (readonly [string, number])[] = [
      ["hp", archetype.hp],
      ["radius", archetype.radius],
      ["speedPerSecond", archetype.speedPerSecond],
      ["preferredDistance", archetype.preferredDistance],
      ["spawnCost", archetype.spawnCost],
      ["weapon.damage", archetype.weapon.damage],
      ["weapon.shieldHitCost", archetype.weapon.shieldHitCost],
      ["weapon.projectileRadius", archetype.weapon.projectileRadius],
      ["weapon.projectileSpeedPerSecond", archetype.weapon.projectileSpeedPerSecond],
      ["weapon.turnRatePerSecond", archetype.weapon.turnRatePerSecond]
    ];
    for (const [name, value] of positiveFinite) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${kind}.${name} must be a positive finite number`);
      }
    }
    const nonNegativeFinite: readonly (readonly [string, number])[] = [
      ["scoreReward", archetype.scoreReward],
      ["creditReward", archetype.creditReward],
      ["weapon.burstSpreadRadians", archetype.weapon.burstSpreadRadians]
    ];
    for (const [name, value] of nonNegativeFinite) {
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`${kind}.${name} must be a non-negative finite number`);
      }
    }
    if (archetype.weapon.burstSpreadRadians > Math.PI * 2) {
      throw new RangeError(`${kind}.weapon.burstSpreadRadians cannot exceed a full circle`);
    }
  }
}

function validateWaveCampaign(config: CombatConfig): void {
  const campaign = config.waveCampaign;
  const bossInterval = campaign.director.bossWaveInterval;
  if (bossInterval !== null && (!Number.isSafeInteger(bossInterval) || bossInterval <= 0)) {
    throw new RangeError(
      "waveCampaign.director.bossWaveInterval must be null or a positive integer"
    );
  }
  campaign.waves.forEach((wave, index) => {
    const label = `waveCampaign.waves[${String(index)}]`;
    if (wave.entries.length === 0) {
      throw new RangeError(`${label} must spawn at least one threat`);
    }
    for (const [name, value] of [
      ["hpMultiplier", wave.hpMultiplier],
      ["tempoMultiplier", wave.tempoMultiplier]
    ] as const) {
      if (value !== null && (!Number.isFinite(value) || value <= 0)) {
        throw new RangeError(`${label}.${name} must be null or a positive finite number`);
      }
    }
    wave.entries.forEach((entry, entryIndex) => {
      const entryLabel = `${label}.entries[${String(entryIndex)}]`;
      if (entry.kind !== "asteroid" && !Object.hasOwn(config.enemyArchetypes, entry.kind)) {
        throw new RangeError(`${entryLabel}.kind is not in the enemy catalogue`);
      }
      if (!Number.isSafeInteger(entry.count) || entry.count <= 0) {
        throw new RangeError(`${entryLabel}.count must be a positive safe integer`);
      }
      if (!Number.isSafeInteger(entry.spawnIntervalTicks) || entry.spawnIntervalTicks <= 0) {
        throw new RangeError(`${entryLabel}.spawnIntervalTicks must be a positive safe integer`);
      }
      for (const sector of entry.sectors) {
        if (!SPAWN_SECTORS.includes(sector)) {
          throw new RangeError(`${entryLabel}.sectors contains an unknown spawn sector`);
        }
      }
    });
  });
}

export function deriveDomainSeed(runSeed: number, waveNumber: number, domain: number): number {
  validateRunSeed(runSeed);
  if (!Number.isSafeInteger(waveNumber) || waveNumber <= 0) {
    throw new RangeError("waveNumber must be a positive safe integer");
  }
  let value = (runSeed ^ Math.imul(waveNumber, 0x9e37_79b1) ^ domain) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85eb_ca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2_ae35) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return value === 0 ? 0x6d2b_79f5 : value;
}

export function nextUint32(state: number): readonly [number, number] {
  validateRunSeed(state);
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;
  return [next === 0 ? 0x6d2b_79f5 : next, next >>> 0];
}

function getScriptedWave(config: CombatConfig, waveNumber: number): WaveDefinition | null {
  if (!Number.isSafeInteger(waveNumber) || waveNumber <= 0) return null;
  return config.waveCampaign.waves[waveNumber - 1] ?? null;
}

export function getWaveDifficulty(config: CombatConfig, waveNumber: number): WaveDifficulty {
  const director = config.waveCampaign.director;
  const waveOffset = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, waveNumber - 1));
  const scripted = getScriptedWave(config, waveNumber);
  return {
    budget: Math.min(director.budgetCap, director.baseBudget + director.budgetGrowth * waveOffset),
    hpMultiplier:
      scripted?.hpMultiplier ??
      Math.min(director.hpMultiplierCap, 1 + director.hpGrowth * waveOffset),
    tempoMultiplier:
      scripted?.tempoMultiplier ??
      Math.min(director.tempoMultiplierCap, 1 + director.tempoGrowth * waveOffset)
  };
}

export function createWavePlan(
  config: CombatConfig,
  runSeed: number,
  waveNumber: number
): { readonly plan: readonly PendingSpawn[]; readonly rngState: number } {
  const rngState = deriveDomainSeed(runSeed, waveNumber, SPAWN_DOMAIN);
  const scripted = getScriptedWave(config, waveNumber);
  if (scripted !== null) {
    return { plan: createScriptedWavePlan(scripted), rngState };
  }
  return createDirectedWavePlan(config, waveNumber, rngState);
}

function createScriptedWavePlan(wave: WaveDefinition): readonly PendingSpawn[] {
  const plan: PendingSpawn[] = [];
  for (const entry of wave.entries) {
    for (let index = 0; index < entry.count; index += 1) {
      plan.push({
        kind: entry.kind,
        planSequence: plan.length,
        spawnIntervalTicks: entry.spawnIntervalTicks,
        sectors: entry.sectors
      });
    }
  }
  return plan;
}

function findBossKindForWave(config: CombatConfig, waveNumber: number): EnemyKind | undefined {
  const interval = config.waveCampaign.director.bossWaveInterval;
  if (interval === null || waveNumber % interval !== 0) return undefined;
  return enemyKindsOf(config).find((kind) => {
    const archetype = archetypeOf(config, kind);
    return archetype.spawnPolicy === "boss" && waveNumber >= archetype.unlockWave;
  });
}

/** A boss holds its slot until the rest of the wave is destroyed. */
function waitsForClearedWave(config: CombatConfig, kind: SpawnKind): boolean {
  return kind !== "asteroid" && archetypeOf(config, kind).spawnPolicy === "boss";
}

function hasLiveWaveThreats(
  enemies: readonly CombatEnemyState[],
  asteroids: readonly AsteroidState[]
): boolean {
  return enemies.length > 0 || asteroids.some(({ origin }) => origin === "wave");
}

function createDirectedWavePlan(
  config: CombatConfig,
  waveNumber: number,
  initialRngState: number
): { readonly plan: readonly PendingSpawn[]; readonly rngState: number } {
  let remaining = getWaveDifficulty(config, waveNumber).budget;
  let rngState = initialRngState;
  const spawnCostOf = (kind: SpawnKind): number =>
    kind === "asteroid" ? config.asteroidSpawnCost : archetypeOf(config, kind).spawnCost;
  const available = enemyKindsOf(config)
    .filter((kind) => {
      const archetype = archetypeOf(config, kind);
      return archetype.spawnPolicy === "standard" && waveNumber >= archetype.unlockWave;
    })
    .sort((left, right) => spawnCostOf(right) - spawnCostOf(left) || left.localeCompare(right));
  const kinds: SpawnKind[] = [];
  const anchor = available[0];
  if (anchor !== undefined && remaining >= spawnCostOf(anchor)) {
    kinds.push(anchor);
    remaining -= spawnCostOf(anchor);
  }
  while (remaining > 0) {
    const [afterPick, pick] = nextUint32(rngState);
    const [afterChoice, choice] = nextUint32(afterPick);
    rngState = afterChoice;
    const affordable = available.filter((kind) => spawnCostOf(kind) <= remaining);
    const kind: SpawnKind =
      affordable.length === 0 || pick % 3 === 0
        ? "asteroid"
        : (affordable[choice % affordable.length] ?? "asteroid");
    kinds.push(kind);
    remaining -= spawnCostOf(kind);
  }
  for (let index = kinds.length - 1; index > 0; index -= 1) {
    const [next, random] = nextUint32(rngState);
    rngState = next;
    const swapIndex = random % (index + 1);
    const current = kinds[index];
    const swap = kinds[swapIndex];
    if (current !== undefined && swap !== undefined) {
      kinds[index] = swap;
      kinds[swapIndex] = current;
    }
  }
  // Appended after the shuffle so the boss always closes the wave.
  const boss = findBossKindForWave(config, waveNumber);
  if (boss !== undefined) {
    kinds.push(boss);
  }
  return {
    plan: kinds.map((kind, planSequence) => ({
      kind,
      planSequence,
      spawnIntervalTicks: config.enemySpawnIntervalTicks,
      sectors: []
    })),
    rngState
  };
}

export function createInitialCombatState(config: CombatConfig, runSeed: number): CombatStateFields {
  validateCombatConfig(config);
  validateRunSeed(runSeed);
  const { plan, rngState } = createWavePlan(config, runSeed, 1);
  const ambientSchedule = scheduleAmbientAsteroid(
    deriveDomainSeed(runSeed, 1, AMBIENT_ASTEROID_DOMAIN),
    0,
    config
  );
  return {
    runSeed,
    spawnRngState: rngState,
    offerRngState: deriveDomainSeed(runSeed, 1, OFFER_DOMAIN),
    ambientAsteroidRngState: ambientSchedule.rngState,
    ambientAsteroidSpawnDueTick: ambientSchedule.dueTick,
    spaceshipHp: config.spaceshipMaxHp,
    spaceshipMaxHp: config.spaceshipMaxHp,
    encounterPhase: "combat",
    outcome: null,
    defeatReason: null,
    waveNumber: 1,
    encounterTick: 0,
    score: 0,
    credits: 0,
    nextSpawnSequence: 1,
    nextWaveSpawnTick: 0,
    pendingSpawns: plan,
    enemies: [],
    asteroids: [],
    hostileProjectiles: [],
    homingMissiles: [],
    roleModifiers: {
      pilot: { speedMultiplier: 1, accelerationMultiplier: 1, maxHpBonus: 0 },
      gunner: { damageMultiplier: 1, cooldownMultiplier: 1, projectileSpeedMultiplier: 1 },
      shield: { capacityBonus: 0, rechargeMultiplier: 1, arcWidthBonus: 0 }
    },
    teamUpgradeOffer: null,
    teamUpgradeVotes: { pilot: null, gunner: null, shield: null },
    teamUpgradeSelection: null
  };
}

function scheduleAmbientAsteroid(
  rngState: number,
  currentEncounterTick: number,
  config: CombatConfig
): { readonly rngState: number; readonly dueTick: number } {
  const [nextState, random] = nextUint32(rngState);
  const intervalRange =
    config.ambientAsteroidIntervalMaxTicks - config.ambientAsteroidIntervalMinTicks + 1;
  const delay = config.ambientAsteroidIntervalMinTicks + (random % intervalRange);
  return {
    rngState: nextState,
    dueTick: currentEncounterTick + delay
  };
}

export function createTeamUpgradeOffer(
  runSeed: number,
  waveNumber: number
): {
  readonly offer: TeamUpgradeOffer;
  readonly rngState: number;
} {
  let rngState = deriveDomainSeed(runSeed, waveNumber, OFFER_DOMAIN);
  const pools: Readonly<Record<GameplayRole, readonly Omit<UpgradeCard, "role" | "price">[]>> = {
    pilot: [
      { upgradeId: "pilot_speed", label: "Maximum speed +10%", value: 0.1 },
      { upgradeId: "pilot_acceleration", label: "Acceleration +12%", value: 0.12 },
      { upgradeId: "pilot_hull", label: "Hull +25 and repair 25", value: 25 }
    ],
    gunner: [
      { upgradeId: "gunner_damage", label: "Damage +15%", value: 0.15 },
      { upgradeId: "gunner_cooldown", label: "Cooldown -10%", value: 0.1 },
      { upgradeId: "gunner_projectile_speed", label: "Projectile speed +12%", value: 0.12 }
    ],
    shield: [
      { upgradeId: "shield_capacity", label: "Capacity +20", value: 20 },
      { upgradeId: "shield_recharge", label: "Recharge +15%", value: 0.15 },
      { upgradeId: "shield_arc", label: "Arc width +10 degrees", value: Math.PI / 18 }
    ]
  };
  const cards: UpgradeCard[] = [];
  for (const role of ROLES) {
    const roleCards = [...pools[role]];
    for (let index = roleCards.length - 1; index > 0; index -= 1) {
      const [next, random] = nextUint32(rngState);
      rngState = next;
      const swapIndex = random % (index + 1);
      const card = roleCards[index];
      const swap = roleCards[swapIndex];
      if (card !== undefined && swap !== undefined) {
        roleCards[index] = swap;
        roleCards[swapIndex] = card;
      }
    }
    const card = roleCards[0];
    if (card === undefined) throw new RangeError(`Upgrade pool for ${role} cannot be empty`);
    cards.push({ ...card, role, price: TEAM_UPGRADE_PRICE });
  }
  return { offer: { offerId: `offer-w${String(waveNumber)}`, waveNumber, cards }, rngState };
}

export function voteForTeamUpgrade<TState extends CombatStateFields>(
  state: TState,
  command: UpgradeVoteCommand
): UpgradeVoteResult<TState> {
  if (state.encounterPhase !== "intermission" || command.waveNumber !== state.waveNumber) {
    return { status: "action_not_available", state };
  }
  const offer = state.teamUpgradeOffer;
  const card = offer?.cards.find(({ upgradeId }) => upgradeId === command.upgradeId);
  if (offer?.offerId !== command.offerId || card === undefined) {
    return { status: "action_not_available", state };
  }
  const previous = state.teamUpgradeVotes[command.role];
  if (previous !== null && command.revision <= previous.revision) {
    return { status: "stale_action", state };
  }
  return {
    status: "accepted",
    state: {
      ...state,
      teamUpgradeVotes: {
        ...state.teamUpgradeVotes,
        [command.role]: {
          role: command.role,
          upgradeId: command.upgradeId,
          revision: command.revision
        }
      }
    }
  };
}

export function advanceCombat(state: CombatStepState, config: CombatConfig): CombatStepResult {
  assertCombatResultInvariant(state);
  if (state.encounterPhase === "result") {
    return pickCombatResult(state);
  }
  if (state.encounterPhase === "intermission") {
    return advanceIntermission(state, config);
  }

  const secondsPerStep = config.fixedStepMs / 1000;
  let next = moveAndSpawnThreats(state, config, secondsPerStep);
  next = resolveFriendlyHits(next, config);
  next = resolveSpaceshipThreats(next, config);
  next = removeExpiredAndOutOfBounds(next, config);

  if (next.spaceshipHp <= 0) {
    return createTerminalCombatState(pickCombatResult(next), "defeat");
  }
  if (
    next.pendingSpawns.length === 0 &&
    next.enemies.length === 0 &&
    next.asteroids.every(({ origin }) => origin === "ambient")
  ) {
    const offerResult = createTeamUpgradeOffer(next.runSeed, next.waveNumber);
    return {
      ...pickCombatResult(next),
      encounterPhase: "intermission",
      outcome: null,
      defeatReason: null,
      encounterTick: 0,
      offerRngState: offerResult.rngState,
      teamUpgradeOffer: offerResult.offer,
      teamUpgradeVotes: { pilot: null, gunner: null, shield: null },
      teamUpgradeSelection: null,
      asteroids: [],
      hostileProjectiles: [],
      homingMissiles: [],
      projectiles: [],
      shieldActive: false,
      ambientAsteroidSpawnDueTick: null
    };
  }
  return { ...pickCombatResult(next), encounterTick: state.encounterTick + 1 };
}

function advanceIntermission(state: CombatStepState, config: CombatConfig): CombatStepResult {
  const encounterTick = state.encounterTick + 1;
  if (encounterTick < config.intermissionTicks) {
    return { ...pickCombatResult(state), encounterTick, shieldActive: false };
  }
  const selected = resolveTeamUpgrade(state);
  const waveNumber = Math.min(Number.MAX_SAFE_INTEGER, selected.waveNumber + 1);
  const wave = createWavePlan(config, selected.runSeed, waveNumber);
  const ambientSchedule = scheduleAmbientAsteroid(selected.ambientAsteroidRngState, 0, config);
  return {
    ...pickCombatResult({ ...state, ...selected }),
    encounterPhase: "combat",
    outcome: null,
    defeatReason: null,
    encounterTick: 0,
    waveNumber,
    spawnRngState: wave.rngState,
    ambientAsteroidRngState: ambientSchedule.rngState,
    ambientAsteroidSpawnDueTick: ambientSchedule.dueTick,
    pendingSpawns: wave.plan,
    nextWaveSpawnTick: 0,
    teamUpgradeOffer: null,
    teamUpgradeVotes: { pilot: null, gunner: null, shield: null },
    shieldActive: false,
    projectiles: [],
    hostileProjectiles: [],
    homingMissiles: []
  };
}

function resolveTeamUpgrade<TState extends CombatStateFields>(state: TState): TState {
  const offer = state.teamUpgradeOffer;
  if (offer === null) return state;
  const counts = new Map<UpgradeId, number>();
  for (const role of ROLES) {
    const vote = state.teamUpgradeVotes[role];
    if (vote !== null) counts.set(vote.upgradeId, (counts.get(vote.upgradeId) ?? 0) + 1);
  }
  let winner: UpgradeCard | undefined;
  let winningVotes = 0;
  for (const card of offer.cards) {
    const count = counts.get(card.upgradeId) ?? 0;
    if (count > winningVotes) {
      winner = card;
      winningVotes = count;
    }
  }
  if (winner === undefined || state.credits < winner.price) return state;
  return applyUpgrade(state, winner.role, offer.offerId, offer.waveNumber, winner.upgradeId);
}

function applyUpgrade<TState extends CombatStateFields>(
  state: TState,
  role: GameplayRole,
  offerId: string,
  waveNumber: number,
  upgradeId: UpgradeId
): TState {
  let spaceshipHp = state.spaceshipHp;
  let spaceshipMaxHp = state.spaceshipMaxHp;
  let roleModifiers = state.roleModifiers;
  switch (upgradeId) {
    case "pilot_speed":
      roleModifiers = {
        ...roleModifiers,
        pilot: {
          ...roleModifiers.pilot,
          speedMultiplier: roleModifiers.pilot.speedMultiplier + 0.1
        }
      };
      break;
    case "pilot_acceleration":
      roleModifiers = {
        ...roleModifiers,
        pilot: {
          ...roleModifiers.pilot,
          accelerationMultiplier: roleModifiers.pilot.accelerationMultiplier + 0.12
        }
      };
      break;
    case "pilot_hull":
      spaceshipMaxHp += 25;
      spaceshipHp = Math.min(spaceshipMaxHp, spaceshipHp + 25);
      roleModifiers = {
        ...roleModifiers,
        pilot: { ...roleModifiers.pilot, maxHpBonus: roleModifiers.pilot.maxHpBonus + 25 }
      };
      break;
    case "gunner_damage":
      roleModifiers = {
        ...roleModifiers,
        gunner: {
          ...roleModifiers.gunner,
          damageMultiplier: roleModifiers.gunner.damageMultiplier + 0.15
        }
      };
      break;
    case "gunner_cooldown":
      roleModifiers = {
        ...roleModifiers,
        gunner: {
          ...roleModifiers.gunner,
          cooldownMultiplier: Math.max(0.25, roleModifiers.gunner.cooldownMultiplier * 0.9)
        }
      };
      break;
    case "gunner_projectile_speed":
      roleModifiers = {
        ...roleModifiers,
        gunner: {
          ...roleModifiers.gunner,
          projectileSpeedMultiplier: roleModifiers.gunner.projectileSpeedMultiplier + 0.12
        }
      };
      break;
    case "shield_capacity":
      roleModifiers = {
        ...roleModifiers,
        shield: { ...roleModifiers.shield, capacityBonus: roleModifiers.shield.capacityBonus + 20 }
      };
      break;
    case "shield_recharge":
      roleModifiers = {
        ...roleModifiers,
        shield: {
          ...roleModifiers.shield,
          rechargeMultiplier: roleModifiers.shield.rechargeMultiplier + 0.15
        }
      };
      break;
    case "shield_arc":
      roleModifiers = {
        ...roleModifiers,
        shield: {
          ...roleModifiers.shield,
          arcWidthBonus: roleModifiers.shield.arcWidthBonus + Math.PI / 18
        }
      };
      break;
  }
  return {
    ...state,
    spaceshipHp,
    spaceshipMaxHp,
    roleModifiers,
    credits: state.credits - TEAM_UPGRADE_PRICE,
    teamUpgradeSelection: {
      offerId,
      waveNumber,
      upgradeId,
      role,
      price: TEAM_UPGRADE_PRICE
    }
  };
}

function moveAndSpawnThreats(
  state: CombatStepState,
  config: CombatConfig,
  secondsPerStep: number
): CombatStepState {
  const difficulty = getWaveDifficulty(config, state.waveNumber);
  let enemies = state.enemies.map((enemy) =>
    moveEnemy(enemy, state.spaceship, config, secondsPerStep)
  );
  let asteroids = state.asteroids.map((asteroid) => moveLinear(asteroid, secondsPerStep));
  let hostileProjectiles = state.hostileProjectiles.map((projectile) =>
    moveLinear(projectile, secondsPerStep)
  );
  let homingMissiles = state.homingMissiles.map((missile) =>
    moveMissile(missile, state.spaceship, secondsPerStep)
  );
  let nextSpawnSequence = state.nextSpawnSequence;
  let workingDynamicCount =
    enemies.length +
    asteroids.length +
    hostileProjectiles.length +
    homingMissiles.length +
    state.projectiles.length;

  for (const enemy of enemies) {
    if (enemy.attackCooldownTicks > 0) continue;
    const weapon = archetypeOf(config, enemy.kind).weapon;
    for (let shot = 0; shot < weapon.burstCount; shot += 1) {
      const aimOffset = burstAimOffset(weapon, shot);
      if (weapon.kind === "bullet") {
        if (
          !canAddEntity(config, "hostileProjectile", hostileProjectiles.length, workingDynamicCount)
        ) {
          break;
        }
        hostileProjectiles = [
          ...hostileProjectiles,
          createHostileBullet(
            enemy,
            state.spaceship,
            weapon,
            aimOffset,
            nextSpawnSequence,
            state.clock.tick
          )
        ];
      } else {
        if (!canAddEntity(config, "homingMissile", homingMissiles.length, workingDynamicCount)) {
          break;
        }
        homingMissiles = [
          ...homingMissiles,
          createMissile(
            enemy,
            state.spaceship,
            weapon,
            aimOffset,
            nextSpawnSequence,
            state.clock.tick
          )
        ];
      }
      nextSpawnSequence += 1;
      workingDynamicCount += 1;
    }
  }
  enemies = enemies.map((enemy) =>
    enemy.attackCooldownTicks > 0
      ? enemy
      : {
          ...enemy,
          attackCooldownTicks: Math.max(
            1,
            Math.ceil(
              archetypeOf(config, enemy.kind).weapon.cooldownTicks / difficulty.tempoMultiplier
            )
          )
        }
  );

  let pendingSpawns = state.pendingSpawns;
  let spawnRngState = state.spawnRngState;
  let nextWaveSpawnTick = state.nextWaveSpawnTick;
  if (pendingSpawns.length > 0 && state.encounterTick >= nextWaveSpawnTick) {
    const pending = pendingSpawns[0];
    if (
      pending !== undefined &&
      canSpawnKind(config, pending.kind, enemies, asteroids, workingDynamicCount) &&
      !(waitsForClearedWave(config, pending.kind) && hasLiveWaveThreats(enemies, asteroids))
    ) {
      const result = spawnEntity(
        pending.kind,
        "wave",
        spawnRngState,
        nextSpawnSequence,
        state.clock.tick,
        state.waveNumber,
        config,
        pending.sectors
      );
      spawnRngState = result.rngState;
      nextSpawnSequence += 1;
      pendingSpawns = pendingSpawns.slice(1);
      nextWaveSpawnTick = state.encounterTick + pending.spawnIntervalTicks;
      if (result.enemy !== null) enemies = [...enemies, result.enemy];
      if (result.asteroid !== null) asteroids = [...asteroids, result.asteroid];
      workingDynamicCount += 1;
    }
  }

  let ambientAsteroidRngState = state.ambientAsteroidRngState;
  let ambientAsteroidSpawnDueTick = state.ambientAsteroidSpawnDueTick;
  if (
    ambientAsteroidSpawnDueTick !== null &&
    state.encounterTick + 1 >= ambientAsteroidSpawnDueTick &&
    canSpawnKind(config, "asteroid", enemies, asteroids, workingDynamicCount)
  ) {
    const result = spawnEntity(
      "asteroid",
      "ambient",
      ambientAsteroidRngState,
      nextSpawnSequence,
      state.clock.tick,
      state.waveNumber,
      config,
      []
    );
    ambientAsteroidRngState = result.rngState;
    nextSpawnSequence += 1;
    if (result.asteroid !== null) asteroids = [...asteroids, result.asteroid];
    const schedule = scheduleAmbientAsteroid(
      ambientAsteroidRngState,
      state.encounterTick + 1,
      config
    );
    ambientAsteroidRngState = schedule.rngState;
    ambientAsteroidSpawnDueTick = schedule.dueTick;
  }

  return {
    ...state,
    enemies,
    asteroids,
    hostileProjectiles,
    homingMissiles,
    pendingSpawns,
    spawnRngState,
    nextWaveSpawnTick,
    ambientAsteroidRngState,
    ambientAsteroidSpawnDueTick,
    nextSpawnSequence
  };
}

function moveEnemy(
  enemy: CombatEnemyState,
  spaceship: { readonly x: number; readonly y: number },
  config: CombatConfig,
  secondsPerStep: number
): CombatEnemyState {
  const deltaX = spaceship.x - enemy.x;
  const deltaY = spaceship.y - enemy.y;
  const distance = Math.hypot(deltaX, deltaY) || 1;
  const archetype = archetypeOf(config, enemy.kind);
  const preferred = archetype.preferredDistance;
  const speed = archetype.speedPerSecond;
  const radial = distance > preferred + 30 ? 1 : distance < preferred - 30 ? -1 : 0;
  const orbit = radial === 0 ? (enemy.spawnSequence % 2 === 0 ? 0.35 : -0.35) : 0;
  const velocity = {
    x: ((deltaX / distance) * radial - (deltaY / distance) * orbit) * speed,
    y: ((deltaY / distance) * radial + (deltaX / distance) * orbit) * speed
  };
  const constrained = constrainMovingCircleToArena(
    {
      x: enemy.x + velocity.x * secondsPerStep,
      y: enemy.y + velocity.y * secondsPerStep,
      radius: enemy.radius,
      velocity
    },
    arenaFromConfig(config)
  );
  return {
    ...enemy,
    previousX: enemy.x,
    previousY: enemy.y,
    x: constrained.x,
    y: constrained.y,
    velocity: constrained.velocity,
    heading:
      constrained.velocity.x === 0 && constrained.velocity.y === 0
        ? enemy.heading
        : Math.atan2(constrained.velocity.y, constrained.velocity.x),
    attackCooldownTicks: Math.max(0, enemy.attackCooldownTicks - 1)
  };
}

function moveLinear<T extends MovingEntity>(entity: T, secondsPerStep: number): T {
  return {
    ...entity,
    previousX: entity.x,
    previousY: entity.y,
    x: entity.x + entity.velocity.x * secondsPerStep,
    y: entity.y + entity.velocity.y * secondsPerStep
  };
}

function moveMissile(
  missile: HomingMissileState,
  spaceship: { readonly x: number; readonly y: number },
  secondsPerStep: number
): HomingMissileState {
  const targetHeading = Math.atan2(spaceship.y - missile.y, spaceship.x - missile.x);
  const turn = clamp(
    shortestAngleDelta(missile.heading, targetHeading),
    -missile.turnRatePerSecond * secondsPerStep,
    missile.turnRatePerSecond * secondsPerStep
  );
  const heading = canonicalizeAngle(missile.heading + turn);
  const velocity = {
    x: Math.cos(heading) * missile.speedPerSecond,
    y: Math.sin(heading) * missile.speedPerSecond
  };
  return {
    ...missile,
    previousX: missile.x,
    previousY: missile.y,
    x: missile.x + velocity.x * secondsPerStep,
    y: missile.y + velocity.y * secondsPerStep,
    heading,
    velocity
  };
}

function burstAimOffset(weapon: EnemyWeaponTuning, shot: number): number {
  if (weapon.burstCount <= 1) return 0;
  const step = weapon.burstSpreadRadians / (weapon.burstCount - 1);
  return -weapon.burstSpreadRadians / 2 + step * shot;
}

function createHostileBullet(
  enemy: CombatEnemyState,
  spaceship: { readonly x: number; readonly y: number },
  weapon: EnemyWeaponTuning,
  aimOffset: number,
  spawnSequence: number,
  tick: number
): HostileProjectileState {
  const heading = Math.atan2(spaceship.y - enemy.y, spaceship.x - enemy.x) + aimOffset;
  return {
    id: `hostile-${String(spawnSequence)}`,
    spawnSequence,
    previousX: enemy.x,
    previousY: enemy.y,
    x: enemy.x,
    y: enemy.y,
    velocity: {
      x: Math.cos(heading) * weapon.projectileSpeedPerSecond,
      y: Math.sin(heading) * weapon.projectileSpeedPerSecond
    },
    radius: weapon.projectileRadius,
    spawnedTick: tick,
    damage: weapon.damage,
    shieldHitCost: weapon.shieldHitCost,
    lifetimeTicks: weapon.projectileLifetimeTicks
  };
}

function createMissile(
  enemy: CombatEnemyState,
  spaceship: { readonly x: number; readonly y: number },
  weapon: EnemyWeaponTuning,
  aimOffset: number,
  spawnSequence: number,
  tick: number
): HomingMissileState {
  const heading = canonicalizeAngle(
    Math.atan2(spaceship.y - enemy.y, spaceship.x - enemy.x) + aimOffset
  );
  return {
    id: `missile-${String(spawnSequence)}`,
    spawnSequence,
    previousX: enemy.x,
    previousY: enemy.y,
    x: enemy.x,
    y: enemy.y,
    velocity: {
      x: Math.cos(heading) * weapon.projectileSpeedPerSecond,
      y: Math.sin(heading) * weapon.projectileSpeedPerSecond
    },
    radius: weapon.projectileRadius,
    spawnedTick: tick,
    heading,
    damage: weapon.damage,
    shieldHitCost: weapon.shieldHitCost,
    lifetimeTicks: weapon.projectileLifetimeTicks,
    speedPerSecond: weapon.projectileSpeedPerSecond,
    turnRatePerSecond: weapon.turnRatePerSecond
  };
}

function sectorEntryAngle(
  sectors: readonly SpawnSector[],
  angleRandom: number,
  pickRandom: number
): number {
  if (sectors.length === 0) return angleRandom * Math.PI * 2;
  const pickedIndex = Math.min(sectors.length - 1, Math.floor(pickRandom * sectors.length));
  const sector = sectors[pickedIndex];
  if (sector === undefined) return angleRandom * Math.PI * 2;
  // Screen-space bearings: north points up, angles grow clockwise.
  const sectorWidth = Math.PI / 4;
  const sectorCenter = -Math.PI / 2 + SPAWN_SECTORS.indexOf(sector) * sectorWidth;
  return sectorCenter + (angleRandom - 0.5) * sectorWidth;
}

function spawnEntity(
  kind: SpawnKind,
  origin: "wave" | "ambient",
  initialRngState: number,
  spawnSequence: number,
  tick: number,
  waveNumber: number,
  config: CombatConfig,
  sectors: readonly SpawnSector[]
): {
  readonly rngState: number;
  readonly enemy: CombatEnemyState | null;
  readonly asteroid: AsteroidState | null;
} {
  let rngState = initialRngState;
  const values: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const [next, random] = nextUint32(rngState);
    rngState = next;
    values.push(random / UINT32_MAX);
  }
  // values[2] was already drawn and unused, so multi-sector picking costs no extra RNG.
  const entryAngle = sectorEntryAngle(sectors, values[0] ?? 0, values[2] ?? 0);
  const arena = arenaFromConfig(config);
  const difficulty = getWaveDifficulty(config, waveNumber);
  if (kind === "asteroid") {
    const point = pointOnCircle(arena, entryAngle, arena.radius);
    const exitOffset = ((values[1] ?? 0.5) * 2 - 1) * (Math.PI / 3);
    const target = pointOnCircle(arena, entryAngle + Math.PI + exitOffset, arena.radius);
    const direction = unitDirection(point.x, point.y, target.x, target.y);
    const hp = config.asteroidHp * difficulty.hpMultiplier;
    return {
      rngState,
      enemy: null,
      asteroid: {
        id: `asteroid-${String(spawnSequence)}`,
        spawnSequence,
        origin,
        previousX: point.x,
        previousY: point.y,
        x: point.x,
        y: point.y,
        velocity: {
          x: direction.x * config.asteroidSpeedPerSecond,
          y: direction.y * config.asteroidSpeedPerSecond
        },
        radius: config.asteroidRadius,
        spawnedTick: tick,
        hp,
        maxHp: hp,
        damage: config.asteroidDamage
      }
    };
  }
  const archetype = archetypeOf(config, kind);
  const entityRadius = archetype.radius;
  const point = pointOnCircle(arena, entryAngle, arena.radius - entityRadius);
  const hp = archetype.hp * difficulty.hpMultiplier;
  return {
    rngState,
    asteroid: null,
    enemy: {
      id: `${kind}-${String(spawnSequence)}`,
      spawnSequence,
      kind,
      previousX: point.x,
      previousY: point.y,
      x: point.x,
      y: point.y,
      velocity: { x: 0, y: 0 },
      heading: 0,
      radius: entityRadius,
      spawnedTick: tick,
      hp,
      maxHp: hp,
      attackCooldownTicks: Math.max(
        1,
        Math.ceil(archetype.weapon.cooldownTicks / difficulty.tempoMultiplier)
      )
    }
  };
}

interface CollisionCandidate {
  readonly timeOfImpact: number;
  readonly sourceSequence: number;
  readonly targetSequence: number;
  readonly sourceId: string;
  readonly targetId: string;
  readonly targetKind: "enemy" | "asteroid" | "missile";
}

function resolveFriendlyHits(state: CombatStepState, config: CombatConfig): CombatStepState {
  const targets: readonly (MovingEntity & {
    readonly kindForCollision: CollisionCandidate["targetKind"];
  })[] = [
    ...state.enemies.map((entity) => ({ ...entity, kindForCollision: "enemy" as const })),
    ...state.asteroids.map((entity) => ({ ...entity, kindForCollision: "asteroid" as const })),
    ...state.homingMissiles.map((entity) => ({ ...entity, kindForCollision: "missile" as const }))
  ];
  const grid = buildSpatialGrid(targets, config.spatialCellSize);
  const candidates: CollisionCandidate[] = [];
  for (const projectile of state.projectiles) {
    for (const target of querySpatialGrid(grid, projectile, config.spatialCellSize)) {
      const toi = relativeSweptCircleTime(projectile, target);
      if (toi !== null) {
        candidates.push({
          timeOfImpact: toi,
          sourceSequence: projectile.spawnSequence,
          targetSequence: target.spawnSequence,
          sourceId: projectile.id,
          targetId: target.id,
          targetKind: target.kindForCollision
        });
      }
    }
  }
  candidates.sort(compareCollision);
  const removedProjectiles = new Set<string>();
  const removedTargets = new Set<string>();
  const damage = new Map<string, number>();
  let score = state.score;
  let credits = state.credits;
  for (const candidate of candidates) {
    if (removedProjectiles.has(candidate.sourceId) || removedTargets.has(candidate.targetId))
      continue;
    const projectile = state.projectiles.find(({ id }) => id === candidate.sourceId);
    if (projectile === undefined) continue;
    removedProjectiles.add(candidate.sourceId);
    if (candidate.targetKind === "missile") {
      removedTargets.add(candidate.targetId);
      score += config.missileInterceptScoreReward;
      continue;
    }
    const existingDamage = damage.get(candidate.targetId) ?? 0;
    damage.set(candidate.targetId, existingDamage + projectile.damage);
    const target =
      candidate.targetKind === "enemy"
        ? state.enemies.find(({ id }) => id === candidate.targetId)
        : state.asteroids.find(({ id }) => id === candidate.targetId);
    if (target !== undefined && existingDamage + projectile.damage >= target.hp) {
      removedTargets.add(candidate.targetId);
      if (candidate.targetKind === "enemy") {
        const enemy = target as CombatEnemyState;
        const archetype = archetypeOf(config, enemy.kind);
        score += archetype.scoreReward;
        credits += archetype.creditReward;
      } else {
        score += config.asteroidScoreReward;
        const asteroid = target as AsteroidState;
        if (asteroid.origin === "wave") credits += config.asteroidCreditReward;
      }
    }
  }
  return {
    ...state,
    score,
    credits,
    projectiles: state.projectiles.filter(({ id }) => !removedProjectiles.has(id)),
    enemies: state.enemies
      .filter(({ id }) => !removedTargets.has(id))
      .map((enemy) => ({ ...enemy, hp: enemy.hp - (damage.get(enemy.id) ?? 0) })),
    asteroids: state.asteroids
      .filter(({ id }) => !removedTargets.has(id))
      .map((asteroid) => ({ ...asteroid, hp: asteroid.hp - (damage.get(asteroid.id) ?? 0) })),
    homingMissiles: state.homingMissiles.filter(({ id }) => !removedTargets.has(id))
  };
}

interface SpaceshipThreatCandidate {
  readonly timeOfImpact: number;
  readonly sourceSequence: number;
  readonly sourceId: string;
  readonly kind: "bullet" | "missile" | "asteroid";
  readonly shieldHitCost: number;
  readonly shieldHit: boolean;
}

function resolveSpaceshipThreats(state: CombatStepState, config: CombatConfig): CombatStepState {
  const threats: readonly (MovingEntity & {
    readonly threatKind: SpaceshipThreatCandidate["kind"];
    readonly damage: number;
    readonly shieldHitCost: number;
  })[] = [
    ...state.hostileProjectiles.map((entity) => ({ ...entity, threatKind: "bullet" as const })),
    ...state.homingMissiles.map((entity) => ({ ...entity, threatKind: "missile" as const })),
    ...state.asteroids.map((entity) => ({
      ...entity,
      threatKind: "asteroid" as const,
      shieldHitCost: config.asteroidShieldHitCost
    }))
  ];
  const spaceshipTarget: MovingEntity = {
    id: "spaceship",
    spawnSequence: 0,
    previousX: state.spaceship.previousX,
    previousY: state.spaceship.previousY,
    x: state.spaceship.x,
    y: state.spaceship.y,
    velocity: { x: 0, y: 0 },
    radius: state.spaceship.radius,
    spawnedTick: 0
  };
  const shieldTarget = { ...spaceshipTarget, radius: config.shieldRadius };
  const candidates: SpaceshipThreatCandidate[] = [];
  for (const threat of threats) {
    if (state.shieldActive) {
      const shieldToi = relativeSweptCircleTime(threat, shieldTarget);
      if (shieldToi !== null && isInsideShieldArc(threat, shieldToi, state, config)) {
        candidates.push({
          timeOfImpact: shieldToi,
          sourceSequence: threat.spawnSequence,
          sourceId: threat.id,
          kind: threat.threatKind,
          shieldHitCost: threat.shieldHitCost,
          shieldHit: true
        });
      }
    }
    const spaceshipToi = relativeSweptCircleTime(threat, spaceshipTarget);
    if (spaceshipToi !== null) {
      candidates.push({
        timeOfImpact: spaceshipToi,
        sourceSequence: threat.spawnSequence,
        sourceId: threat.id,
        kind: threat.threatKind,
        shieldHitCost: threat.shieldHitCost,
        shieldHit: false
      });
    }
  }
  candidates.sort(
    (a, b) =>
      a.timeOfImpact - b.timeOfImpact ||
      a.sourceSequence - b.sourceSequence ||
      Number(b.shieldHit) - Number(a.shieldHit)
  );
  const removed = new Set<string>();
  let shieldEnergy = state.shieldEnergy;
  let shieldActive = state.shieldActive;
  let shieldRearmRequired = state.shieldRearmRequired;
  let spaceshipHp = state.spaceshipHp;
  let score = state.score;
  let credits = state.credits;
  for (const candidate of candidates) {
    if (removed.has(candidate.sourceId)) continue;
    if (candidate.shieldHit && shieldActive) {
      const cost = candidate.shieldHitCost;
      if (shieldEnergy >= cost) {
        shieldEnergy -= cost;
        removed.add(candidate.sourceId);
        if (candidate.kind === "missile") score += config.missileInterceptScoreReward;
        if (candidate.kind === "asteroid") {
          score += config.asteroidScoreReward;
          const asteroid = state.asteroids.find(({ id }) => id === candidate.sourceId);
          if (asteroid?.origin === "wave") credits += config.asteroidCreditReward;
        }
        if (shieldEnergy === 0) {
          shieldActive = false;
          shieldRearmRequired = true;
        }
      } else {
        shieldEnergy = 0;
        shieldActive = false;
        shieldRearmRequired = true;
      }
      continue;
    }
    if (!candidate.shieldHit) {
      const threat = threats.find(({ id }) => id === candidate.sourceId);
      if (threat !== undefined) {
        spaceshipHp = Math.max(0, spaceshipHp - threat.damage);
        removed.add(candidate.sourceId);
      }
    }
  }
  return {
    ...state,
    spaceshipHp,
    score,
    credits,
    shieldEnergy,
    shieldActive,
    shieldRearmRequired,
    hostileProjectiles: state.hostileProjectiles.filter(({ id }) => !removed.has(id)),
    homingMissiles: state.homingMissiles.filter(({ id }) => !removed.has(id)),
    asteroids: state.asteroids.filter(({ id }) => !removed.has(id))
  };
}

function removeExpiredAndOutOfBounds(
  state: CombatStepState,
  config: CombatConfig
): CombatStepState {
  const arena = arenaFromConfig(config);
  const isInBounds = (entity: MovingEntity) =>
    isWithinCircularEnvelope(entity.x, entity.y, entity.radius, arena, config.worldPadding);
  return {
    ...state,
    asteroids: state.asteroids.filter(
      (entity) =>
        state.clock.tick - entity.spawnedTick < config.asteroidLifetimeTicks && isInBounds(entity)
    ),
    hostileProjectiles: state.hostileProjectiles.filter(
      (entity) => state.clock.tick - entity.spawnedTick < entity.lifetimeTicks && isInBounds(entity)
    ),
    homingMissiles: state.homingMissiles.filter(
      (entity) => state.clock.tick - entity.spawnedTick < entity.lifetimeTicks && isInBounds(entity)
    ),
    projectiles: state.projectiles.filter((entity) =>
      isWithinCircularEnvelope(entity.x, entity.y, entity.radius, arena, config.worldPadding)
    )
  };
}

export function relativeSweptCircleTime(source: MovingEntity, target: MovingEntity): number | null {
  const startX = source.previousX - target.previousX;
  const startY = source.previousY - target.previousY;
  const endX = source.x - target.x;
  const endY = source.y - target.y;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const radius = source.radius + target.radius;
  const c = startX * startX + startY * startY - radius * radius;
  if (c <= 0) return 0;
  const a = deltaX * deltaX + deltaY * deltaY;
  if (a === 0) return null;
  const b = 2 * (startX * deltaX + startY * deltaY);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const first = (-b - root) / (2 * a);
  const second = (-b + root) / (2 * a);
  if (first >= 0 && first <= 1) return first;
  if (second >= 0 && second <= 1) return second;
  return null;
}

interface GridTarget extends MovingEntity {
  readonly kindForCollision: CollisionCandidate["targetKind"];
}

export type SpatialGrid = ReadonlyMap<string, readonly GridTarget[]>;

export function buildSpatialGrid(targets: readonly GridTarget[], cellSize: number): SpatialGrid {
  const grid = new Map<string, GridTarget[]>();
  for (const target of [...targets].sort((a, b) => a.spawnSequence - b.spawnSequence)) {
    const minimumX = Math.floor((Math.min(target.previousX, target.x) - target.radius) / cellSize);
    const maximumX = Math.floor((Math.max(target.previousX, target.x) + target.radius) / cellSize);
    const minimumY = Math.floor((Math.min(target.previousY, target.y) - target.radius) / cellSize);
    const maximumY = Math.floor((Math.max(target.previousY, target.y) + target.radius) / cellSize);
    for (let x = minimumX; x <= maximumX; x += 1) {
      for (let y = minimumY; y <= maximumY; y += 1) {
        const key = `${String(x)}:${String(y)}`;
        const bucket = grid.get(key) ?? [];
        bucket.push(target);
        grid.set(key, bucket);
      }
    }
  }
  return grid;
}

function querySpatialGrid(
  grid: SpatialGrid,
  source: MovingEntity,
  cellSize: number
): readonly GridTarget[] {
  const minimumX = Math.floor((Math.min(source.previousX, source.x) - source.radius) / cellSize);
  const maximumX = Math.floor((Math.max(source.previousX, source.x) + source.radius) / cellSize);
  const minimumY = Math.floor((Math.min(source.previousY, source.y) - source.radius) / cellSize);
  const maximumY = Math.floor((Math.max(source.previousY, source.y) + source.radius) / cellSize);
  const unique = new Map<string, GridTarget>();
  for (let x = minimumX; x <= maximumX; x += 1) {
    for (let y = minimumY; y <= maximumY; y += 1) {
      for (const target of grid.get(`${String(x)}:${String(y)}`) ?? [])
        unique.set(target.id, target);
    }
  }
  return [...unique.values()].sort((a, b) => a.spawnSequence - b.spawnSequence);
}

function compareCollision(a: CollisionCandidate, b: CollisionCandidate): number {
  return (
    a.timeOfImpact - b.timeOfImpact ||
    a.sourceSequence - b.sourceSequence ||
    a.targetSequence - b.targetSequence
  );
}

function isInsideShieldArc(
  threat: MovingEntity,
  timeOfImpact: number,
  state: CombatStepState,
  config: CombatConfig
): boolean {
  const threatX = threat.previousX + (threat.x - threat.previousX) * timeOfImpact;
  const threatY = threat.previousY + (threat.y - threat.previousY) * timeOfImpact;
  const spaceshipX =
    state.spaceship.previousX + (state.spaceship.x - state.spaceship.previousX) * timeOfImpact;
  const spaceshipY =
    state.spaceship.previousY + (state.spaceship.y - state.spaceship.previousY) * timeOfImpact;
  const bearing = Math.atan2(threatY - spaceshipY, threatX - spaceshipX);
  const arc = Math.min(
    Math.PI * 2,
    config.shieldArcRadians + state.roleModifiers.shield.arcWidthBonus
  );
  return Math.abs(shortestAngleDelta(state.shieldAngle, bearing)) <= arc / 2;
}

function canSpawnKind(
  config: CombatConfig,
  kind: SpawnKind,
  enemies: readonly CombatEnemyState[],
  asteroids: readonly AsteroidState[],
  workingDynamicCount: number
): boolean {
  if (workingDynamicCount >= config.caps.dynamicEntities) return false;
  return kind === "asteroid"
    ? asteroids.length < config.caps.asteroids
    : enemies.length < config.caps.enemyShips;
}

function canAddEntity(
  config: CombatConfig,
  kind: "hostileProjectile" | "homingMissile",
  currentCount: number,
  workingDynamicCount: number
): boolean {
  if (workingDynamicCount >= config.caps.dynamicEntities) return false;
  return (
    currentCount <
    (kind === "hostileProjectile" ? config.caps.hostileProjectiles : config.caps.homingMissiles)
  );
}

export function dynamicEntityCount(state: {
  readonly enemies: readonly unknown[];
  readonly asteroids: readonly unknown[];
  readonly hostileProjectiles: readonly unknown[];
  readonly homingMissiles: readonly unknown[];
  readonly projectiles: readonly unknown[];
}): number {
  return (
    state.enemies.length +
    state.asteroids.length +
    state.hostileProjectiles.length +
    state.homingMissiles.length +
    state.projectiles.length
  );
}

function pickCombatResult(state: CombatStepState): CombatStepResult {
  return {
    runSeed: state.runSeed,
    spawnRngState: state.spawnRngState,
    offerRngState: state.offerRngState,
    ambientAsteroidRngState: state.ambientAsteroidRngState,
    ambientAsteroidSpawnDueTick: state.ambientAsteroidSpawnDueTick,
    spaceshipHp: state.spaceshipHp,
    spaceshipMaxHp: state.spaceshipMaxHp,
    encounterPhase: state.encounterPhase,
    outcome: state.outcome,
    defeatReason: state.defeatReason,
    waveNumber: state.waveNumber,
    encounterTick: state.encounterTick,
    score: state.score,
    credits: state.credits,
    nextWaveSpawnTick: state.nextWaveSpawnTick,
    nextSpawnSequence: state.nextSpawnSequence,
    pendingSpawns: state.pendingSpawns,
    enemies: state.enemies,
    asteroids: state.asteroids,
    hostileProjectiles: state.hostileProjectiles,
    homingMissiles: state.homingMissiles,
    roleModifiers: state.roleModifiers,
    teamUpgradeOffer: state.teamUpgradeOffer,
    teamUpgradeVotes: state.teamUpgradeVotes,
    teamUpgradeSelection: state.teamUpgradeSelection,
    shieldActive: state.shieldActive,
    shieldEnergy: state.shieldEnergy,
    shieldRearmRequired: state.shieldRearmRequired,
    projectiles: state.projectiles
  };
}

export function createTerminalCombatState<TState extends CombatStateFields>(
  state: TState,
  outcome: TerminalOutcome,
  defeatReason: DefeatReason = "spaceship_destroyed"
): TState {
  if (outcome === "defeat" && defeatReason === "spaceship_destroyed" && state.spaceshipHp > 0) {
    throw new RangeError("Destroyed spaceship defeat requires zero spaceship HP");
  }
  if (outcome === "defeat" && defeatReason === "wave_timeout" && state.spaceshipHp <= 0) {
    throw new RangeError("Wave timeout defeat requires positive spaceship HP");
  }
  if (outcome === "victory" && state.spaceshipHp <= 0) {
    throw new RangeError("Victory requires positive spaceship HP");
  }
  return {
    ...state,
    encounterPhase: "result",
    outcome,
    defeatReason: outcome === "defeat" ? defeatReason : null
  };
}

export function failWaveByTimeout<TState extends CombatStateFields>(state: TState): TState {
  if (state.encounterPhase !== "combat" || state.outcome !== null || state.spaceshipHp <= 0) {
    throw new RangeError("Wave timeout requires active combat with a living spaceship");
  }
  return createTerminalCombatState(state, "defeat", "wave_timeout");
}

export function assertCombatResultInvariant(
  state: Pick<CombatStateFields, "spaceshipHp" | "encounterPhase" | "outcome" | "defeatReason">
): void {
  if ((state.encounterPhase === "result") !== (state.outcome !== null)) {
    throw new RangeError("Only a terminal result requires an outcome");
  }
  if ((state.outcome === "defeat") !== (state.defeatReason !== null)) {
    throw new RangeError("Only defeat requires a defeat reason");
  }
  if (state.defeatReason === "spaceship_destroyed" && state.spaceshipHp !== 0) {
    throw new RangeError("Destroyed spaceship defeat requires zero spaceship HP");
  }
  if (state.defeatReason === "wave_timeout" && state.spaceshipHp <= 0) {
    throw new RangeError("Wave timeout defeat requires positive spaceship HP");
  }
  if (state.outcome === "victory" && state.spaceshipHp <= 0) {
    throw new RangeError("Victory requires positive spaceship HP");
  }
  if (state.outcome === null && state.spaceshipHp <= 0) {
    throw new RangeError("A non-terminal combat state requires positive spaceship HP");
  }
}

function unitDirection(fromX: number, fromY: number, toX: number, toY: number): Vector2 {
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  const length = Math.hypot(deltaX, deltaY) || 1;
  return { x: deltaX / length, y: deltaY / length };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function arenaFromConfig(config: CombatConfig): ArenaCircle {
  return {
    centerX: config.worldWidth / 2,
    centerY: config.worldHeight / 2,
    radius: config.arenaRadius
  };
}

function pointOnCircle(
  arena: ArenaCircle,
  angle: number,
  radius: number
): { readonly x: number; readonly y: number } {
  return {
    x: arena.centerX + Math.cos(angle) * radius,
    y: arena.centerY + Math.sin(angle) * radius
  };
}
