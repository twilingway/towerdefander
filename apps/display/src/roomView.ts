import {
  CREW_ROLES,
  NEBULA_PRESETS,
  displayRoomViewSchema,
  type AsteroidOrigin,
  type CrewRole,
  type DefeatReason,
  type DisplayRoomView,
  type EnemyKind,
  type EncounterPhase,
  type NebulaPreset,
  type ProjectileKind,
  type PublicSpaceshipView,
  type PublicUpgradeVote,
  type ShieldPhase,
  type TerminalOutcome,
  type UpgradeId
} from "@spaceship-defender/protocol";

interface ValueCollection<T> {
  values(): IterableIterator<T>;
}

interface NetworkPlayerState {
  playerId: string;
  playerName: string;
  role: CrewRole;
  ready: boolean;
  connected: boolean;
  latencyMs: number;
}

interface NetworkObstacleState {
  obstacleId: string;
  kind: "rectangle" | "circle";
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

interface NetworkCombatEntityState {
  entityId: string;
  spawnSequence: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
}

interface NetworkEnemyState extends NetworkCombatEntityState {
  kind: EnemyKind;
  heading: number;
  hp: number;
  maxHp: number;
}

interface NetworkAsteroidState extends NetworkCombatEntityState {
  hp: number;
  maxHp: number;
  origin: AsteroidOrigin;
}

interface NetworkProjectileState extends NetworkCombatEntityState {
  kind: ProjectileKind;
  source?: string;
  visualShape?: string;
  visualScale?: number;
}

interface NetworkHomingMissileState extends NetworkCombatEntityState {
  heading: number;
  visualShape?: string;
  visualScale?: number;
}

interface NetworkUpgradeCardState {
  upgradeId: UpgradeId;
  role: CrewRole;
  label: string;
  value: number;
  price: number;
}

interface NetworkUpgradeVoteState {
  role: CrewRole;
  upgradeId: UpgradeId;
  revision: number;
}

interface NetworkTeamUpgradeState {
  hasOffer?: boolean;
  offer: {
    offerId: string;
    waveNumber: number;
    cards: ValueCollection<NetworkUpgradeCardState>;
  };
  votes: ValueCollection<NetworkUpgradeVoteState>;
  hasSelection?: boolean;
  selection: {
    offerId: string;
    waveNumber: number;
    upgradeId: UpgradeId;
    role: CrewRole;
    price: number;
  };
}

interface NetworkGameState {
  tick: number;
  elapsedMs: number;
  worldWidth: number;
  worldHeight: number;
  arenaRadius: number;
  rimBandWidth: number;
  spaceship: PublicSpaceshipView;
  turretAngle: number;
  shield: {
    angle: number;
    arcHalfAngle: number;
    active: boolean;
    energy: number;
    capacity: number;
  };
  cannon: {
    heat: number;
    capacity: number;
    overheated: boolean;
  };
  machineGun: {
    heat: number;
    capacity: number;
    overheated: boolean;
  };
  encounter: {
    phase: EncounterPhase;
    hasOutcome?: boolean;
    outcome: TerminalOutcome | null;
    hasDefeatReason?: boolean;
    defeatReason: DefeatReason | null;
    waveNumber: number;
    encounterTick: number;
    phaseTicksRemaining: number;
    waveSecondsRemaining: number;
    score: number;
  };
  roleModifiers: {
    pilot: { speedMultiplier: number; accelerationMultiplier: number; maxHpBonus: number };
    gunner: {
      damageMultiplier: number;
      cooldownMultiplier: number;
      projectileSpeedMultiplier: number;
    };
    shield: { capacityBonus: number; rechargeMultiplier: number; arcWidthBonus: number };
  };
  credits: number;
  teamUpgrade?: NetworkTeamUpgradeState;
  display?: {
    cameraViewWidth: number;
    backgroundParallaxStrength?: number;
    backgroundDriftSpeed?: number;
    backgroundNebulaAlpha?: number;
    backgroundNebulaPreset?: string;
    asteroidVisualShape?: string;
    asteroidVisualScale?: number;
    spaceshipVisualShape?: string;
    spaceshipVisualScale?: number;
    turretVisualShape?: string;
    turretVisualScale?: number;
    turretMountX?: number;
    turretMountY?: number;
    turretPivotX?: number;
    turretPivotY?: number;
    shieldRadius?: number;
    shieldPhase?: ShieldPhase;
    shieldRearmRequired?: boolean;
    enemyCatalogue: ValueCollection<NetworkEnemyVisualState>;
    obstacles: ValueCollection<NetworkObstacleState>;
    enemyShips: ValueCollection<NetworkEnemyState>;
    asteroids: ValueCollection<NetworkAsteroidState>;
    friendlyProjectiles: ValueCollection<NetworkProjectileState>;
    hostileProjectiles: ValueCollection<NetworkProjectileState>;
    homingMissiles: ValueCollection<NetworkHomingMissileState>;
  };
}

interface NetworkEnemyVisualState {
  kind: string;
  label: string;
  shape: string;
  modelScale: number;
  showHealthBar: boolean;
}

export interface NetworkRoomState {
  roomId?: string;
  phase?: DisplayRoomView["phase"];
  runNumber?: number;
  crewSize?: number;
  displayConnected?: boolean;
  displayLatencyMs?: number;
  players?: ValueCollection<NetworkPlayerState>;
  hasGame?: boolean;
  game?: NetworkGameState;
}

export function toDisplayRoomView(
  state: NetworkRoomState | undefined
): DisplayRoomView | undefined {
  if (
    state === undefined ||
    typeof state.roomId !== "string" ||
    state.phase === undefined ||
    typeof state.runNumber !== "number" ||
    typeof state.crewSize !== "number" ||
    typeof state.displayConnected !== "boolean" ||
    state.players === undefined
  ) {
    return undefined;
  }

  const players = [...state.players.values()]
    .map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      role: player.role,
      ready: player.ready,
      connected: player.connected,
      latencyMs: toPublicLatency(player.latencyMs)
    }))
    .sort((left, right) => CREW_ROLES.indexOf(left.role) - CREW_ROLES.indexOf(right.role));

  const game = state.game;
  const display = game?.display;
  return displayRoomViewSchema.parse({
    roomId: state.roomId,
    phase: state.phase,
    runNumber: state.runNumber,
    crewSize: state.crewSize,
    displayConnected: state.displayConnected,
    displayLatencyMs: toPublicLatency(state.displayLatencyMs),
    players,
    game:
      state.hasGame === true && game !== undefined && display !== undefined
        ? {
            tick: game.tick,
            elapsedMs: game.elapsedMs,
            worldWidth: game.worldWidth,
            worldHeight: game.worldHeight,
            arenaRadius: game.arenaRadius,
            rimBandWidth: game.rimBandWidth,
            shieldPhase: display.shieldPhase ?? "down",
            shieldRearmRequired: display.shieldRearmRequired ?? false,
            spaceship: { ...game.spaceship },
            turretAngle: game.turretAngle,
            shield: { ...game.shield },
            cannon: { ...game.cannon },
            machineGun: { ...game.machineGun },
            encounter: {
              phase: game.encounter.phase,
              outcome:
                game.encounter.hasOutcome === true || game.encounter.outcome === null
                  ? game.encounter.outcome
                  : null,
              defeatReason:
                game.encounter.hasDefeatReason === true || game.encounter.defeatReason === null
                  ? game.encounter.defeatReason
                  : null,
              waveNumber: game.encounter.waveNumber,
              encounterTick: game.encounter.encounterTick,
              phaseTicksRemaining: game.encounter.phaseTicksRemaining,
              waveSecondsRemaining: game.encounter.waveSecondsRemaining,
              score: game.encounter.score
            },
            roleModifiers: {
              pilot: { ...game.roleModifiers.pilot },
              gunner: { ...game.roleModifiers.gunner },
              shield: { ...game.roleModifiers.shield }
            },
            credits: game.credits,
            teamUpgrade: toTeamUpgradeView(game.teamUpgrade),
            obstacles: [...display.obstacles.values()].map((obstacle) =>
              obstacle.kind === "circle"
                ? {
                    obstacleId: obstacle.obstacleId,
                    kind: obstacle.kind,
                    x: obstacle.x,
                    y: obstacle.y,
                    radius: obstacle.radius
                  }
                : {
                    obstacleId: obstacle.obstacleId,
                    kind: obstacle.kind,
                    x: obstacle.x,
                    y: obstacle.y,
                    width: obstacle.width,
                    height: obstacle.height
                  }
            ),
            cameraViewWidth: display.cameraViewWidth,
            background: {
              parallaxStrength: display.backgroundParallaxStrength ?? 1,
              driftSpeed: display.backgroundDriftSpeed ?? 1,
              nebulaAlpha: display.backgroundNebulaAlpha ?? 0.72,
              nebulaPreset: toNebulaPreset(display.backgroundNebulaPreset)
            },
            asteroidVisual: toEntityVisual(
              display.asteroidVisualShape,
              display.asteroidVisualScale
            ),
            spaceshipVisual: toEntityVisual(
              display.spaceshipVisualShape,
              display.spaceshipVisualScale
            ),
            turretVisual:
              display.turretVisualShape === undefined || display.turretVisualShape.length === 0
                ? null
                : {
                    shape: display.turretVisualShape,
                    modelScale: display.turretVisualScale ?? 1,
                    mountX: display.turretMountX ?? 0,
                    mountY: display.turretMountY ?? 0,
                    pivotX: display.turretPivotX ?? 0,
                    pivotY: display.turretPivotY ?? 0
                  },
            shieldRadius: display.shieldRadius ?? game.spaceship.radius,
            enemyCatalogue: [...display.enemyCatalogue.values()].map((entry) => ({
              kind: entry.kind,
              label: entry.label,
              shape: entry.shape,
              modelScale: entry.modelScale,
              showHealthBar: entry.showHealthBar
            })),
            enemyShips: toSpawnOrder(display.enemyShips),
            asteroids: toSpawnOrder(display.asteroids),
            friendlyProjectiles: toSpawnOrder(display.friendlyProjectiles).map(toPublicProjectile),
            hostileProjectiles: toSpawnOrder(display.hostileProjectiles).map(toPublicProjectile),
            homingMissiles: toSpawnOrder(display.homingMissiles).map(toPublicHomingMissile)
          }
        : null
  });
}

function toTeamUpgradeView(teamUpgrade: NetworkTeamUpgradeState | undefined) {
  const votes: Record<CrewRole, PublicUpgradeVote | null> = {
    pilot: null,
    gunner: null,
    shield: null
  };
  if (teamUpgrade !== undefined) {
    for (const vote of teamUpgrade.votes.values()) {
      votes[vote.role] = {
        role: vote.role,
        upgradeId: vote.upgradeId,
        revision: vote.revision
      };
    }
  }
  return {
    offer:
      teamUpgrade?.hasOffer === true
        ? {
            offerId: teamUpgrade.offer.offerId,
            waveNumber: teamUpgrade.offer.waveNumber,
            cards: [...teamUpgrade.offer.cards.values()].map((card) => ({ ...card }))
          }
        : null,
    votes,
    selection: teamUpgrade?.hasSelection === true ? { ...teamUpgrade.selection } : null
  };
}

function toSpawnOrder<T extends { spawnSequence: number }>(collection: ValueCollection<T>): T[] {
  return [...collection.values()].sort((left, right) => left.spawnSequence - right.spawnSequence);
}

function toPublicProjectile(projectile: NetworkProjectileState) {
  const base = {
    entityId: projectile.entityId,
    spawnSequence: projectile.spawnSequence,
    kind: projectile.kind,
    x: projectile.x,
    y: projectile.y,
    velocityX: projectile.velocityX,
    velocityY: projectile.velocityY,
    radius: projectile.radius,
    visual: toEntityVisual(projectile.visualShape, projectile.visualScale)
  };
  const source = normalizeProjectileSource(projectile.source);
  return source === undefined ? base : { ...base, source };
}

function toPublicHomingMissile(missile: NetworkHomingMissileState) {
  return {
    entityId: missile.entityId,
    spawnSequence: missile.spawnSequence,
    x: missile.x,
    y: missile.y,
    velocityX: missile.velocityX,
    velocityY: missile.velocityY,
    radius: missile.radius,
    heading: missile.heading,
    visual: toEntityVisual(missile.visualShape, missile.visualScale)
  };
}

/** The wire spells "no look" as an empty shape, so it never sends a null branch. */
function toEntityVisual(
  shape: string | undefined,
  modelScale: number | undefined
): { shape: string; modelScale: number } | null {
  if (shape === undefined || shape.length === 0) return null;
  return { shape, modelScale: modelScale ?? 1 };
}

function normalizeProjectileSource(
  source: string | undefined
): "cannon" | "machineGun" | undefined {
  if (source === "cannon" || source === "machineGun") return source;
  return undefined;
}

/** A preset the display does not ship with falls back to the blue nebula. */
function toNebulaPreset(preset: string | undefined): NebulaPreset {
  if (preset !== undefined && (NEBULA_PRESETS as readonly string[]).includes(preset)) {
    return preset as NebulaPreset;
  }
  return "blue";
}

function toPublicLatency(latencyMs: number | undefined): number | null {
  return latencyMs === undefined || latencyMs < 0 ? null : latencyMs;
}

export function createControllerJoinUrl(controllerUrl: string, roomId: string): string {
  const url = new URL(controllerUrl);
  url.searchParams.set("room", roomId);
  return url.toString();
}
