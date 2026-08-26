import { getVisualAsset, type VisualAsset, type VisualLayer } from "@spaceship-defender/protocol";

/** The player's hull, drawn as a dashed reference ring on the enemy preview. */
export const SPACESHIP_WORLD_RADIUS = 52;

/** Drawn for the player hull when a preset picks none; mirrors the display. */
export const DEFAULT_SPACESHIP_HULL_ASSET_ID = "ship-dart";

/** How far one layer reaches from the asset origin, in the asset's own units. */
function layerReach(layer: VisualLayer): number {
  switch (layer.t) {
    case "poly":
      return Math.max(0, ...layer.pts.map(([x, y]) => Math.hypot(x, y)));
    case "rect":
      return Math.max(
        Math.hypot(layer.x, layer.y),
        Math.hypot(layer.x + layer.w, layer.y),
        Math.hypot(layer.x, layer.y + layer.h),
        Math.hypot(layer.x + layer.w, layer.y + layer.h)
      );
    case "rrect":
      // Any rotation keeps the corners within half the diagonal of the centre.
      return Math.hypot(layer.x, layer.y) + Math.hypot(layer.w / 2, layer.h / 2);
    case "circle":
    case "arc":
      return Math.hypot(layer.x, layer.y) + layer.r;
    case "ellipse":
      return Math.hypot(layer.x, layer.y) + Math.max(layer.w, layer.h) / 2;
    case "line":
      return Math.max(Math.hypot(layer.x1, layer.y1), Math.hypot(layer.x2, layer.y2));
  }
}

/**
 * How far the drawn asset reaches beyond its nominal radius, as a multiplier.
 * Above 1 means the silhouette spills past the hit circle it is scaled to.
 */
export function shapeReach(shape: string): number {
  const asset = getVisualAsset(shape);
  return (assetReach(asset) / asset.radius) * asset.scaleHint;
}

export function assetReach(asset: VisualAsset): number {
  return Math.max(0, ...asset.layers.map(layerReach));
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
  shape: string,
  box: number
): PreviewScale {
  const half = box * 0.46;
  // Headroom so the outermost ring and its label stay inside the frame.
  const anchor = Math.max(hitRadius, SPACESHIP_WORLD_RADIUS, 1) * 1.2;
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
