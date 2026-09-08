import type { DisplayRoomView } from "@spaceship-defender/protocol";

import type { SoloCockpitWorld } from "./hooks/useSoloCockpit.js";
import type { PredictionWorld } from "./hooks/useShipPrediction.js";

type DisplayGame = NonNullable<DisplayRoomView["game"]>;

/** What the aiming cockpit needs out of a snapshot, and nothing else. */
export function toAimWorld(game: DisplayGame | null | undefined): SoloCockpitWorld | undefined {
  if (game == null) return undefined;
  return {
    shooter: { x: game.spaceship.x, y: game.spaceship.y },
    targets: game.enemyShips,
    obstacles: game.obstacles,
    cannonReach: game.cannon.reach,
    turretAngle: game.turretAngle,
    heading: game.spaceship.heading,
    turretMountedOnHull: game.helm.turretMountedOnHull,
    headingDeadbandRadians: game.helm.headingDeadbandRadians,
    headingFilterSeconds: game.helm.headingFilterSeconds,
    turretLeadRadians: game.helm.turretLeadRadians
  };
}

/** What the local step needs out of a snapshot: the drive and the arena. */
export function toPredictionWorld(
  game: DisplayGame | null | undefined
): PredictionWorld | undefined {
  if (game == null) return undefined;
  return {
    drive: game.drive,
    worldWidth: game.worldWidth,
    worldHeight: game.worldHeight,
    arenaRadius: game.arenaRadius,
    turretMountedOnHull: game.helm.turretMountedOnHull
  };
}
