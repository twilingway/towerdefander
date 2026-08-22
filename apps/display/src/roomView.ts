import {
  CREW_ROLES,
  displayRoomViewSchema,
  type CrewRole,
  type DisplayRoomView,
  type EnemyKind,
  type EncounterPhase,
  type ProjectileKind
} from "@town-defenders/protocol";

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
}

interface NetworkProjectileState extends NetworkCombatEntityState {
  kind: ProjectileKind;
}

interface NetworkHomingMissileState extends NetworkCombatEntityState {
  heading: number;
}

interface NetworkGameState {
  tick: number;
  elapsedMs: number;
  worldWidth: number;
  worldHeight: number;
  castle: {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    radius: number;
    hp: number;
    maxHp: number;
  };
  turretAngle: number;
  shield: {
    angle: number;
    arcHalfAngle: number;
    active: boolean;
    energy: number;
    capacity: number;
  };
  encounter: {
    phase: EncounterPhase;
    waveNumber: number;
    encounterTick: number;
    phaseTicksRemaining: number;
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
  display?: {
    obstacles: ValueCollection<NetworkObstacleState>;
    enemyShips: ValueCollection<NetworkEnemyState>;
    asteroids: ValueCollection<NetworkAsteroidState>;
    friendlyProjectiles: ValueCollection<NetworkProjectileState>;
    hostileProjectiles: ValueCollection<NetworkProjectileState>;
    homingMissiles: ValueCollection<NetworkHomingMissileState>;
  };
}

export interface NetworkRoomState {
  roomId?: string;
  phase?: DisplayRoomView["phase"];
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
            castle: { ...game.castle },
            turretAngle: game.turretAngle,
            shield: { ...game.shield },
            encounter: { ...game.encounter },
            roleModifiers: {
              pilot: { ...game.roleModifiers.pilot },
              gunner: { ...game.roleModifiers.gunner },
              shield: { ...game.roleModifiers.shield }
            },
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
            enemyShips: toSpawnOrder(display.enemyShips),
            asteroids: toSpawnOrder(display.asteroids),
            friendlyProjectiles: toSpawnOrder(display.friendlyProjectiles),
            hostileProjectiles: toSpawnOrder(display.hostileProjectiles),
            homingMissiles: toSpawnOrder(display.homingMissiles)
          }
        : null
  });
}

function toSpawnOrder<T extends { spawnSequence: number }>(collection: ValueCollection<T>): T[] {
  return [...collection.values()].sort((left, right) => left.spawnSequence - right.spawnSequence);
}

function toPublicLatency(latencyMs: number | undefined): number | null {
  return latencyMs === undefined || latencyMs < 0 ? null : latencyMs;
}

export function createControllerJoinUrl(controllerUrl: string, roomId: string): string {
  const url = new URL(controllerUrl);
  url.searchParams.set("room", roomId);
  return url.toString();
}
