import {
  CREW_ROLES,
  displayRoomViewSchema,
  type DisplayRoomView
} from "@spaceship-defender/protocol";

import {
  toEnemyEffects,
  toEntityVisual,
  toNebulaPreset,
  toPoseView,
  toPublicHomingMissile,
  toPublicLatency,
  toPublicProjectile,
  toSpawnOrder,
  toTeamUpgradeView,
  ZERO_DRIVE
} from "./roomView/parts.js";
import type { NetworkRoomState } from "./roomView/wire.js";
export type { NetworkRoomState } from "./roomView/wire.js";

/**
 * The last moment whose shape was checked in full; see the note at the parse.
 */
let lastValidatedShape: string | undefined;

export function toDisplayRoomView(
  state: NetworkRoomState | undefined
): DisplayRoomView | undefined {
  if (
    state === undefined ||
    typeof state.roomId !== "string" ||
    state.phase === undefined ||
    typeof state.runNumber !== "number" ||
    typeof state.crewSize !== "number" ||
    typeof state.shipArchetypeId !== "string" ||
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
  const built = {
    roomId: state.roomId,
    phase: state.phase,
    runNumber: state.runNumber,
    crewSize: state.crewSize,
    shipArchetypeId: state.shipArchetypeId,
    // Defaulted rather than required: an older server, or a state patch that
    // has not carried these yet, must not fail the whole view.
    maintenanceActive: state.maintenanceActive ?? false,
    maintenanceSecondsRemaining: state.maintenanceSecondsRemaining ?? 0,
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
            helm: game.helm,
            rimBandWidth: game.rimBandWidth,
            shieldPhase: display.shieldPhase ?? "down",
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
              lootWindowSecondsRemaining: game.encounter.lootWindowSecondsRemaining,
              score: game.encounter.score
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
            serverStepMs: display.serverStepMs ?? 0,
            appliedInputSeq: display.appliedInputSeq ?? 0,
            drive: { ...ZERO_DRIVE, ...display.drive },
            pose: toPoseView(display.pose),
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
              showHealthBar: entry.showHealthBar,
              isBoss: entry.isBoss,
              effects: toEnemyEffects(entry)
            })),
            enemyShips: toSpawnOrder(display.enemyShips),
            asteroids: toSpawnOrder(display.asteroids),
            purchasedModules: [...display.purchasedModules],
            lootDrops: toSpawnOrder(display.lootDrops),
            laserBeams: [...display.laserBeams.values()].map((beam) => ({ ...beam })),
            friendlyProjectiles: toSpawnOrder(display.friendlyProjectiles).map(toPublicProjectile),
            hostileProjectiles: toSpawnOrder(display.hostileProjectiles).map(toPublicProjectile),
            homingMissiles: toSpawnOrder(display.homingMissiles).map(toPublicHomingMissile)
          }
        : null
  };

  /*
   * Validated when the shape can have changed, not on every patch.
   *
   * The full parse is a contract check worth keeping - it has caught a real bug,
   * where an intermission published moving entities and the display's own rule
   * refused the patch. But that rule, and every other one in `refineRoom`, is
   * about the shape of a moment: which phase, which run, whether there is a
   * world at all. Between two combat patches nothing it tests can change, and
   * running it anyway cost thirty milliseconds a second on a throttled phone -
   * the largest single item left after React was taken off the patch path,
   * because zod rebuilds the whole object it validates.
   *
   * So it runs on the first patch of every such moment and is skipped for the
   * repeats. A malformed field that appears mid-combat now reaches the scene
   * instead of the console; that is the trade, and the room's own tests are
   * where that class of bug is caught.
   */
  const shapeKey = `${state.roomId}|${state.phase}|${String(state.runNumber)}|${String(state.hasGame === true)}|${game?.encounter.phase ?? ""}`;
  if (shapeKey !== lastValidatedShape) {
    const validated = displayRoomViewSchema.parse(built);
    lastValidatedShape = shapeKey;
    return validated;
  }
  return built as DisplayRoomView;
}

export function createControllerJoinUrl(controllerUrl: string, roomId: string): string {
  const url = new URL(controllerUrl);
  url.searchParams.set("room", roomId);
  return url.toString();
}
