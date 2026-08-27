import {
  type CombatConfig,
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
export { ASTEROID_SPAWN_KIND, SPAWN_SECTORS } from "./combatTypes.ts";
export { TEAM_UPGRADE_PRICE } from "./combatConstants.ts";
export { getEnemyArchetype, validateCombatConfig, validateRunSeed } from "./combatValidation.ts";
export { deriveDomainSeed, nextUint32 } from "./rng.ts";
export { createTeamUpgradeOffer, voteForTeamUpgrade } from "./upgrades.ts";
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
