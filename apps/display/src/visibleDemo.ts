import type {
  PublicAsteroidView,
  PublicEnemyView,
  PublicHomingMissileView,
  PublicProjectileView,
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

function findNearestVisibleDemoEntity(
  game: Pick<VisibleDemoGame, "spaceship">,
  targets: readonly VisibleDemoTarget[]
): VisibleDemoTarget | undefined {
  let nearest: VisibleDemoTarget | undefined;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const target of targets) {
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
