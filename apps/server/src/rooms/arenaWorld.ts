/**
 * Keep this file free of runtime relative imports — `import type` only, for the
 * same reason `crewWorld.ts` beside it is: a plain-node harness loads it next to
 * the policy, and node strips types without rewriting a `./neighbour.js`
 * specifier to `.ts`.
 */
import { CAMERA_VIEW_ASPECT } from "@spaceship-defender/protocol";
import type {
  ArenaMatchConfig,
  ArenaMatchState,
  ArenaShipState
} from "@spaceship-defender/game-core";

import type { PolicyEntity, PolicyWorld } from "./crewPolicy.d.mts";

/** The same tick the crew policy is measured on; see `crewWorld.ts`. */
export const ARENA_POLICY_TICK_MS = 50;

function insideFrame(
  ship: { readonly x: number; readonly y: number },
  cameraViewWidth: number,
  entity: { readonly x: number; readonly y: number }
): boolean {
  return (
    Math.abs(entity.x - ship.x) <= cameraViewWidth / 2 &&
    Math.abs(entity.y - ship.y) <= (cameraViewWidth * CAMERA_VIEW_ASPECT) / 2
  );
}

/**
 * The match as one hull sees it.
 *
 * Every other ship arrives in `enemies` and every shot that is not this hull's
 * own arrives in `bullets`, so the policy that flies a campaign seat flies an
 * arena seat without knowing the difference. The frame still bounds it: a bot
 * that dodges a shell from off screen is not playing the game a person plays,
 * and in a free-for-all it would also be omniscient about fifteen opponents.
 */
export function buildArenaWorld(
  state: ArenaMatchState,
  ship: ArenaShipState,
  config: ArenaMatchConfig,
  sampledAtMs: number
): PolicyWorld {
  const stats = ship.stats;
  const eye = { x: ship.spaceship.x, y: ship.spaceship.y };
  const cameraViewWidth = config.ship.cameraViewWidth;

  const rivals = state.ships.filter(
    (other) =>
      other.alive &&
      other.id !== ship.id &&
      insideFrame(eye, cameraViewWidth, {
        x: other.spaceship.x,
        y: other.spaceship.y
      })
  );

  const incoming = state.projectiles.filter(
    (shot) =>
      shot.ownerShipId !== ship.id && insideFrame(eye, cameraViewWidth, { x: shot.x, y: shot.y })
  );

  return {
    sampledAtMs,
    tick: state.clock.tick,
    phase: "combat",
    waveNumber: 1,
    salvageWindowSeconds: 0,
    cameraViewWidth,
    arenaRadius: state.ringRadius,
    worldWidth: config.ship.worldWidth,
    worldHeight: config.ship.worldHeight,
    shieldRadius: stats.shieldRadius,
    turretAngle: ship.turretAngle,
    ship: {
      x: ship.spaceship.x,
      y: ship.spaceship.y,
      heading: ship.heading,
      velocityX: ship.spaceship.velocity.x,
      velocityY: ship.spaceship.velocity.y,
      radius: stats.spaceshipRadius,
      hp: ship.hp,
      maxHp: ship.maxHp
    },
    shield: {
      angle: ship.shieldAngle,
      active: ship.shieldActive,
      energy: ship.shieldEnergy,
      capacity: stats.shieldCapacity,
      arcHalfAngle: stats.shieldArcRadians / 2
    },
    cannon: {
      heat: ship.cannonHeat,
      capacity: stats.cannonHeatCapacity,
      overheated: ship.cannonOverheated,
      reach:
        ship.cannonKind === "laser"
          ? stats.cannonLaserRange
          : (stats.projectileSpeedPerSecond * stats.projectileLifetimeMs) / 1_000
    },
    machineGun: {
      heat: ship.mgHeat,
      capacity: stats.mgHeatCapacity,
      overheated: ship.mgOverheated
    },
    // A rival hull is a target with a heading and a health bar, which is exactly
    // what an enemy archetype is to the policy. `kind` carries the slot so a
    // committed target survives between ticks the way an enemy id does.
    enemies: rivals.map((rival) => ({
      entityId: rival.id,
      spawnSequence: rival.slot,
      x: rival.spaceship.x,
      y: rival.spaceship.y,
      velocityX: rival.spaceship.velocity.x,
      velocityY: rival.spaceship.velocity.y,
      radius: rival.stats.spaceshipRadius,
      kind: rival.id,
      heading: rival.heading,
      hp: rival.hp,
      maxHp: rival.maxHp
    })),
    missiles: [],
    bullets: incoming.map((shot): PolicyEntity => ({
      entityId: shot.id,
      spawnSequence: shot.spawnSequence,
      x: shot.x,
      y: shot.y,
      velocityX: shot.velocity.x,
      velocityY: shot.velocity.y,
      radius: shot.radius
    })),
    asteroids: [],
    loot: []
  };
}
