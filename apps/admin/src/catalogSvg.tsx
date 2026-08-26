import {
  VISUAL_PALETTE,
  type VisualAsset,
  type VisualColor,
  type VisualLayer
} from "@spaceship-defender/protocol";

/**
 * SVG mirror of `catalogRenderer.ts` in the display. The geometry is shared, the
 * output is not: the console draws into React, the run draws into Phaser. Both
 * apply the same two corrections — normalise by the asset's nominal radius, and
 * turn the nose-up art along +X — so a preview matches what a run will show.
 */

function toCss(color: VisualColor, accent: number): string {
  const value =
    typeof color === "number" ? color : color === "accent" ? accent : VISUAL_PALETTE[color];
  return `#${value.toString(16).padStart(6, "0")}`;
}

function pointsAttribute(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y]) => `${String(x)},${String(y)}`).join(" ");
}

function rotatedRectPoints(
  x: number,
  y: number,
  w: number,
  h: number,
  angle: number
): readonly (readonly [number, number])[] {
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
  ).map(([px, py]): readonly [number, number] => [
    x + px * cos - py * sin,
    y + px * sin + py * cos
  ]);
}

function arcPath(x: number, y: number, r: number, a0: number, a1: number): string {
  const startX = x + Math.cos(a0) * r;
  const startY = y + Math.sin(a0) * r;
  const endX = x + Math.cos(a1) * r;
  const endY = y + Math.sin(a1) * r;
  const largeArc = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${String(startX)} ${String(startY)} A ${String(r)} ${String(r)} 0 ${String(largeArc)} ${String(sweep)} ${String(endX)} ${String(endY)}`;
}

function LayerShape({ layer, accent }: { readonly layer: VisualLayer; readonly accent: number }) {
  const stroke = toCss(layer.stroke, accent);
  const strokeProps = {
    stroke,
    strokeWidth: layer.width,
    strokeOpacity: layer.alpha,
    strokeLinejoin: "round" as const
  };
  const fill = "fill" in layer ? toCss(layer.fill, accent) : "none";
  const fillProps = { fill, fillOpacity: "fill" in layer ? layer.alpha : 0 };

  switch (layer.t) {
    case "poly":
      return <polygon points={pointsAttribute(layer.pts)} {...fillProps} {...strokeProps} />;
    case "rect":
      return (
        <rect
          x={layer.x}
          y={layer.y}
          width={layer.w}
          height={layer.h}
          {...fillProps}
          {...strokeProps}
        />
      );
    case "rrect":
      return (
        <polygon
          points={pointsAttribute(rotatedRectPoints(layer.x, layer.y, layer.w, layer.h, layer.a))}
          {...fillProps}
          {...strokeProps}
        />
      );
    case "circle":
      return <circle cx={layer.x} cy={layer.y} r={layer.r} {...fillProps} {...strokeProps} />;
    case "ellipse":
      // Phaser takes full width and height; SVG takes radii.
      return (
        <ellipse
          cx={layer.x}
          cy={layer.y}
          rx={layer.w / 2}
          ry={layer.h / 2}
          {...fillProps}
          {...strokeProps}
        />
      );
    case "line":
      return <line x1={layer.x1} y1={layer.y1} x2={layer.x2} y2={layer.y2} {...strokeProps} />;
    case "arc":
      return (
        <path
          d={arcPath(layer.x, layer.y, layer.r, layer.a0, layer.a1)}
          fill="none"
          {...strokeProps}
        />
      );
  }
}

export interface CatalogAssetShapeProps {
  readonly asset: VisualAsset;
  /** World radius the silhouette should occupy, in the surrounding svg units. */
  readonly radius: number;
  /** Where the origin of the asset sits in the surrounding svg. */
  readonly center: number;
}

export function CatalogAssetShape({ asset, radius, center }: CatalogAssetShapeProps) {
  const scale = (radius / asset.radius) * asset.scaleHint;
  return (
    <g
      transform={`translate(${String(center)} ${String(center)}) rotate(90) scale(${String(scale)})`}
    >
      {asset.layers.map((layer, index) => (
        <LayerShape key={`layer-${String(index)}`} layer={layer} accent={asset.accent} />
      ))}
    </g>
  );
}
