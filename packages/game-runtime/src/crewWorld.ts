/**
 * Keep this file free of runtime relative imports — `import type` only.
 *
 * The measurement harness (`apps/server/scripts/balance-run.mjs`) imports
 * `buildCrewWorld` from plain node, the way it already imports the policy
 * beside it. Node strips types but does not rewrite a `.js` specifier to `.ts`,
 * so one ordinary `./neighbour.js` import here would make every measurement
 * fail to load.
 */
import { CAMERA_VIEW_ASPECT } from "@spaceship-defender/protocol";
import type {
  SpaceshipSimulationConfig,
  SpaceshipSimulationState
} from "@spaceship-defender/game-core";

import type { PolicyEntity, PolicyWorld } from "./crewPolicy.d.mts";

/**
 * The tick length the measured baseline was taken with, and not the real one.
 *
 * The simulation steps sixty times a second, so a tick is 16.7 ms - but the
 * harness that produced every autopilot measurement has carried `TICK_MS = 50`
 * since the rate moved, which makes the salvage window the bot sees three times
 * longer than it is. That is a bug worth its own change: fixing it here would
 * change what the bot decides, and this move is proven by the numbers coming out
 * the same. Kept, named, and left for that change.
 */
export const POLICY_TICK_MS = 50;

/** What any entity in the arena looks like to the policy. */
interface SimEntity {
  readonly id: string;
  readonly spawnSequence: number;
  readonly x: number;
  readonly y: number;
  readonly velocity: { readonly x: number; readonly y: number };
  readonly radius: number;
}

/**
 * Whether the crew could see it at all.
 *
 * The frame, not the arena: this is what makes the policy a model of a player
 * rather than of the room. A bot that dodges a shell from off screen is not
 * playing the same game, and every measurement of survivability this project
 * has was taken against a bot bounded here.
 */
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

function toEntity(entity: SimEntity): PolicyEntity {
  return {
    entityId: entity.id,
    spawnSequence: entity.spawnSequence,
    x: entity.x,
    y: entity.y,
    velocityX: entity.velocity.x,
    velocityY: entity.velocity.y,
    radius: entity.radius
  };
}

/**
 * The arena as one seat sees it, built from the room's own state.
 *
 * The one place this slice is made, so the measurement harness and the room
 * cannot drift into feeding the policy different games - which is the whole
 * reason the policy moved next door. Time is the simulation's, never the wall
 * clock: that is what keeps a measured run replayable.
 */
export function buildCrewWorld(
  state: SpaceshipSimulationState,
  config: SpaceshipSimulationConfig,
  sampledAtMs: number
): PolicyWorld {
  const ship = { x: state.spaceship.x, y: state.spaceship.y };
  const framed = <T extends SimEntity>(entities: readonly T[]): readonly T[] =>
    entities.filter((entity) => insideFrame(ship, config.cameraViewWidth, entity));

  return {
    sampledAtMs,
    tick: state.clock.tick,
    phase: state.encounterPhase,
    waveNumber: state.waveNumber,
    salvageWindowSeconds: Math.ceil((state.lootWindowTicksRemaining * POLICY_TICK_MS) / 1000),
    cameraViewWidth: config.cameraViewWidth,
    arenaRadius: config.arenaRadius,
    worldWidth: config.worldWidth,
    worldHeight: config.worldHeight,
    shieldRadius: state.ship.shieldRadius,
    turretAngle: state.turretAngle,
    ship: {
      x: state.spaceship.x,
      y: state.spaceship.y,
      heading: state.spaceshipHeading,
      velocityX: state.spaceship.velocity.x,
      velocityY: state.spaceship.velocity.y,
      radius: state.ship.spaceshipRadius,
      hp: state.spaceshipHp,
      maxHp: state.ship.spaceshipMaxHp
    },
    shield: {
      angle: state.shieldAngle,
      active: state.shieldActive,
      energy: state.shieldEnergy,
      capacity: state.ship.shieldCapacity,
      arcHalfAngle: state.ship.shieldArcRadians / 2
    },
    cannon: {
      heat: state.cannonHeat,
      capacity: state.ship.cannonHeatCapacity,
      overheated: state.cannonOverheated,
      // How far this barrel carries, which is what the fighting distance is a
      // share of. A beam ends where its range does; anything that flies ends
      // where its lifetime does.
      reach:
        config.cannonWeaponKind === "laser"
          ? state.ship.cannonLaserRange
          : (state.ship.projectileSpeedPerSecond * config.projectileLifetimeMs) / 1_000
    },
    machineGun: {
      heat: state.mgHeat,
      capacity: state.ship.mgHeatCapacity,
      overheated: state.mgOverheated
    },
    enemies: framed(state.enemies).map((enemy) => ({
      ...toEntity(enemy),
      kind: enemy.kind,
      heading: enemy.heading,
      hp: enemy.hp,
      maxHp: enemy.maxHp
    })),
    missiles: framed(state.homingMissiles).map((missile) => ({
      ...toEntity(missile),
      heading: missile.heading
    })),
    bullets: framed(state.hostileProjectiles).map(toEntity),
    asteroids: framed(state.asteroids).map((rock) => ({
      ...toEntity(rock),
      hp: rock.hp,
      maxHp: rock.maxHp
    })),
    loot: framed(state.lootDrops).map((drop) => ({
      ...toEntity(drop),
      kind: drop.kind,
      amount: drop.amount
    }))
  };
}
