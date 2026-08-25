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
  /** World units per pixel-free unit: multiply a world radius to get svg units. */
  readonly factor: number;
  readonly fitted: boolean;
}

/**
 * One scale per card, chosen so both the hitbox ring and the model fit the box.
 * Everything is compared against the same reference span, so a bigger enemy
 * still looks bigger — until it outgrows the frame and the view zooms out.
 */
export function previewScale(
  hitRadius: number,
  modelScale: number,
  shape: EnemyShape,
  box: number
): PreviewScale {
  const referenceSpan = 120;
  const half = box * 0.46;
  const worldExtent = Math.max(hitRadius, hitRadius * modelScale * shapeReach(shape), 1);
  const naturalFactor = half / referenceSpan;
  if (worldExtent * naturalFactor <= half) {
    return { factor: naturalFactor, fitted: false };
  }
  return { factor: half / worldExtent, fitted: true };
}
