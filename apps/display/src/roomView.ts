import {
  CREW_ROLES,
  displayRoomViewSchema,
  type CrewRole,
  type DisplayRoomView
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

interface NetworkProjectileState {
  projectileId: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
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
  };
  turretAngle: number;
  shield: { angle: number; active: boolean };
  display?: {
    obstacles: ValueCollection<NetworkObstacleState>;
    projectiles: ValueCollection<NetworkProjectileState>;
  };
}

export interface NetworkRoomState {
  roomId?: string;
  phase?: DisplayRoomView["phase"];
  displayConnected?: boolean;
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
      connected: player.connected
    }))
    .sort((left, right) => CREW_ROLES.indexOf(left.role) - CREW_ROLES.indexOf(right.role));

  const game = state.game;
  return displayRoomViewSchema.parse({
    roomId: state.roomId,
    phase: state.phase,
    displayConnected: state.displayConnected,
    players,
    game:
      state.hasGame === true && game?.display !== undefined
        ? {
            tick: game.tick,
            elapsedMs: game.elapsedMs,
            worldWidth: game.worldWidth,
            worldHeight: game.worldHeight,
            castle: { ...game.castle },
            turretAngle: game.turretAngle,
            shield: { ...game.shield },
            obstacles: [...game.display.obstacles.values()].map((obstacle) =>
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
            projectiles: [...game.display.projectiles.values()].map((projectile) => ({
              projectileId: projectile.projectileId,
              x: projectile.x,
              y: projectile.y,
              velocityX: projectile.velocityX,
              velocityY: projectile.velocityY,
              radius: projectile.radius
            }))
          }
        : null
  });
}

export function createControllerJoinUrl(controllerUrl: string, roomId: string): string {
  const url = new URL(controllerUrl);
  url.searchParams.set("room", roomId);
  return url.toString();
}
