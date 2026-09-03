import { CAMERA_VIEW_ASPECT } from "@spaceship-defender/protocol";
import type {
  PublicAsteroidView,
  PublicCannonView,
  PublicEncounterView,
  PublicEnemyView,
  PublicHomingMissileView,
  PublicLootDropView,
  PublicMachineGunView,
  PublicProjectileView,
  PublicShieldView,
  PublicSpaceshipView
} from "@spaceship-defender/protocol";

export const visibleDemoStatusEvent = "spaceship-visible-demo-status";

export type VisibleDemoCommand = "pause" | "resume" | "stop";

export interface VisibleDemoStatus {
  readonly state: string;
  readonly message: string;
  readonly waveNumber: number;
  readonly phase: string;
  readonly controlHz: number;
}

export interface VisibleDemoTarget {
  readonly entityId: string;
  readonly spawnSequence: number;
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
}

interface VisibleDemoGame {
  readonly cameraViewWidth: number;
  readonly spaceship: Pick<PublicSpaceshipView, "x" | "y">;
  readonly enemyShips: readonly PublicEnemyView[];
  readonly asteroids: readonly PublicAsteroidView[];
  readonly homingMissiles: readonly PublicHomingMissileView[];
}

interface VisibleDemoThreatGame extends VisibleDemoGame {
  readonly hostileProjectiles: readonly PublicProjectileView[];
}

interface VisibleDemoBridgeHost {
  readonly __spaceshipVisibleDemoCommand?: (command: VisibleDemoCommand) => unknown;
}

/**
 * Wave a `?wave=5` in the address asks the run to open on, clamped to what the
 * protocol accepts. Anything else reads as the opening wave, so a stray value
 * never turns into a room nobody asked for.
 */
export function readStartWave(search: string, max: number): number {
  const raw = Number(new URLSearchParams(search).get("wave"));
  if (!Number.isSafeInteger(raw) || raw < 1) return 1;
  return Math.min(max, raw);
}

/**
 * Hull a `?ship=blade` in the address asks the room to open on. An unknown or
 * missing id reads as "whatever the preset calls its default", which is what an
 * ordinary visit gets — so a stray value never opens a room on a ship nobody
 * chose.
 */
export function readShipArchetypeId(search: string): string | undefined {
  const raw = new URLSearchParams(search).get("ship");
  if (raw === null || !/^[a-z][a-zA-Z0-9-]{0,47}$/u.test(raw)) return undefined;
  return raw;
}

export function isVisibleDemoMode(
  search: string,
  development: boolean,
  enabledEnvironmentValue: unknown
): boolean {
  return (
    development &&
    enabledEnvironmentValue === "1" &&
    new URLSearchParams(search).get("demo") === "1"
  );
}

export function findNearestVisibleDemoTarget(game: VisibleDemoGame): VisibleDemoTarget | undefined {
  return findNearestVisibleDemoEntity(game, [
    ...game.enemyShips,
    ...game.asteroids,
    ...game.homingMissiles
  ]);
}

export function findNearestVisibleDemoThreat(
  game: VisibleDemoThreatGame
): VisibleDemoTarget | undefined {
  return findNearestVisibleDemoEntity(game, [
    ...game.hostileProjectiles,
    ...game.homingMissiles,
    ...game.asteroids,
    ...game.enemyShips
  ]);
}

/**
 * The bot only acts on what a player on the same screen can see, so entities
 * outside the framed slice are skipped even when they are the nearest in the
 * arena. The frame follows the authoritative `cameraViewWidth`.
 */
export function isInsideCameraFrame(
  ship: Pick<PublicSpaceshipView, "x" | "y">,
  cameraViewWidth: number,
  entity: Pick<VisibleDemoTarget, "x" | "y">
): boolean {
  const halfWidth = cameraViewWidth / 2;
  const halfHeight = (cameraViewWidth * CAMERA_VIEW_ASPECT) / 2;
  return Math.abs(entity.x - ship.x) <= halfWidth && Math.abs(entity.y - ship.y) <= halfHeight;
}

/** Nearest entity inside the camera frame, with a deterministic tie-break. */
function findNearestVisibleDemoEntity(
  game: Pick<VisibleDemoGame, "spaceship" | "cameraViewWidth">,
  targets: readonly VisibleDemoTarget[]
): VisibleDemoTarget | undefined {
  let nearest: VisibleDemoTarget | undefined;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const target of targets) {
    if (!isInsideCameraFrame(game.spaceship, game.cameraViewWidth, target)) continue;
    const deltaX = target.x - game.spaceship.x;
    const deltaY = target.y - game.spaceship.y;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (
      distanceSquared < nearestDistanceSquared ||
      (distanceSquared === nearestDistanceSquared &&
        nearest !== undefined &&
        compareTargets(target, nearest) < 0)
    ) {
      nearest = target;
      nearestDistanceSquared = distanceSquared;
    }
  }

  return nearest;
}

export function parseVisibleDemoStatus(value: unknown): VisibleDemoStatus | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.state !== "string" ||
    candidate.state.length === 0 ||
    typeof candidate.message !== "string" ||
    !Number.isSafeInteger(candidate.waveNumber) ||
    (candidate.waveNumber as number) < 0 ||
    typeof candidate.phase !== "string" ||
    candidate.phase.length === 0 ||
    typeof candidate.controlHz !== "number" ||
    !Number.isFinite(candidate.controlHz) ||
    candidate.controlHz < 0 ||
    candidate.controlHz > 100
  ) {
    return undefined;
  }

  return {
    state: candidate.state,
    message: candidate.message,
    waveNumber: candidate.waveNumber as number,
    phase: candidate.phase,
    controlHz: candidate.controlHz
  };
}

export function calculateVisibleDemoRate(sampleCount: number, elapsedMs: number): number {
  if (
    !Number.isFinite(sampleCount) ||
    sampleCount < 0 ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs <= 0
  ) {
    return 0;
  }
  return Math.round((sampleCount * 1000) / elapsedMs);
}

export function hasVisibleDemoBridge(host: unknown): host is VisibleDemoBridgeHost & {
  readonly __spaceshipVisibleDemoCommand: (command: VisibleDemoCommand) => unknown;
} {
  return (
    typeof host === "object" &&
    host !== null &&
    typeof (host as VisibleDemoBridgeHost).__spaceshipVisibleDemoCommand === "function"
  );
}

export function sendVisibleDemoCommand(host: unknown, command: VisibleDemoCommand): boolean {
  if (!hasVisibleDemoBridge(host)) return false;
  void host.__spaceshipVisibleDemoCommand(command);
  return true;
}

function compareTargets(left: VisibleDemoTarget, right: VisibleDemoTarget): number {
  return left.spawnSequence - right.spawnSequence || left.entityId.localeCompare(right.entityId);
}

/** Property the demo page hangs its world picture on for the Node bot to read. */
export const visibleDemoWorldKey = "__spaceshipDemoWorld";

interface VisibleDemoEntity {
  readonly entityId: string;
  readonly spawnSequence: number;
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly radius: number;
}

export interface VisibleDemoEnemy extends VisibleDemoEntity {
  readonly kind: string;
  readonly heading: number;
  readonly hp: number;
  readonly maxHp: number;
}

export interface VisibleDemoMissile extends VisibleDemoEntity {
  readonly heading: number;
}

export interface VisibleDemoRock extends VisibleDemoEntity {
  readonly hp: number;
  readonly maxHp: number;
}

/** Salvage left by a kill: the only hull the bot can win back inside a run. */
export interface VisibleDemoLoot extends VisibleDemoEntity {
  readonly kind: string;
  readonly amount: number;
}

/**
 * Everything the autopilot is allowed to know: the ship's own systems plus the
 * entities a viewer can actually see on the same screen. Nothing outside the
 * camera frame is published, so the bot cannot act on what the room shows it
 * but the screen does not.
 */
export interface VisibleDemoWorld {
  readonly sampledAtMs: number;
  readonly tick: number;
  readonly phase: string;
  readonly waveNumber: number;
  /** Seconds left of the window a won wave stays open for, zero outside it. */
  readonly salvageWindowSeconds: number;
  readonly cameraViewWidth: number;
  readonly arenaRadius: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly shieldRadius: number;
  readonly turretAngle: number;
  readonly ship: {
    readonly x: number;
    readonly y: number;
    readonly heading: number;
    readonly velocityX: number;
    readonly velocityY: number;
    readonly radius: number;
    readonly hp: number;
    readonly maxHp: number;
  };
  readonly shield: {
    readonly angle: number;
    readonly active: boolean;
    readonly energy: number;
    readonly capacity: number;
    readonly arcHalfAngle: number;
  };
  readonly cannon: {
    readonly heat: number;
    readonly capacity: number;
    readonly overheated: boolean;
    /** How far the barrel carries; the bot holds a share of it as its ring. */
    readonly reach: number;
  };
  readonly machineGun: {
    readonly heat: number;
    readonly capacity: number;
    readonly overheated: boolean;
  };
  readonly enemies: readonly VisibleDemoEnemy[];
  readonly missiles: readonly VisibleDemoMissile[];
  readonly bullets: readonly VisibleDemoEntity[];
  readonly asteroids: readonly VisibleDemoRock[];
  readonly loot: readonly VisibleDemoLoot[];
}

interface VisibleDemoWorldGame extends VisibleDemoThreatGame {
  readonly lootDrops: readonly PublicLootDropView[];
  readonly tick: number;
  readonly arenaRadius: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly shieldRadius: number;
  readonly turretAngle: number;
  readonly spaceship: PublicSpaceshipView;
  readonly shield: PublicShieldView;
  readonly cannon: PublicCannonView;
  readonly machineGun: PublicMachineGunView;
  readonly encounter: Pick<
    PublicEncounterView,
    "phase" | "waveNumber" | "lootWindowSecondsRemaining"
  >;
}

function toDemoEntity(entity: VisibleDemoEntity): VisibleDemoEntity {
  return {
    entityId: entity.entityId,
    spawnSequence: entity.spawnSequence,
    x: entity.x,
    y: entity.y,
    velocityX: entity.velocityX,
    velocityY: entity.velocityY,
    radius: entity.radius
  };
}

export function buildVisibleDemoWorld(
  game: VisibleDemoWorldGame,
  sampledAtMs: number
): VisibleDemoWorld {
  const framed = <T extends VisibleDemoEntity>(entities: readonly T[]): readonly T[] =>
    entities.filter((entity) => isInsideCameraFrame(game.spaceship, game.cameraViewWidth, entity));

  return {
    sampledAtMs,
    tick: game.tick,
    phase: game.encounter.phase,
    waveNumber: game.encounter.waveNumber,
    salvageWindowSeconds: game.encounter.lootWindowSecondsRemaining,
    cameraViewWidth: game.cameraViewWidth,
    arenaRadius: game.arenaRadius,
    worldWidth: game.worldWidth,
    worldHeight: game.worldHeight,
    shieldRadius: game.shieldRadius,
    turretAngle: game.turretAngle,
    ship: {
      x: game.spaceship.x,
      y: game.spaceship.y,
      heading: game.spaceship.heading,
      velocityX: game.spaceship.velocityX,
      velocityY: game.spaceship.velocityY,
      radius: game.spaceship.radius,
      hp: game.spaceship.hp,
      maxHp: game.spaceship.maxHp
    },
    shield: {
      angle: game.shield.angle,
      active: game.shield.active,
      energy: game.shield.energy,
      capacity: game.shield.capacity,
      arcHalfAngle: game.shield.arcHalfAngle
    },
    cannon: {
      heat: game.cannon.heat,
      capacity: game.cannon.capacity,
      overheated: game.cannon.overheated,
      reach: game.cannon.reach
    },
    machineGun: {
      heat: game.machineGun.heat,
      capacity: game.machineGun.capacity,
      overheated: game.machineGun.overheated
    },
    enemies: framed(game.enemyShips).map((enemy) => ({
      ...toDemoEntity(enemy),
      kind: enemy.kind,
      heading: enemy.heading,
      hp: enemy.hp,
      maxHp: enemy.maxHp
    })),
    missiles: framed(game.homingMissiles).map((missile) => ({
      ...toDemoEntity(missile),
      heading: missile.heading
    })),
    bullets: framed(game.hostileProjectiles).map(toDemoEntity),
    asteroids: framed(game.asteroids).map((asteroid) => ({
      ...toDemoEntity(asteroid),
      hp: asteroid.hp,
      maxHp: asteroid.maxHp
    })),
    loot: framed(game.lootDrops).map((drop) => ({
      ...toDemoEntity(drop),
      kind: drop.kind,
      amount: drop.amount
    }))
  };
}

/** Hands the world picture to the Node bot without touching the render path. */
export function publishVisibleDemoWorld(host: unknown, world: VisibleDemoWorld): void {
  if (typeof host !== "object" || host === null) return;
  (host as Record<string, unknown>)[visibleDemoWorldKey] = world;
}
