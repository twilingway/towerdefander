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
  type UpgradeId
} from "./combatTypes.ts";
import {
  AMBIENT_ASTEROID_DOMAIN,
  OFFER_DOMAIN,
  ROLES,
  TEAM_UPGRADE_PRICE
} from "./combatConstants.ts";
import { deriveDomainSeed } from "./rng.ts";
import { validateCombatConfig, validateRunSeed } from "./combatValidation.ts";
import { createWavePlan } from "./waveDirector.ts";
import { createTeamUpgradeOffer } from "./upgrades.ts";
import { UPGRADE_CATALOGUE } from "./upgradeCatalogue.ts";
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
  GunnerModifiers,
  HomingMissileState,
  HostileProjectileState,
  PendingSpawn,
  PilotModifiers,
  RoleModifiers,
  ShieldModifiers,
  SpawnKind,
  SpawnSector,
  TeamUpgradeOffer,
  TeamUpgradeSelection,
  TeamUpgradeVote,
  TeamUpgradeVotes,
  TerminalOutcome,
  TurretVisual,
  UpgradeCard,
  UpgradeId,
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
export { createTeamUpgradeOffer, voteForTeamUpgrade } from "./upgrades.ts";
export { UPGRADE_CATALOGUE, type UpgradeDefinition } from "./upgradeCatalogue.ts";
export { createWavePlan, getWaveDifficulty } from "./waveDirector.ts";
export { buildSpatialGrid, relativeSweptCircleTime, type SpatialGrid } from "./spatialGrid.ts";

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
    stalemateTicks: 0,
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
    const offerResult = createTeamUpgradeOffer(next.runSeed, next.waveNumber);
    return {
      ...pickCombatResult(next),
      encounterPhase: "intermission",
      outcome: null,
      defeatReason: null,
      encounterTick: 0,
      stalemateTicks: 0,
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
  const { roleModifiers, maxHpBonus } = UPGRADE_CATALOGUE[upgradeId].apply(state.roleModifiers);
  const spaceshipMaxHp = state.spaceshipMaxHp + maxHpBonus;
  return {
    ...state,
    // A hull upgrade repairs by what it adds; the others leave health alone.
    spaceshipHp: Math.min(spaceshipMaxHp, state.spaceshipHp + maxHpBonus),
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
    stalemateTicks: state.stalemateTicks,
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
