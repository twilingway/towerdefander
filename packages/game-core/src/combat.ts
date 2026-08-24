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
export type EnemyKind = "gunship" | "missileCarrier";
export type SpawnKind = EnemyKind | "asteroid";

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

export interface CombatConfig {
  readonly fixedStepMs: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly arenaRadius: number;
  readonly spaceshipMaxHp: number;
  readonly shieldRadius: number;
  readonly shieldArcRadians: number;
  readonly hostileBulletShieldHitCost: number;
  readonly missileShieldHitCost: number;
  readonly asteroidShieldHitCost: number;
  readonly hostileBulletDamage: number;
  readonly missileDamage: number;
  readonly asteroidDamage: number;
  readonly friendlyProjectileDamage: number;
  readonly enemySpawnIntervalTicks: number;
  readonly ambientAsteroidIntervalMinTicks: number;
  readonly ambientAsteroidIntervalMaxTicks: number;
  readonly intermissionTicks: number;
  readonly waveBaseBudget: number;
  readonly waveBudgetGrowth: number;
  readonly waveBudgetCap: number;
  readonly waveHpGrowth: number;
  readonly waveHpMultiplierCap: number;
  readonly waveTempoGrowth: number;
  readonly waveTempoMultiplierCap: number;
  readonly gunshipHp: number;
  readonly gunshipRadius: number;
  readonly gunshipSpeedPerSecond: number;
  readonly gunshipPreferredDistance: number;
  readonly gunshipFireCooldownTicks: number;
  readonly carrierHp: number;
  readonly carrierRadius: number;
  readonly carrierSpeedPerSecond: number;
  readonly carrierPreferredDistance: number;
  readonly carrierFireCooldownTicks: number;
  readonly asteroidHp: number;
  readonly asteroidRadius: number;
  readonly asteroidSpeedPerSecond: number;
  readonly asteroidLifetimeTicks: number;
  readonly hostileBulletRadius: number;
  readonly hostileBulletSpeedPerSecond: number;
  readonly hostileBulletLifetimeTicks: number;
  readonly missileRadius: number;
  readonly missileSpeedPerSecond: number;
  readonly missileTurnRatePerSecond: number;
  readonly missileLifetimeTicks: number;
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
  readonly label: string;
  readonly value: number;
}

export interface RoleUpgradeOffer {
  readonly offerId: string;
  readonly waveNumber: number;
  readonly role: GameplayRole;
  readonly cards: readonly UpgradeCard[];
}

export type RoleOffers = Readonly<Record<GameplayRole, RoleUpgradeOffer | null>>;
export interface RoleUpgradeSelection {
  readonly offerId: string;
  readonly upgradeId: UpgradeId;
  readonly role: GameplayRole;
  readonly source: "player" | "fallback";
}

export type RoleSelections = Readonly<Record<GameplayRole, RoleUpgradeSelection | null>>;

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
}

export interface HomingMissileState extends MovingEntity {
  readonly heading: number;
  readonly damage: number;
}

export interface PendingSpawn {
  readonly kind: SpawnKind;
  readonly planSequence: number;
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
  readonly nextSpawnSequence: number;
  readonly pendingSpawns: readonly PendingSpawn[];
  readonly enemies: readonly CombatEnemyState[];
  readonly asteroids: readonly AsteroidState[];
  readonly hostileProjectiles: readonly HostileProjectileState[];
  readonly homingMissiles: readonly HomingMissileState[];
  readonly roleModifiers: RoleModifiers;
  readonly roleOffers: RoleOffers;
  readonly roleSelections: RoleSelections;
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

export interface UpgradeSelectionCommand {
  readonly role: GameplayRole;
  readonly waveNumber: number;
  readonly offerId: string;
  readonly upgradeId: UpgradeId;
}

export interface UpgradeSelectionResult<TState extends CombatStateFields> {
  readonly status: "accepted" | "already_chosen" | "action_not_available";
  readonly state: TState;
}

const ROLES: readonly GameplayRole[] = ["pilot", "gunner", "shield"];
const UINT32_MAX = 0xffff_ffff;
const SPAWN_DOMAIN = 0x5350_4157;
const OFFER_DOMAIN = 0x4f46_4652;
const AMBIENT_ASTEROID_DOMAIN = 0x414d_4254;
const MAX_PUBLIC_TRANSIENT_PADDING = 256;

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
    ["waveBaseBudget", config.waveBaseBudget],
    ["waveBudgetGrowth", config.waveBudgetGrowth],
    ["waveBudgetCap", config.waveBudgetCap],
    ["gunshipFireCooldownTicks", config.gunshipFireCooldownTicks],
    ["carrierFireCooldownTicks", config.carrierFireCooldownTicks],
    ["asteroidLifetimeTicks", config.asteroidLifetimeTicks],
    ["hostileBulletLifetimeTicks", config.hostileBulletLifetimeTicks],
    ["missileLifetimeTicks", config.missileLifetimeTicks],
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
    ["hostileBulletShieldHitCost", config.hostileBulletShieldHitCost],
    ["missileShieldHitCost", config.missileShieldHitCost],
    ["asteroidShieldHitCost", config.asteroidShieldHitCost],
    ["hostileBulletDamage", config.hostileBulletDamage],
    ["missileDamage", config.missileDamage],
    ["asteroidDamage", config.asteroidDamage],
    ["friendlyProjectileDamage", config.friendlyProjectileDamage],
    ["waveHpGrowth", config.waveHpGrowth],
    ["waveHpMultiplierCap", config.waveHpMultiplierCap],
    ["waveTempoGrowth", config.waveTempoGrowth],
    ["waveTempoMultiplierCap", config.waveTempoMultiplierCap],
    ["gunshipHp", config.gunshipHp],
    ["gunshipRadius", config.gunshipRadius],
    ["gunshipSpeedPerSecond", config.gunshipSpeedPerSecond],
    ["gunshipPreferredDistance", config.gunshipPreferredDistance],
    ["carrierHp", config.carrierHp],
    ["carrierRadius", config.carrierRadius],
    ["carrierSpeedPerSecond", config.carrierSpeedPerSecond],
    ["carrierPreferredDistance", config.carrierPreferredDistance],
    ["asteroidHp", config.asteroidHp],
    ["asteroidRadius", config.asteroidRadius],
    ["asteroidSpeedPerSecond", config.asteroidSpeedPerSecond],
    ["hostileBulletRadius", config.hostileBulletRadius],
    ["hostileBulletSpeedPerSecond", config.hostileBulletSpeedPerSecond],
    ["missileRadius", config.missileRadius],
    ["missileSpeedPerSecond", config.missileSpeedPerSecond],
    ["missileTurnRatePerSecond", config.missileTurnRatePerSecond],
    ["worldPadding", config.worldPadding],
    ["spatialCellSize", config.spatialCellSize]
  ];
  for (const [name, value] of positiveFinite) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number`);
    }
  }
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
  if (config.gunshipRadius > config.arenaRadius || config.carrierRadius > config.arenaRadius) {
    throw new RangeError("enemy ship radii must fit inside the circular arena");
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

export function getWaveDifficulty(config: CombatConfig, waveNumber: number): WaveDifficulty {
  const waveOffset = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, waveNumber - 1));
  return {
    budget: Math.min(
      config.waveBudgetCap,
      config.waveBaseBudget + config.waveBudgetGrowth * waveOffset
    ),
    hpMultiplier: Math.min(config.waveHpMultiplierCap, 1 + config.waveHpGrowth * waveOffset),
    tempoMultiplier: Math.min(
      config.waveTempoMultiplierCap,
      1 + config.waveTempoGrowth * waveOffset
    )
  };
}

export function createWavePlan(
  config: CombatConfig,
  runSeed: number,
  waveNumber: number
): { readonly plan: readonly PendingSpawn[]; readonly rngState: number } {
  const difficulty = getWaveDifficulty(config, waveNumber);
  let remaining = difficulty.budget;
  let rngState = deriveDomainSeed(runSeed, waveNumber, SPAWN_DOMAIN);
  const kinds: SpawnKind[] = [];
  if (waveNumber >= 3 && remaining >= 4) {
    kinds.push("missileCarrier");
    remaining -= 4;
  }
  while (remaining > 0) {
    const [next, random] = nextUint32(rngState);
    rngState = next;
    const canAffordGunship = remaining >= 2;
    const kind: SpawnKind = canAffordGunship && random % 3 !== 0 ? "gunship" : "asteroid";
    kinds.push(kind);
    remaining -= kind === "gunship" ? 2 : 1;
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
  return {
    plan: kinds.map((kind, planSequence) => ({ kind, planSequence })),
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
    nextSpawnSequence: 1,
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
    roleOffers: { pilot: null, gunner: null, shield: null },
    roleSelections: { pilot: null, gunner: null, shield: null }
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

export function createRoleOffers(
  runSeed: number,
  waveNumber: number
): {
  readonly offers: RoleOffers;
  readonly rngState: number;
} {
  let rngState = deriveDomainSeed(runSeed, waveNumber, OFFER_DOMAIN);
  const pools: Readonly<Record<GameplayRole, readonly UpgradeCard[]>> = {
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
  const offers = {} as Record<GameplayRole, RoleUpgradeOffer>;
  for (const role of ROLES) {
    const cards = [...pools[role]];
    for (let index = cards.length - 1; index > 0; index -= 1) {
      const [next, random] = nextUint32(rngState);
      rngState = next;
      const swapIndex = random % (index + 1);
      const card = cards[index];
      const swap = cards[swapIndex];
      if (card !== undefined && swap !== undefined) {
        cards[index] = swap;
        cards[swapIndex] = card;
      }
    }
    offers[role] = { offerId: `offer-w${String(waveNumber)}-${role}`, waveNumber, role, cards };
  }
  return { offers, rngState };
}

export function chooseRoleUpgrade<TState extends CombatStateFields>(
  state: TState,
  command: UpgradeSelectionCommand
): UpgradeSelectionResult<TState> {
  if (state.encounterPhase !== "intermission" || command.waveNumber !== state.waveNumber) {
    return { status: "action_not_available", state };
  }
  if (state.roleSelections[command.role] !== null) {
    return { status: "already_chosen", state };
  }
  const offer = state.roleOffers[command.role];
  const card = offer?.cards.find(({ upgradeId }) => upgradeId === command.upgradeId);
  if (offer?.offerId !== command.offerId || card === undefined) {
    return { status: "action_not_available", state };
  }
  return {
    status: "accepted",
    state: applyUpgrade(state, command.role, offer.offerId, card.upgradeId, "player")
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
    const offerResult = createRoleOffers(next.runSeed, next.waveNumber);
    return {
      ...pickCombatResult(next),
      encounterPhase: "intermission",
      outcome: null,
      defeatReason: null,
      encounterTick: 0,
      offerRngState: offerResult.rngState,
      roleOffers: offerResult.offers,
      roleSelections: { pilot: null, gunner: null, shield: null },
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
  let selected: CombatStateFields = state;
  for (const role of ROLES) {
    if (selected.roleSelections[role] === null) {
      const card = selected.roleOffers[role]?.cards[0];
      const offer = selected.roleOffers[role];
      if (offer !== null && card !== undefined) {
        selected = applyUpgrade(selected, role, offer.offerId, card.upgradeId, "fallback");
      }
    }
  }
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
    roleOffers: { pilot: null, gunner: null, shield: null },
    shieldActive: false,
    projectiles: [],
    hostileProjectiles: [],
    homingMissiles: []
  };
}

function applyUpgrade<TState extends CombatStateFields>(
  state: TState,
  role: GameplayRole,
  offerId: string,
  upgradeId: UpgradeId,
  source: RoleUpgradeSelection["source"]
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
    roleSelections: {
      ...state.roleSelections,
      [role]: { offerId, upgradeId, role, source }
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
    moveMissile(missile, state.spaceship, config, secondsPerStep)
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
    if (enemy.kind === "gunship") {
      if (
        canAddEntity(config, "hostileProjectile", hostileProjectiles.length, workingDynamicCount)
      ) {
        hostileProjectiles = [
          ...hostileProjectiles,
          createHostileBullet(enemy, state.spaceship, config, nextSpawnSequence, state.clock.tick)
        ];
        nextSpawnSequence += 1;
        workingDynamicCount += 1;
      }
    } else if (canAddEntity(config, "homingMissile", homingMissiles.length, workingDynamicCount)) {
      homingMissiles = [
        ...homingMissiles,
        createMissile(enemy, state.spaceship, config, nextSpawnSequence, state.clock.tick)
      ];
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
              (enemy.kind === "gunship"
                ? config.gunshipFireCooldownTicks
                : config.carrierFireCooldownTicks) / difficulty.tempoMultiplier
            )
          )
        }
  );

  let pendingSpawns = state.pendingSpawns;
  let spawnRngState = state.spawnRngState;
  if (pendingSpawns.length > 0 && state.encounterTick % config.enemySpawnIntervalTicks === 0) {
    const pending = pendingSpawns[0];
    if (
      pending !== undefined &&
      canSpawnKind(config, pending.kind, enemies, asteroids, workingDynamicCount)
    ) {
      const result = spawnEntity(
        pending.kind,
        "wave",
        spawnRngState,
        nextSpawnSequence,
        state.clock.tick,
        state.waveNumber,
        config
      );
      spawnRngState = result.rngState;
      nextSpawnSequence += 1;
      pendingSpawns = pendingSpawns.slice(1);
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
      config
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
  const preferred =
    enemy.kind === "gunship" ? config.gunshipPreferredDistance : config.carrierPreferredDistance;
  const speed =
    enemy.kind === "gunship" ? config.gunshipSpeedPerSecond : config.carrierSpeedPerSecond;
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
  config: CombatConfig,
  secondsPerStep: number
): HomingMissileState {
  const targetHeading = Math.atan2(spaceship.y - missile.y, spaceship.x - missile.x);
  const turn = clamp(
    shortestAngleDelta(missile.heading, targetHeading),
    -config.missileTurnRatePerSecond * secondsPerStep,
    config.missileTurnRatePerSecond * secondsPerStep
  );
  const heading = canonicalizeAngle(missile.heading + turn);
  const velocity = {
    x: Math.cos(heading) * config.missileSpeedPerSecond,
    y: Math.sin(heading) * config.missileSpeedPerSecond
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

function createHostileBullet(
  enemy: CombatEnemyState,
  spaceship: { readonly x: number; readonly y: number },
  config: CombatConfig,
  spawnSequence: number,
  tick: number
): HostileProjectileState {
  const direction = unitDirection(enemy.x, enemy.y, spaceship.x, spaceship.y);
  return {
    id: `hostile-${String(spawnSequence)}`,
    spawnSequence,
    previousX: enemy.x,
    previousY: enemy.y,
    x: enemy.x,
    y: enemy.y,
    velocity: {
      x: direction.x * config.hostileBulletSpeedPerSecond,
      y: direction.y * config.hostileBulletSpeedPerSecond
    },
    radius: config.hostileBulletRadius,
    spawnedTick: tick,
    damage: config.hostileBulletDamage
  };
}

function createMissile(
  enemy: CombatEnemyState,
  spaceship: { readonly x: number; readonly y: number },
  config: CombatConfig,
  spawnSequence: number,
  tick: number
): HomingMissileState {
  const heading = Math.atan2(spaceship.y - enemy.y, spaceship.x - enemy.x);
  return {
    id: `missile-${String(spawnSequence)}`,
    spawnSequence,
    previousX: enemy.x,
    previousY: enemy.y,
    x: enemy.x,
    y: enemy.y,
    velocity: {
      x: Math.cos(heading) * config.missileSpeedPerSecond,
      y: Math.sin(heading) * config.missileSpeedPerSecond
    },
    radius: config.missileRadius,
    spawnedTick: tick,
    heading,
    damage: config.missileDamage
  };
}

function spawnEntity(
  kind: SpawnKind,
  origin: "wave" | "ambient",
  initialRngState: number,
  spawnSequence: number,
  tick: number,
  waveNumber: number,
  config: CombatConfig
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
  const entryAngle = (values[0] ?? 0) * Math.PI * 2;
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
  const isGunship = kind === "gunship";
  const entityRadius = isGunship ? config.gunshipRadius : config.carrierRadius;
  const point = pointOnCircle(arena, entryAngle, arena.radius - entityRadius);
  const hp = (isGunship ? config.gunshipHp : config.carrierHp) * difficulty.hpMultiplier;
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
        Math.ceil(
          (isGunship ? config.gunshipFireCooldownTicks : config.carrierFireCooldownTicks) /
            difficulty.tempoMultiplier
        )
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
  for (const candidate of candidates) {
    if (removedProjectiles.has(candidate.sourceId) || removedTargets.has(candidate.targetId))
      continue;
    const projectile = state.projectiles.find(({ id }) => id === candidate.sourceId);
    if (projectile === undefined) continue;
    removedProjectiles.add(candidate.sourceId);
    if (candidate.targetKind === "missile") {
      removedTargets.add(candidate.targetId);
      score += 5;
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
      score += candidate.targetKind === "enemy" ? 25 : 10;
    }
  }
  return {
    ...state,
    score,
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
  readonly shieldHit: boolean;
}

function resolveSpaceshipThreats(state: CombatStepState, config: CombatConfig): CombatStepState {
  const threats: readonly (MovingEntity & {
    readonly threatKind: SpaceshipThreatCandidate["kind"];
    readonly damage: number;
  })[] = [
    ...state.hostileProjectiles.map((entity) => ({ ...entity, threatKind: "bullet" as const })),
    ...state.homingMissiles.map((entity) => ({ ...entity, threatKind: "missile" as const })),
    ...state.asteroids.map((entity) => ({ ...entity, threatKind: "asteroid" as const }))
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
  for (const candidate of candidates) {
    if (removed.has(candidate.sourceId)) continue;
    if (candidate.shieldHit && shieldActive) {
      const cost = shieldHitCost(candidate.kind, config);
      if (shieldEnergy >= cost) {
        shieldEnergy -= cost;
        removed.add(candidate.sourceId);
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
      (entity) =>
        state.clock.tick - entity.spawnedTick < config.hostileBulletLifetimeTicks &&
        isInBounds(entity)
    ),
    homingMissiles: state.homingMissiles.filter(
      (entity) =>
        state.clock.tick - entity.spawnedTick < config.missileLifetimeTicks && isInBounds(entity)
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

function shieldHitCost(kind: SpaceshipThreatCandidate["kind"], config: CombatConfig): number {
  if (kind === "missile") return config.missileShieldHitCost;
  if (kind === "asteroid") return config.asteroidShieldHitCost;
  return config.hostileBulletShieldHitCost;
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
    nextSpawnSequence: state.nextSpawnSequence,
    pendingSpawns: state.pendingSpawns,
    enemies: state.enemies,
    asteroids: state.asteroids,
    hostileProjectiles: state.hostileProjectiles,
    homingMissiles: state.homingMissiles,
    roleModifiers: state.roleModifiers,
    roleOffers: state.roleOffers,
    roleSelections: state.roleSelections,
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
