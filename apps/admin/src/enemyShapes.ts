import type { EnemyShape } from "@spaceship-defender/protocol";

export interface ShapePoint {
  readonly x: number;
  readonly y: number;
}

export interface ShapeDrawing {
  /** Outline the display fills; empty for shapes drawn only from circles. */
  readonly polygon: readonly ShapePoint[];
  /** Extra rings, e.g. the boss core; radius is in the same units as the hull. */
  readonly circles: readonly { readonly radius: number; readonly filled: boolean }[];
}

function regular(sides: number, radius: number): readonly ShapePoint[] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

/**
 * Mirrors ENEMY_SHAPE_DRAWERS in the display so the console preview matches the
 * silhouette a run will actually draw. Nose points along +X, as in game.
 */
export function shapeDrawing(shape: EnemyShape, radius: number): ShapeDrawing {
  switch (shape) {
    case "arrowhead":
      return {
        polygon: [
          { x: radius * 0.86, y: 0 },
          { x: -radius * 0.64, y: -radius * 0.54 },
          { x: -radius * 0.64, y: radius * 0.54 }
        ],
        circles: []
      };
    case "block": {
      const halfWidth = radius * 0.66;
      const halfHeight = radius * 0.45;
      return {
        polygon: [
          { x: -halfWidth, y: -halfHeight },
          { x: halfWidth, y: -halfHeight },
          { x: radius * 0.82, y: 0 },
          { x: halfWidth, y: halfHeight },
          { x: -halfWidth, y: halfHeight }
        ],
        circles: []
      };
    }
    case "diamond":
      return {
        polygon: [
          { x: radius * 1.25, y: 0 },
          { x: 0, y: -radius * 0.38 },
          { x: -radius * 0.7, y: 0 },
          { x: 0, y: radius * 0.38 }
        ],
        circles: []
      };
    case "dart":
      return {
        polygon: [
          { x: radius * 1.1, y: 0 },
          { x: -radius * 0.75, y: -radius * 0.85 },
          { x: -radius * 0.2, y: 0 },
          { x: -radius * 0.75, y: radius * 0.85 }
        ],
        circles: []
      };
    case "hexagon":
      return { polygon: regular(6, radius), circles: [{ radius: radius * 0.48, filled: false }] };
    case "cross": {
      const arm = radius * 0.32;
      return {
        polygon: [
          { x: -arm, y: -radius },
          { x: arm, y: -radius },
          { x: arm, y: -arm },
          { x: radius, y: -arm },
          { x: radius, y: arm },
          { x: arm, y: arm },
          { x: arm, y: radius },
          { x: -arm, y: radius },
          { x: -arm, y: arm },
          { x: -radius, y: arm },
          { x: -radius, y: -arm },
          { x: -arm, y: -arm }
        ],
        circles: []
      };
    }
    case "ring":
      return {
        polygon: [
          { x: radius, y: 0 },
          { x: radius * 0.35, y: -radius * 0.3 },
          { x: radius * 0.35, y: radius * 0.3 }
        ],
        circles: [
          { radius, filled: false },
          { radius: radius * 0.55, filled: false }
        ]
      };
    case "spike":
      return {
        polygon: Array.from({ length: 10 }, (_, index) => {
          const angle = (index / 10) * Math.PI * 2;
          const reach = index % 2 === 0 ? radius : radius * 0.5;
          return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach };
        }),
        circles: []
      };
  }
}

export function toSvgPoints(points: readonly ShapePoint[], center: number): string {
  return points.map(({ x, y }) => `${String(center + x)},${String(center + y)}`).join(" ");
}

/** The player's hull, drawn as a dashed reference ring. */
export const SPACESHIP_WORLD_RADIUS = 52;

/** How far a silhouette of this shape reaches beyond its nominal radius. */
export function shapeReach(shape: EnemyShape): number {
  const drawing = shapeDrawing(shape, 1);
  const polygonReach = Math.max(
    0,
    ...drawing.polygon.map(({ x, y }) => Math.hypot(x, y)),
    ...drawing.circles.map(({ radius }) => radius)
  );
  return Math.max(1, polygonReach);
}

export interface PreviewScale {
  /** Multiply a world radius by this to get svg units. */
  readonly factor: number;
  /** True when the drawn model reaches past the frame at this scale. */
  readonly modelOverflows: boolean;
}

/**
 * The view scale follows the hit radius and the player hull only, never the
 * model scale. That keeps both rings still while the model grows around them,
 * which is the whole point of showing them together.
 */
export function previewScale(
  hitRadius: number,
  modelScale: number,
  shape: EnemyShape,
  box: number
): PreviewScale {
  const half = box * 0.46;
  const anchor = Math.max(hitRadius, SPACESHIP_WORLD_RADIUS, 1);
  const factor = half / anchor;
  return {
    factor,
    modelOverflows: hitRadius * modelScale * shapeReach(shape) * factor > half
  };
}

/** World radius the silhouette actually occupies. */
export function modelWorldRadius(hitRadius: number, modelScale: number): number {
  return Math.round(hitRadius * modelScale);
}
