import type { GroupedBars } from "../aggregate.js";
import { bandsOf, extentOf, formatNumber, project, ticksOf, type Tone } from "./scale.js";

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = { top: 12, right: 12, bottom: 34, left: 44 };

const SERIES_CLASS = ["chart__mark--a", "chart__mark--b", "chart__mark--c", "chart__mark--d"];

/**
 * Grouped or stacked bars from plain series. Presentation only: every number it
 * draws was computed in `aggregate.ts`, which is where the tests live.
 */
export function BarChart({
  title,
  data,
  stacked = false,
  unit = "",
  tone,
  showValues = false
}: {
  readonly title: string;
  readonly data: GroupedBars;
  readonly stacked?: boolean;
  readonly unit?: string;
  /** Colours a bar by its own value instead of by which series it belongs to. */
  readonly tone?: (value: number) => Tone;
  readonly showValues?: boolean;
}) {
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const totals = data.categories.map((_, index) =>
    data.series.reduce((sum, series) => sum + (series.points[index] ?? 0), 0)
  );
  const extent = extentOf(stacked ? totals : data.series.flatMap(({ points }) => [...points]));
  const groups = bandsOf(data.categories.length, plotWidth);

  return (
    <figure className="chart">
      <figcaption className="chart__title">{title}</figcaption>
      <svg className="chart__canvas" viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`} role="img">
        {ticksOf(extent).map((tick) => {
          const y = PADDING.top + plotHeight - project(tick, extent, plotHeight);
          return (
            <g key={tick}>
              <line
                className="chart__grid"
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={y}
                y2={y}
              />
              <text className="chart__axis" x={PADDING.left - 6} y={y + 4} textAnchor="end">
                {formatNumber(tick)}
              </text>
            </g>
          );
        })}
        {data.categories.map((category, index) => {
          const group = groups[index];
          if (group === undefined) return null;
          const inner = stacked
            ? [{ start: 0, width: group.width }]
            : bandsOf(data.series.length, group.width, 0.1);
          let stackTop = 0;
          return (
            <g key={category}>
              {data.series.map((series, seriesIndex) => {
                const value = series.points[index] ?? 0;
                const slot = inner[stacked ? 0 : seriesIndex];
                if (slot === undefined) return null;
                const height = project(value, extent, plotHeight);
                const y = stacked
                  ? PADDING.top + plotHeight - project(stackTop + value, extent, plotHeight)
                  : PADDING.top + plotHeight - height;
                if (stacked) stackTop += value;
                const mark =
                  tone === undefined
                    ? (SERIES_CLASS[seriesIndex % SERIES_CLASS.length] ?? "")
                    : `chart__mark--${tone(value)}`;
                const x = PADDING.left + group.start + slot.start;
                return (
                  <g key={series.label} className={mark}>
                    <rect
                      className="chart__bar"
                      x={x}
                      y={y}
                      width={Math.max(1, slot.width)}
                      height={Math.max(0, height)}
                    >
                      <title>{`${category} · ${series.label}: ${formatNumber(value)}${unit}`}</title>
                    </rect>
                    {showValues && slot.width >= 12 && (
                      <text
                        className="chart__value"
                        x={x + slot.width / 2}
                        y={y - 3}
                        textAnchor="middle"
                      >
                        {formatNumber(value)}
                        {unit}
                      </text>
                    )}
                  </g>
                );
              })}
              <text
                className="chart__axis"
                x={PADDING.left + group.start + group.width / 2}
                y={HEIGHT - 14}
                textAnchor="middle"
              >
                {category}
              </text>
            </g>
          );
        })}
      </svg>
      {tone === undefined && (
        <ul className="chart__legend">
          {data.series.map((series, index) => (
            <li key={series.label} className={SERIES_CLASS[index % SERIES_CLASS.length]}>
              {series.label}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
