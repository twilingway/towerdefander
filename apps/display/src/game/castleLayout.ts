export const BATTLEFIELD_WIDTH = 1280;
export const BATTLEFIELD_HEIGHT = 720;
export const CASTLE_ENVIRONMENT_KEY = "castle-environment-v1";
export const CASTLE_ENVIRONMENT_URL = "/assets/castle-environment-v1.webp";

export const SUPPORTED_PLAYER_CAPACITIES = [2, 3, 4, 5, 6] as const;
export type PlayerCapacity = (typeof SUPPORTED_PLAYER_CAPACITIES)[number];

export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
}

export interface BattlefieldPoint {
  readonly x: number;
  readonly y: number;
}

export interface SectorLayout {
  readonly sectorId: number;
  readonly lane: readonly [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint];
  readonly gate: NormalizedPoint;
  readonly tower: NormalizedPoint;
  readonly label: NormalizedPoint;
  readonly effect: NormalizedPoint;
}

export interface CastleLayoutManifest {
  readonly playerCapacity: PlayerCapacity;
  readonly sectors: readonly SectorLayout[];
}

export interface EnvironmentAsset {
  readonly key: string;
  readonly url: string;
}

export type EnvironmentLayerState = "loading" | "ready" | "failed";
export type EnvironmentLayerEvent = "loaded" | "failed";

function point(x: number, y: number): NormalizedPoint {
  return { x, y };
}

function sector(
  sectorId: number,
  start: NormalizedPoint,
  controlA: NormalizedPoint,
  controlB: NormalizedPoint,
  gate: NormalizedPoint,
  tower: NormalizedPoint,
  label: NormalizedPoint,
  effect: NormalizedPoint
): SectorLayout {
  return {
    sectorId,
    lane: [start, controlA, controlB, gate],
    gate,
    tower,
    label,
    effect
  };
}

const CAPACITY_2_LAYOUT = [
  sector(
    0,
    point(0.02, 0.22),
    point(0.08, 0.4),
    point(0.24, 0.56),
    point(0.38, 0.56),
    point(0.32, 0.49),
    point(0.13, 0.72),
    point(0.3, 0.59)
  ),
  sector(
    1,
    point(0.98, 0.7),
    point(0.9, 0.62),
    point(0.76, 0.54),
    point(0.62, 0.56),
    point(0.68, 0.49),
    point(0.87, 0.72),
    point(0.7, 0.59)
  )
] as const;

const CAPACITY_3_LAYOUT = [
  sector(
    0,
    point(0.5, 0.02),
    point(0.5, 0.14),
    point(0.5, 0.25),
    point(0.5, 0.36),
    point(0.43, 0.34),
    point(0.5, 0.12),
    point(0.5, 0.3)
  ),
  sector(
    1,
    point(0.02, 0.78),
    point(0.14, 0.69),
    point(0.28, 0.63),
    point(0.4, 0.6),
    point(0.35, 0.53),
    point(0.14, 0.8),
    point(0.33, 0.64)
  ),
  sector(
    2,
    point(0.98, 0.78),
    point(0.86, 0.69),
    point(0.72, 0.63),
    point(0.6, 0.6),
    point(0.65, 0.53),
    point(0.86, 0.8),
    point(0.67, 0.64)
  )
] as const;

const CAPACITY_4_LAYOUT = [
  sector(
    0,
    point(0.5, 0.02),
    point(0.5, 0.14),
    point(0.5, 0.25),
    point(0.5, 0.35),
    point(0.43, 0.34),
    point(0.5, 0.12),
    point(0.5, 0.29)
  ),
  sector(
    1,
    point(0.02, 0.5),
    point(0.14, 0.5),
    point(0.26, 0.5),
    point(0.37, 0.5),
    point(0.36, 0.42),
    point(0.12, 0.5),
    point(0.31, 0.5)
  ),
  sector(
    2,
    point(0.5, 0.98),
    point(0.5, 0.86),
    point(0.5, 0.76),
    point(0.5, 0.66),
    point(0.57, 0.67),
    point(0.5, 0.86),
    point(0.5, 0.72)
  ),
  sector(
    3,
    point(0.98, 0.5),
    point(0.86, 0.5),
    point(0.74, 0.5),
    point(0.63, 0.5),
    point(0.64, 0.42),
    point(0.88, 0.5),
    point(0.69, 0.5)
  )
] as const;

const CAPACITY_5_LAYOUT = [
  sector(
    0,
    point(0.5, 0.02),
    point(0.5, 0.13),
    point(0.5, 0.24),
    point(0.5, 0.34),
    point(0.44, 0.32),
    point(0.5, 0.11),
    point(0.5, 0.28)
  ),
  sector(
    1,
    point(0.02, 0.3),
    point(0.14, 0.32),
    point(0.26, 0.37),
    point(0.36, 0.42),
    point(0.35, 0.35),
    point(0.12, 0.25),
    point(0.31, 0.39)
  ),
  sector(
    2,
    point(0.02, 0.78),
    point(0.15, 0.71),
    point(0.28, 0.65),
    point(0.39, 0.61),
    point(0.35, 0.55),
    point(0.13, 0.8),
    point(0.33, 0.64)
  ),
  sector(
    3,
    point(0.98, 0.78),
    point(0.85, 0.71),
    point(0.72, 0.65),
    point(0.61, 0.61),
    point(0.65, 0.55),
    point(0.87, 0.8),
    point(0.67, 0.64)
  ),
  sector(
    4,
    point(0.98, 0.3),
    point(0.86, 0.32),
    point(0.74, 0.37),
    point(0.64, 0.42),
    point(0.65, 0.35),
    point(0.88, 0.25),
    point(0.69, 0.39)
  )
] as const;

const CAPACITY_6_LAYOUT = [
  sector(
    0,
    point(0.25, 0.02),
    point(0.31, 0.13),
    point(0.37, 0.25),
    point(0.42, 0.35),
    point(0.36, 0.35),
    point(0.23, 0.11),
    point(0.39, 0.29)
  ),
  sector(
    1,
    point(0.75, 0.02),
    point(0.69, 0.13),
    point(0.63, 0.25),
    point(0.58, 0.35),
    point(0.64, 0.35),
    point(0.77, 0.11),
    point(0.61, 0.29)
  ),
  sector(
    2,
    point(0.98, 0.5),
    point(0.86, 0.5),
    point(0.75, 0.5),
    point(0.65, 0.5),
    point(0.66, 0.42),
    point(0.89, 0.5),
    point(0.71, 0.5)
  ),
  sector(
    3,
    point(0.75, 0.98),
    point(0.69, 0.87),
    point(0.63, 0.75),
    point(0.58, 0.65),
    point(0.64, 0.65),
    point(0.77, 0.87),
    point(0.61, 0.71)
  ),
  sector(
    4,
    point(0.25, 0.98),
    point(0.31, 0.87),
    point(0.37, 0.75),
    point(0.42, 0.65),
    point(0.36, 0.65),
    point(0.23, 0.87),
    point(0.39, 0.71)
  ),
  sector(
    5,
    point(0.02, 0.5),
    point(0.14, 0.5),
    point(0.25, 0.5),
    point(0.35, 0.5),
    point(0.34, 0.42),
    point(0.11, 0.5),
    point(0.29, 0.5)
  )
] as const;

export const CASTLE_LAYOUT_CATALOG: Readonly<Record<PlayerCapacity, CastleLayoutManifest>> = {
  2: { playerCapacity: 2, sectors: CAPACITY_2_LAYOUT },
  3: { playerCapacity: 3, sectors: CAPACITY_3_LAYOUT },
  4: { playerCapacity: 4, sectors: CAPACITY_4_LAYOUT },
  5: { playerCapacity: 5, sectors: CAPACITY_5_LAYOUT },
  6: { playerCapacity: 6, sectors: CAPACITY_6_LAYOUT }
};

/**
 * Compatibility alias for the current two-sector runtime. New code should select
 * a manifest through getCastleLayout with the authoritative room capacity.
 */
export const CASTLE_LAYOUT = CAPACITY_2_LAYOUT;

const CASTLE_ENVIRONMENT_ASSETS: Readonly<Partial<Record<PlayerCapacity, EnvironmentAsset>>> = {
  2: {
    key: CASTLE_ENVIRONMENT_KEY,
    url: CASTLE_ENVIRONMENT_URL
  }
};

export function getCastleLayout(playerCapacity: PlayerCapacity): CastleLayoutManifest {
  return CASTLE_LAYOUT_CATALOG[playerCapacity];
}

export function getCastleEnvironmentAsset(playerCapacity: PlayerCapacity): EnvironmentAsset | null {
  return CASTLE_ENVIRONMENT_ASSETS[playerCapacity] ?? null;
}

export function getLanePoint(
  playerCapacity: PlayerCapacity,
  sectorId: number,
  progress: number,
  pathLength: number
): BattlefieldPoint;
/**
 * @deprecated Compatibility overload for the current two-sector runtime.
 */
export function getLanePoint(
  sectorId: 0 | 1,
  progress: number,
  pathLength: number
): BattlefieldPoint;
export function getLanePoint(
  playerCapacityOrSectorId: PlayerCapacity | 0 | 1,
  sectorIdOrProgress: number,
  progressOrPathLength: number,
  pathLength?: number
): BattlefieldPoint {
  const usesCapacityAwareSignature = pathLength !== undefined;
  const playerCapacity = usesCapacityAwareSignature
    ? (playerCapacityOrSectorId as PlayerCapacity)
    : 2;
  const sectorId = usesCapacityAwareSignature ? sectorIdOrProgress : playerCapacityOrSectorId;
  const progress = usesCapacityAwareSignature ? progressOrPathLength : sectorIdOrProgress;
  const resolvedPathLength = usesCapacityAwareSignature ? pathLength : progressOrPathLength;
  const layout = getCastleLayout(playerCapacity);
  const sectorLayout = layout.sectors[sectorId];

  if (sectorLayout === undefined) {
    throw new RangeError(
      `Sector ${String(sectorId)} does not exist in the capacity ${String(playerCapacity)} castle layout.`
    );
  }

  const ratio = resolvedPathLength <= 0 ? 0 : clamp(progress / resolvedPathLength, 0, 1);
  const [start, controlA, controlB, end] = sectorLayout.lane;
  const inverse = 1 - ratio;
  return {
    x:
      (inverse ** 3 * start.x +
        3 * inverse ** 2 * ratio * controlA.x +
        3 * inverse * ratio ** 2 * controlB.x +
        ratio ** 3 * end.x) *
      BATTLEFIELD_WIDTH,
    y:
      (inverse ** 3 * start.y +
        3 * inverse ** 2 * ratio * controlA.y +
        3 * inverse * ratio ** 2 * controlB.y +
        ratio ** 3 * end.y) *
      BATTLEFIELD_HEIGHT
  };
}

export function getWorldPoint(point: NormalizedPoint): BattlefieldPoint {
  return {
    x: point.x * BATTLEFIELD_WIDTH,
    y: point.y * BATTLEFIELD_HEIGHT
  };
}

export function transitionEnvironmentLayer(
  state: EnvironmentLayerState,
  event: EnvironmentLayerEvent
): EnvironmentLayerState {
  if (state !== "loading") {
    return state;
  }
  return event === "loaded" ? "ready" : "failed";
}

export class EnvironmentLayerController {
  private currentState: EnvironmentLayerState = "loading";

  constructor(private readonly onStateChange: (state: EnvironmentLayerState) => void) {}

  get state(): EnvironmentLayerState {
    return this.currentState;
  }

  resolve(textureAvailable: boolean, createEnvironment: () => void): void {
    if (this.currentState !== "loading") {
      return;
    }

    if (!textureAvailable) {
      this.publish("failed");
      return;
    }

    try {
      createEnvironment();
      this.publish("loaded");
    } catch {
      this.publish("failed");
    }
  }

  private publish(event: EnvironmentLayerEvent): void {
    this.currentState = transitionEnvironmentLayer(this.currentState, event);
    this.onStateChange(this.currentState);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
