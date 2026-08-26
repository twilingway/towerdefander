import {
  VISUAL_PALETTE,
  getVisualAsset,
  type VisualAsset,
  type VisualColor,
  type VisualLayer
} from "@spaceship-defender/protocol";
import Phaser from "phaser";

/**
 * Draws a catalogue asset into a Graphics object.
 *
 * Two corrections separate the stored geometry from what the world expects, and
 * both live here rather than in the data: assets are drawn in absolute units
 * around their own nominal radius, and they point nose-up while every entity in
 * the world points along +X.
 */
export function drawCatalogAsset(
  body: Phaser.GameObjects.Graphics,
  asset: VisualAsset,
  worldRadius: number
): void {
  const scale = (worldRadius / asset.radius) * asset.scaleHint;
  body.save();
  body.scaleCanvas(scale, scale);
  body.rotateCanvas(Math.PI / 2);
  for (const layer of asset.layers) drawLayer(body, layer, asset.accent);
  body.restore();
}

/** Convenience for call sites holding an id from untrusted preset data. */
export function drawCatalogAssetById(
  body: Phaser.GameObjects.Graphics,
  shape: string,
  worldRadius: number
): void {
  drawCatalogAsset(body, getVisualAsset(shape), worldRadius);
}

function resolveColor(color: VisualColor, accent: number): number {
  if (typeof color === "number") return color;
  if (color === "accent") return accent;
  return VISUAL_PALETTE[color];
}

function toVectors(points: readonly (readonly [number, number])[]): Phaser.Math.Vector2[] {
  return points.map(([x, y]) => new Phaser.Math.Vector2(x, y));
}

function rotatedRectPoints(
  x: number,
  y: number,
  w: number,
  h: number,
  angle: number
): Phaser.Math.Vector2[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfWidth = w / 2;
  const halfHeight = h / 2;
  return (
    [
      [-halfWidth, -halfHeight],
      [halfWidth, -halfHeight],
      [halfWidth, halfHeight],
      [-halfWidth, halfHeight]
    ] as const
  ).map(([px, py]) => new Phaser.Math.Vector2(x + px * cos - py * sin, y + px * sin + py * cos));
}

function drawLayer(body: Phaser.GameObjects.Graphics, layer: VisualLayer, accent: number): void {
  const hasFill = "fill" in layer;
  if (hasFill) body.fillStyle(resolveColor(layer.fill, accent), layer.alpha);
  body.lineStyle(layer.width, resolveColor(layer.stroke, accent), layer.alpha);

  switch (layer.t) {
    case "poly": {
      const points = toVectors(layer.pts);
      body.fillPoints(points, true, true);
      body.strokePoints(points, true, true);
      break;
    }
    case "rect":
      body.fillRect(layer.x, layer.y, layer.w, layer.h);
      body.strokeRect(layer.x, layer.y, layer.w, layer.h);
      break;
    case "rrect": {
      const points = rotatedRectPoints(layer.x, layer.y, layer.w, layer.h, layer.a);
      body.fillPoints(points, true, true);
      body.strokePoints(points, true, true);
      break;
    }
    case "circle":
      body.fillCircle(layer.x, layer.y, layer.r);
      body.strokeCircle(layer.x, layer.y, layer.r);
      break;
    case "ellipse":
      body.fillEllipse(layer.x, layer.y, layer.w, layer.h);
      body.strokeEllipse(layer.x, layer.y, layer.w, layer.h);
      break;
    case "line":
      body.lineBetween(layer.x1, layer.y1, layer.x2, layer.y2);
      break;
    case "arc":
      body.beginPath();
      body.arc(layer.x, layer.y, layer.r, layer.a0, layer.a1, false);
      body.strokePath();
      break;
  }
}
