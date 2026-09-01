import {
  type CombatConfig,
  type CombatEnemyState,
  type CombatStateFields,
  type CombatStepResult,
  type CombatStepState,
  type DefeatReason,
  type GameplayRole,
  type TerminalOutcome,
  type UpgradeCard,
  type ModuleId
} from "./combatTypes.ts";
import {
  AMBIENT_ASTEROID_DOMAIN,
  LOOT_DOMAIN,
  ROLES,
  TEAM_UPGRADE_PRICE
} from "./combatConstants.ts";
import { computeShipStats, shipStatsFromConfig, type ShipStats } from "./shipStats.ts";
import { deriveDomainSeed } from "./rng.ts";
import { validateCombatConfig, validateRunSeed } from "./combatValidation.ts";
import { createWavePlan } from "./waveDirector.ts";
import { createTeamUpgradeOffer } from "./upgrades.ts";
import { addRunStats, createRunStats } from "./runStats.ts";
import { advanceLootDrops, openOrTickLootWindow } from "./loot.ts";
import { effectsOf } from "./upgradeCatalogue.ts";
import { moveAndSpawnThreats } from "./threats.ts";
import { scheduleAmbientAsteroid } from "./spawning.ts";
import {
  removeExpiredAndOutOfBounds,
  resolveFriendlyHits,
  resolveSpaceshipThreats
} from "./collisions.ts";

export type {
  AsteroidState,
  CombatCaps,
  CombatConfig,
  CombatEnemyState,
  CombatStateFields,
  CombatStepResult,
  CombatStepState,
  DefeatReason,
  DirectorTuning,
  EncounterPhase,
  EnemyArchetype,
  EnemyKind,
  EnemySkillLevel,
  EnemySkillProfile,
  EnemySkillTuning,
  EnemySpawnPolicy,
  EnemyVisual,
  EnemyWeaponKind,
  EnemyWeaponTuning,
  EntityVisual,
  FriendlyProjectileLike,
  GameplayRole,
  HomingMissileState,
  HostileProjectileState,
  LootDropState,
  LootKind,
  PendingSpawn,
  SpawnKind,
  SpawnSector,
  TeamUpgradeOffer,
  TeamUpgradeSelection,
  TeamUpgradeVote,
  TeamUpgradeVotes,
  TerminalOutcome,
  TurretVisual,
  UpgradeCard,
  ModuleId,
  ShipModuleDefinition,
  UpgradeVoteCommand,
  UpgradeVoteResult,
  WaveCampaign,
  WaveDefinition,
  WaveDifficulty,
  WaveSpawnEntry
} from "./combatTypes.ts";
export { ASTEROID_SPAWN_KIND, ENEMY_SKILL_LEVELS, SPAWN_SECTORS } from "./combatTypes.ts";
export { resolveEnemySkill } from "./enemySkill.ts";
export { TEAM_UPGRADE_PRICE } from "./combatConstants.ts";
export { getEnemyArchetype, validateCombatConfig, validateRunSeed } from "./combatValidation.ts";
export { deriveDomainSeed, nextUint32 } from "./rng.ts";
export { availableTierIndex, createTeamUpgradeOffer, voteForTeamUpgrade } from "./upgrades.ts";
export { effectsOf, findModule } from "./upgradeCatalogue.ts";
export { DEFAULT_ENDLESS_TIER, DEFAULT_MODULE_TIERS } from "./moduleTree.ts";
export { createRunStats, damageTaken, type CombatRunStats, type ThreatClass } from "./runStats.ts";
export { createWavePlan, getWaveDifficulty } from "./waveDirector.ts";
export { buildSpatialGrid, relativeSweptCircleTime, type SpatialGrid } from "./spatialGrid.ts";
export {
  computeShipStats,
  MODULE_TARGET_FIELDS,
  MODULE_TARGET_EXCLUSIONS,
  SHIP_STAT_FIELDS,
  SHIP_STAT_OPS,
  shipStatsFromConfig,
  type ModuleTargetField,
  type ShipStatEffect,
  type ShipStatField,
  type ShipStatOp,
  type ShipStats
} from "./shipStats.ts";

/**
 * `startWave` exists for testing a late wave without playing the ones before
 * it. The run is otherwise clean — no credits and no upgrades — so a crew
 * dropped straight onto wave five is weaker than one that fought its way there.
 */
export function createInitialCombatState(
  config: CombatConfig & ShipStats,
  runSeed: number,
  startWave = 1
): CombatStateFields {
  validateCombatConfig(config);
  validateRunSeed(runSeed);
  if (!Number.isSafeInteger(startWave) || startWave < 1) {
    throw new RangeError("startWave must be a positive safe integer");
  }
  const { plan, rngState } = createWavePlan(config, runSeed, startWave);
  const ambientSchedule = scheduleAmbientAsteroid(
    deriveDomainSeed(runSeed, startWave, AMBIENT_ASTEROID_DOMAIN),
    0,
    config
  );
  return {
    runSeed,
    spawnRngState: rngState,
    ambientAsteroidRngState: ambientSchedule.rngState,
    lootRngState: deriveDomainSeed(runSeed, startWave, LOOT_DOMAIN),
    ambientAsteroidSpawnDueTick: ambientSchedule.dueTick,
    spaceshipHp: config.spaceshipMaxHp,
    encounterPhase: "combat",
    outcome: null,
    defeatReason: null,
    waveNumber: startWave,
    encounterTick: 0,
    stalemateTicks: 0,
    score: 0,
    credits: 0,
    nextSpawnSequence: 1,
    pendingSpawns: plan,
    enemies: [],
    asteroids: [],
    lootDrops: [],
    lootWindowTicksRemaining: 0,
    laserBeams: [],
    ship: computeShipStats(shipStatsFromConfig(config), []),
    purchasedModules: [],
    hostileProjectiles: [],
    homingMissiles: [],
    teamUpgradeOffer: null,
    teamUpgradeVotes: { pilot: null, gunner: null, shield: null },
    teamUpgradeSelection: null,
    runStats: createRunStats()
  };
}

export function advanceCombat(
  state: CombatStepState,
  config: CombatConfig & ShipStats
): CombatStepResult {
  assertCombatResultInvariant(state);
  if (state.encounterPhase === "result") {
    return pickCombatResult(state);
  }
  if (state.encounterPhase === "intermission") {
    return advanceIntermission(state, config);
  }

  const secondsPerStep = config.fixedStepMs / 1000;
  let next = moveAndSpawnThreats(state, config, secondsPerStep);
  // Salvage moves and is caught before this tick's kills drop more, so a drop
  // spends its first tick where the enemy died instead of jumping.
  const salvage = advanceLootDrops(next, config, secondsPerStep, next.ship.shieldCapacity);
  next = {
    ...next,
    lootDrops: salvage.lootDrops,
    spaceshipHp: salvage.spaceshipHp,
    shieldEnergy: salvage.shieldEnergy
  };
  next = resolveFriendlyHits(next, config);
  next = resolveSpaceshipThreats(next, config);
  next = removeExpiredAndOutOfBounds(next, config);
  // Reset the moment either side draws blood: the press exists for the fight
  // that produces nothing, not for the one that is merely slow.
  const traded =
    next.spaceshipHp < state.spaceshipHp || enemiesWereHurt(state.enemies, next.enemies);
  next = { ...next, stalemateTicks: traded ? 0 : state.stalemateTicks + 1 };

  if (next.spaceshipHp <= 0) {
    return createTerminalCombatState(pickCombatResult(next), "defeat");
  }
  if (
    next.pendingSpawns.length === 0 &&
    next.enemies.length === 0 &&
    next.asteroids.every(({ origin }) => origin === "ambient")
  ) {
    // The wave is won, but it does not end while there is salvage to fly to.
    const lootWindow = openOrTickLootWindow(state, next, config, next.clock.tick);
    if (lootWindow !== null) {
      return {
        ...pickCombatResult({ ...next, ...lootWindow }),
        // The shooters are dead, so their shots die with them, exactly as they
        // did when the wave ended on this tick. The window is for collecting,
        // not for eating the last volley and the missiles still chasing.
        hostileProjectiles: [],
        homingMissiles: [],
        encounterTick: state.encounterTick + 1
      };
    }
    const offer = createTeamUpgradeOffer(
      config.moduleTiers,
      config.endlessTier,
      next.purchasedModules.length,
      next.waveNumber
    );
    return {
      ...pickCombatResult(next),
      encounterPhase: "intermission",
      outcome: null,
      defeatReason: null,
      encounterTick: 0,
      stalemateTicks: 0,
      teamUpgradeOffer: offer,
      teamUpgradeVotes: { pilot: null, gunner: null, shield: null },
      teamUpgradeSelection: null,
      asteroids: [],
      lootDrops: [],
      lootWindowTicksRemaining: 0,
      laserBeams: [],
      hostileProjectiles: [],
      homingMissiles: [],
      projectiles: [],
      shieldActive: false,
      ambientAsteroidSpawnDueTick: null
    };
  }
  return { ...pickCombatResult(next), encounterTick: state.encounterTick + 1 };
}

/**
 * An enemy only ever leaves the arena by dying, so a missing id counts as a
 * hit the same way a lower hit-point total does.
 */
function enemiesWereHurt(
  before: readonly CombatEnemyState[],
  after: readonly CombatEnemyState[]
): boolean {
  const remaining = new Map(after.map((enemy) => [enemy.id, enemy.hp]));
  for (const enemy of before) {
    const hp = remaining.get(enemy.id);
    if (hp === undefined || hp < enemy.hp) return true;
  }
  return false;
}

function advanceIntermission(
  state: CombatStepState,
  config: CombatConfig & ShipStats
): CombatStepResult {
  const encounterTick = state.encounterTick + 1;
  if (encounterTick < config.intermissionTicks) {
    return { ...pickCombatResult(state), encounterTick, shieldActive: false };
  }
  const selected = resolveTeamUpgrade(state, config);
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
    lootRngState: deriveDomainSeed(selected.runSeed, waveNumber, LOOT_DOMAIN),
    ambientAsteroidSpawnDueTick: ambientSchedule.dueTick,
    pendingSpawns: wave.plan,
    teamUpgradeOffer: null,
    teamUpgradeVotes: { pilot: null, gunner: null, shield: null },
    shieldActive: false,
    projectiles: [],
    hostileProjectiles: [],
    homingMissiles: []
  };
}

function resolveTeamUpgrade<TState extends CombatStepState>(
  state: TState,
  config: CombatConfig & ShipStats
): TState {
  const offer = state.teamUpgradeOffer;
  if (offer === null) return state;
  const counts = new Map<ModuleId, number>();
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
  return applyUpgrade(
    state,
    config,
    winner.role,
    offer.offerId,
    offer.waveNumber,
    winner.upgradeId
  );
}

function applyUpgrade<TState extends CombatStepState>(
  state: TState,
  config: CombatConfig & ShipStats,
  role: GameplayRole,
  offerId: string,
  waveNumber: number,
  upgradeId: ModuleId
): TState {
  const purchasedModules = [...state.purchasedModules, upgradeId];
  // From the run's base and everything bought, never from the previous result,
  // so the same set of modules always makes the same ship.
  const ship = computeShipStats(
    shipStatsFromConfig(config),
    effectsOf(purchasedModules, config.moduleTiers, config.endlessTier)
  );
  // A maximum that grows repairs by exactly what it added; one that shrinks
  // trims the current value instead of killing the crew. Same for the battery.
  const hullDelta = ship.spaceshipMaxHp - state.ship.spaceshipMaxHp;
  return {
    ...state,
    spaceshipHp:
      hullDelta > 0
        ? Math.min(ship.spaceshipMaxHp, state.spaceshipHp + hullDelta)
        : Math.min(state.spaceshipHp, ship.spaceshipMaxHp),
    shieldEnergy: Math.min(state.shieldEnergy, ship.shieldCapacity),
    ship,
    purchasedModules,
    credits: state.credits - TEAM_UPGRADE_PRICE,
    runStats: addRunStats(state.runStats, { creditsSpent: TEAM_UPGRADE_PRICE }),
    teamUpgradeSelection: {
      offerId,
      waveNumber,
      upgradeId,
      role,
      price: TEAM_UPGRADE_PRICE
    }
  };
}

export function dynamicEntityCount(state: {
  readonly enemies: readonly unknown[];
  readonly asteroids: readonly unknown[];
  readonly lootDrops: readonly unknown[];
  readonly hostileProjectiles: readonly unknown[];
  readonly homingMissiles: readonly unknown[];
  readonly projectiles: readonly unknown[];
}): number {
  return (
    state.enemies.length +
    state.asteroids.length +
    state.lootDrops.length +
    state.hostileProjectiles.length +
    state.homingMissiles.length +
    state.projectiles.length
  );
}

function pickCombatResult(state: CombatStepState): CombatStepResult {
  return {
    runSeed: state.runSeed,
    spawnRngState: state.spawnRngState,
    ambientAsteroidRngState: state.ambientAsteroidRngState,
    lootRngState: state.lootRngState,
    ambientAsteroidSpawnDueTick: state.ambientAsteroidSpawnDueTick,
    spaceshipHp: state.spaceshipHp,
    encounterPhase: state.encounterPhase,
    outcome: state.outcome,
    defeatReason: state.defeatReason,
    waveNumber: state.waveNumber,
    encounterTick: state.encounterTick,
    stalemateTicks: state.stalemateTicks,
    score: state.score,
    credits: state.credits,
    nextSpawnSequence: state.nextSpawnSequence,
    pendingSpawns: state.pendingSpawns,
    enemies: state.enemies,
    asteroids: state.asteroids,
    lootDrops: state.lootDrops,
    lootWindowTicksRemaining: state.lootWindowTicksRemaining,
    laserBeams: state.laserBeams,
    ship: state.ship,
    purchasedModules: state.purchasedModules,
    hostileProjectiles: state.hostileProjectiles,
    homingMissiles: state.homingMissiles,
    teamUpgradeOffer: state.teamUpgradeOffer,
    teamUpgradeVotes: state.teamUpgradeVotes,
    teamUpgradeSelection: state.teamUpgradeSelection,
    // This whitelist silently drops anything it does not name, so a counter
    // missing here reads zero forever without failing a single existing test.
    runStats: state.runStats,
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
