import type { GroupedBars } from "../aggregate.js";
import { extentOf, formatNumber, linePath, project, ticksOf } from "./scale.js";

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = { top: 12, right: 12, bottom: 34, left: 44 };

const SERIES_CLASS = ["chart__mark--a", "chart__mark--b", "chart__mark--c", "chart__mark--d"];

/** One or many series over a shared categorical axis. */
export function LineChart({
  title,
  data,
  unit = ""
}: {
  readonly title: string;
  readonly data: GroupedBars;
  readonly unit?: string;
}) {
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const extent = extentOf(data.series.flatMap(({ points }) => [...points]));
  const step = data.categories.length <= 1 ? plotWidth : plotWidth / (data.categories.length - 1);
  const xOf = (index: number) =>
    PADDING.left + (data.categories.length <= 1 ? plotWidth / 2 : index * step);
  const yOf = (value: number) => PADDING.top + plotHeight - project(value, extent, plotHeight);
  const labelEvery = Math.max(1, Math.ceil(data.categories.length / 12));

  return (
    <figure className="chart">
      <figcaption className="chart__title">{title}</figcaption>
      <svg className="chart__canvas" viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`} role="img">
        {ticksOf(extent).map((tick) => (
          <g key={tick}>
            <line
              className="chart__grid"
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={yOf(tick)}
              y2={yOf(tick)}
            />
            <text className="chart__axis" x={PADDING.left - 6} y={yOf(tick) + 4} textAnchor="end">
              {formatNumber(tick)}
            </text>
          </g>
        ))}
        {data.series.map((series, seriesIndex) => (
          <g key={series.label} className={SERIES_CLASS[seriesIndex % SERIES_CLASS.length]}>
            <path
              className="chart__line"
              d={linePath(series.points.map((value, index) => ({ x: xOf(index), y: yOf(value) })))}
            />
            {series.points.map((value, index) => (
              <circle
                key={`${series.label}-${String(index)}`}
                className="chart__dot"
                cx={xOf(index)}
                cy={yOf(value)}
                r={2.5}
              >
                <title>{`${data.categories[index] ?? ""} · ${series.label}: ${formatNumber(value)}${unit}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {data.categories.map((category, index) =>
          index % labelEvery === 0 ? (
            <text
              key={category}
              className="chart__axis"
              x={xOf(index)}
              y={HEIGHT - 14}
              textAnchor="middle"
            >
              {category}
            </text>
          ) : null
        )}
      </svg>
      <ul className="chart__legend">
        {data.series.map((series, index) => (
          <li key={series.label} className={SERIES_CLASS[index % SERIES_CLASS.length]}>
            {series.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
