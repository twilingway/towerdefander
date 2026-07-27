export const BATTLEFIELD_WIDTH = 1280;
export const BATTLEFIELD_HEIGHT = 720;
export const CASTLE_ENVIRONMENT_KEY = "castle-environment-v1";
export const CASTLE_ENVIRONMENT_URL = "/assets/castle-environment-v1.webp";

export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
}

export interface BattlefieldPoint {
  readonly x: number;
  readonly y: number;
}

export type EnvironmentLayerState = "loading" | "ready" | "failed";
export type EnvironmentLayerEvent = "loaded" | "failed";

interface SectorLayout {
  readonly lane: readonly [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint];
  readonly gate: NormalizedPoint;
  readonly tower: NormalizedPoint;
  readonly label: NormalizedPoint;
}

export const CASTLE_LAYOUT: readonly [SectorLayout, SectorLayout] = [
  {
    lane: [
      { x: 0.06, y: 0.18 },
      { x: 0.02, y: 0.5 },
      { x: 0.2, y: 0.56 },
      { x: 0.38, y: 0.56 }
    ],
    gate: { x: 0.38, y: 0.56 },
    tower: { x: 0.32, y: 0.52 },
    label: { x: 0.13, y: 0.72 }
  },
  {
    lane: [
      { x: 0.97, y: 0.68 },
      { x: 0.83, y: 0.6 },
      { x: 0.74, y: 0.5 },
      { x: 0.61, y: 0.56 }
    ],
    gate: { x: 0.61, y: 0.56 },
    tower: { x: 0.69, y: 0.52 },
    label: { x: 0.87, y: 0.72 }
  }
] as const;

export function getLanePoint(
  sectorId: 0 | 1,
  progress: number,
  pathLength: number
): BattlefieldPoint {
  const ratio = pathLength <= 0 ? 0 : clamp(progress / pathLength, 0, 1);
  const [start, controlA, controlB, end] = CASTLE_LAYOUT[sectorId].lane;
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
