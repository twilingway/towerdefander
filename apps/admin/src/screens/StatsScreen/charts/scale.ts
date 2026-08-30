/**
 * The arithmetic behind every chart on this screen, kept out of the components
 * because the console has no DOM test environment: a plain function is the only
 * thing that can be covered here.
 */

export interface Extent {
  readonly min: number;
  readonly max: number;
}

export interface Band {
  readonly start: number;
  readonly width: number;
}

/** Nothing is drawn below zero, so a chart of counts always starts at zero. */
export function extentOf(values: readonly number[], includeZero = true): Extent {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...finite, includeZero ? 0 : Number.POSITIVE_INFINITY);
  const max = Math.max(...finite, includeZero ? 0 : Number.NEGATIVE_INFINITY);
  if (max === min) return { min, max: min + 1 };
  return { min, max };
}

/** Maps a value onto a pixel span; the range is inverted for a top-left origin. */
export function project(value: number, extent: Extent, size: number): number {
  const span = extent.max - extent.min;
  if (span <= 0) return 0;
  return ((value - extent.min) / span) * size;
}

/** Round tick values that cover the extent, at most `count` of them. */
export function ticksOf(extent: Extent, count = 4): number[] {
  const span = extent.max - extent.min;
  if (span <= 0 || count < 1) return [extent.min];
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((size) => size >= rough);
  const chosen = step ?? magnitude * 10;
  const ticks: number[] = [];
  for (let value = Math.ceil(extent.min / chosen) * chosen; value <= extent.max; value += chosen) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks.length === 0 ? [extent.min] : ticks;
}

/** Evenly spaced slots with a gap, for categorical bars. */
export function bandsOf(count: number, size: number, gapShare = 0.25): Band[] {
  if (count <= 0) return [];
  const slot = size / count;
  const width = slot * (1 - gapShare);
  return Array.from({ length: count }, (_, index) => ({
    start: index * slot + (slot - width) / 2,
    width
  }));
}

/** An SVG polyline path through points already projected into chart space. */
export function linePath(points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  return points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
}

/** 0 at the coldest end, 1 at the hottest; used by the cell heat table. */
export function heatShare(value: number, extent: Extent): number {
  const span = extent.max - extent.min;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (value - extent.min) / span));
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}
