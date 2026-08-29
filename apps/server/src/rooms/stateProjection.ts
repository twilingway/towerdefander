import { ARENA_CUSHION_BAND } from "@spaceship-defender/game-core";
import type {
  AsteroidState as CoreAsteroidState,
  CombatEnemyState,
  EntityVisual,
  HomingMissileState as CoreHomingMissileState,
  HostileProjectileState,
  ProjectileState as CoreProjectileState,
  RoleModifiers,
  SpaceshipSimulationConfig,
  SpaceshipSimulationState,
  TeamUpgradeOffer,
  TeamUpgradeSelection,
  TeamUpgradeVote
} from "@spaceship-defender/game-core";

import { CREW_ROLES, type CrewRole } from "@spaceship-defender/protocol";

import {
  AsteroidState,
  EnemyState,
  HomingMissileState,
  ProjectileState,
  UpgradeCardState,
  UpgradeVoteState,
  type SpaceshipDefenderState,
  type SpaceshipGameState
} from "./SpaceshipDefenderState.js";

/**
 * Mirrors one simulation frame into the Colyseus schema. Kept out of the room so
 * the class stays about lifecycle and commands: this is a pure projection from
 * core state plus config onto the wire representation.
 */
export function projectGameState(
  target: SpaceshipGameState,
  game: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig,
  waveDeadlineAtMs: number | undefined
): void {
  target.tick = game.clock.tick;
  target.elapsedMs = game.clock.elapsedMs;
  target.worldWidth = config.worldWidth;
  target.worldHeight = config.worldHeight;
  target.arenaRadius = config.arenaRadius;
  target.rimBandWidth = ARENA_CUSHION_BAND;
  target.display.cameraViewWidth = config.cameraViewWidth;
  target.display.backgroundParallaxStrength = config.background.parallaxStrength;
  target.display.backgroundDriftSpeed = config.background.driftSpeed;
  target.display.backgroundNebulaAlpha = config.background.nebulaAlpha;
  target.display.backgroundNebulaPreset = config.background.nebulaPreset;
  target.spaceship.x = game.spaceship.x;
  target.spaceship.y = game.spaceship.y;
  target.spaceship.velocityX = game.spaceship.velocity.x;
  target.spaceship.velocityY = game.spaceship.velocity.y;
  target.spaceship.radius = config.spaceshipRadius;
  target.spaceship.hp = game.spaceshipHp;
  target.spaceship.maxHp = game.spaceshipMaxHp;
  target.spaceship.heading = game.spaceshipHeading;
  target.turretAngle = game.turretAngle;
  target.shield.angle = game.shieldAngle;
  target.shield.active = game.shieldActive;
  target.shield.energy = game.shieldEnergy;
  target.shield.capacity = config.shieldCapacity + game.roleModifiers.shield.capacityBonus;
  target.shield.arcHalfAngle =
    Math.min(Math.PI * 2, config.shieldArcRadians + game.roleModifiers.shield.arcWidthBonus) / 2;
  target.cannon.heat = game.cannonHeat;
  target.cannon.capacity = config.cannonHeatCapacity;
  target.cannon.overheated = game.cannonOverheated;
  target.machineGun.heat = game.mgHeat;
  target.machineGun.capacity = config.mgHeatCapacity;
  target.machineGun.overheated = game.mgOverheated;
  target.encounter.phase = game.encounterPhase;
  target.encounter.hasOutcome = game.outcome !== null;
  target.encounter.outcome = game.outcome ?? "defeat";
  target.encounter.hasDefeatReason = game.defeatReason !== null;
  target.encounter.defeatReason = game.defeatReason ?? "spaceship_destroyed";
  target.encounter.waveNumber = game.waveNumber;
  target.encounter.encounterTick = game.encounterTick;
  target.encounter.phaseTicksRemaining =
    game.encounterPhase === "intermission"
      ? Math.max(0, config.intermissionTicks - game.encounterTick)
      : 0;
  target.encounter.waveSecondsRemaining =
    game.encounterPhase === "combat" && waveDeadlineAtMs !== undefined
      ? Math.max(1, Math.ceil((waveDeadlineAtMs - Date.now()) / 1_000))
      : 0;
  target.encounter.score = game.score;
  target.credits = game.credits;
  syncRoleModifiers(target.roleModifiers, game.roleModifiers);

  reconcileKeyed(target.display.enemyShips, game.enemies, () => new EnemyState(), syncEnemy);
  reconcileKeyed(target.display.asteroids, game.asteroids, () => new AsteroidState(), syncAsteroid);
  reconcileKeyed(
    target.display.friendlyProjectiles,
    game.projectiles,
    () => new ProjectileState(),
    (state, projectile) => {
      // Each barrel gets its own look, so a burst reads as two weapons.
      syncProjectile(
        state,
        projectile,
        "friendly",
        projectile.source === "machineGun" ? config.mgProjectileVisual : config.projectileVisual
      );
    }
  );
  reconcileKeyed(
    target.display.hostileProjectiles,
    game.hostileProjectiles,
    () => new ProjectileState(),
    (state, projectile) => {
      syncProjectile(state, projectile, "hostile");
    }
  );
  reconcileKeyed(
    target.display.homingMissiles,
    game.homingMissiles,
    () => new HomingMissileState(),
    syncHomingMissile
  );
  syncTeamUpgrade(
    target.teamUpgrade,
    game.teamUpgradeOffer,
    game.teamUpgradeVotes,
    game.teamUpgradeSelection
  );
}

interface KeyedSchemaCollection<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): unknown;
  delete(key: string): boolean;
  keys(): IterableIterator<string>;
}

function reconcileKeyed<TCore extends { readonly id: string }, TState>(
  target: KeyedSchemaCollection<TState>,
  source: readonly TCore[],
  create: () => TState,
  update: (target: TState, source: TCore) => void
): void {
  const liveIds = new Set(source.map(({ id }) => id));
  for (const entityId of [...target.keys()]) {
    if (!liveIds.has(entityId)) target.delete(entityId);
  }
  for (const entity of source) {
    let state = target.get(entity.id);
    if (state === undefined) {
      state = create();
      target.set(entity.id, state);
    }
    update(state, entity);
  }
}

function syncRoleModifiers(
  target: SpaceshipDefenderState["game"]["roleModifiers"],
  source: RoleModifiers
) {
  target.pilot.speedMultiplier = source.pilot.speedMultiplier;
  target.pilot.accelerationMultiplier = source.pilot.accelerationMultiplier;
  target.pilot.maxHpBonus = source.pilot.maxHpBonus;
  target.gunner.damageMultiplier = source.gunner.damageMultiplier;
  target.gunner.cooldownMultiplier = source.gunner.cooldownMultiplier;
  target.gunner.projectileSpeedMultiplier = source.gunner.projectileSpeedMultiplier;
  target.shield.capacityBonus = source.shield.capacityBonus;
  target.shield.rechargeMultiplier = source.shield.rechargeMultiplier;
  target.shield.arcWidthBonus = source.shield.arcWidthBonus;
}

function syncEnemy(target: EnemyState, source: CombatEnemyState): void {
  target.entityId = source.id;
  target.spawnSequence = source.spawnSequence;
  target.kind = source.kind;
  target.x = source.x;
  target.y = source.y;
  target.velocityX = source.velocity.x;
  target.velocityY = source.velocity.y;
  target.radius = source.radius;
  target.heading = source.heading;
  target.hp = source.hp;
  target.maxHp = source.maxHp;
}

function syncAsteroid(target: AsteroidState, source: CoreAsteroidState): void {
  target.entityId = source.id;
  target.origin = source.origin;
  target.spawnSequence = source.spawnSequence;
  target.x = source.x;
  target.y = source.y;
  target.velocityX = source.velocity.x;
  target.velocityY = source.velocity.y;
  target.radius = source.radius;
  target.hp = source.hp;
  target.maxHp = source.maxHp;
}

function syncProjectile(
  target: ProjectileState,
  source: CoreProjectileState | HostileProjectileState,
  kind: "friendly" | "hostile",
  friendlyVisual: EntityVisual | null = null
): void {
  target.entityId = source.id;
  target.spawnSequence = source.spawnSequence;
  target.kind = kind;
  target.x = source.x;
  target.y = source.y;
  target.velocityX = source.velocity.x;
  target.velocityY = source.velocity.y;
  target.radius = source.radius;
  target.source = kind === "friendly" ? (source as CoreProjectileState).source : "";
  // Set once at spawn: the value never changes, so it costs nothing per tick.
  const visual = kind === "hostile" ? (source as HostileProjectileState).visual : friendlyVisual;
  target.visualShape = visual?.shape ?? "";
  target.visualScale = visual?.modelScale ?? 1;
}

function syncHomingMissile(target: HomingMissileState, source: CoreHomingMissileState): void {
  target.entityId = source.id;
  target.spawnSequence = source.spawnSequence;
  target.x = source.x;
  target.y = source.y;
  target.velocityX = source.velocity.x;
  target.velocityY = source.velocity.y;
  target.radius = source.radius;
  target.heading = source.heading;
  target.visualShape = source.visual?.shape ?? "";
  target.visualScale = source.visual?.modelScale ?? 1;
}

function syncTeamUpgrade(
  target: SpaceshipDefenderState["game"]["teamUpgrade"],
  offer: TeamUpgradeOffer | null,
  votes: Readonly<Record<CrewRole, TeamUpgradeVote | null>>,
  selection: TeamUpgradeSelection | null
): void {
  target.hasOffer = offer !== null;
  if (offer !== null) {
    target.offer.offerId = offer.offerId;
    target.offer.waveNumber = offer.waveNumber;
    for (const [index, source] of offer.cards.entries()) {
      while (target.offer.cards.length <= index) target.offer.cards.push(new UpgradeCardState());
      const card = target.offer.cards.at(index);
      card.upgradeId = source.upgradeId;
      card.role = source.role;
      card.label = source.label;
      card.value = source.value;
      card.price = source.price;
    }
    while (target.offer.cards.length > offer.cards.length) target.offer.cards.pop();
  } else {
    target.offer.cards.clear();
  }
  target.votes.clear();
  for (const role of CREW_ROLES) {
    const source = votes[role];
    if (source === null) continue;
    const vote = new UpgradeVoteState();
    vote.role = source.role;
    vote.upgradeId = source.upgradeId;
    vote.revision = source.revision;
    target.votes.set(role, vote);
  }
  target.hasSelection = selection !== null;
  if (selection !== null) {
    target.selection.offerId = selection.offerId;
    target.selection.upgradeId = selection.upgradeId;
    target.selection.role = selection.role;
    target.selection.waveNumber = selection.waveNumber;
    target.selection.price = selection.price;
  }
}
